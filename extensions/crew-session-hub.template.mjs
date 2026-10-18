import { createBridgeTransport } from '__BRIDGE_TRANSPORT_URL__';
// Derived from DSH Crew rc.14 (c) 2026 ZSeven-W, MIT; see THIRD_PARTY_NOTICES.md.
// Bridge-owned Desktop transport and persistent per-Codex-chat sessions.
// DSH host plugin: workers-hub.
// Runs DeepSeek workers as first-class in-host agent sessions (visible in the
// Desktop session list), and exposes a narrow loopback jobs API for Codex.
// Crew's settings installer, process control and multimodal routes are omitted.

import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { isAbsoluteCwd, canonicalCwd } from '__CREW_SRC_URL__/paths.mjs';
import { createShardWriter, readMergedStatus } from '__CREW_SRC_URL__/status-shard.mjs';
import { procAlive, killWorkerProcess, parsePid, ProcKillRefused } from '__CREW_SRC_URL__/proc-kill.mjs';
import { installWorkerQuestionHandoff } from '__CREW_SRC_URL__/worker-question.mjs';
import { probeProvider } from '__CREW_SRC_URL__/provider-probe.mjs';

// No @deepseek-ai imports here on purpose: this plugin is loaded into the
// profile realm, and importing our own package copies would create duplicate
// module realms (symbol identity mismatches in the tool runtime). Everything
// below is either plain data or inlined logic that only touches ctx APIs.

/** Inlined from @deepseek-ai/dsh-agent model-selection.ts (same semantics). */
function installModelSelection(agentCtx, selection) {
  agentCtx.on('system-prompt/assemble', async (_assembly, _cause, next) => {
    const selected = selection.current;
    const assembled = await next();
    selection.assembled = selected;
    if (selected === undefined) return assembled;
    return { ...assembled, variables: { ...assembled.variables, provider: selected.provider, model: selected.model } };
  });
  agentCtx.on('agent/request', async (_payload, next) => {
    const resolved = await next();
    const selected = selection.assembled;
    if (selected === undefined) return resolved;
    const { reasoningEffort: _inherited, ...rest } = resolved;
    return {
      ...rest, provider: selected.provider, model: selected.model,
      ...(selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort }),
    };
  });
}

/** Inlined shape of createUserMessage (role + fresh id, frozen). */
function userMessage(text) {
  return Object.freeze({
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  });
}

/**
 * The rejection a worker's ask_user_question receives. Shaped like the host's
 * UserQuestionError (name + code) so the seam restores it as one and the
 * model sees the message, the same way the host answers a question from a
 * child agent that has no human either (DELEGATED_CALLER).
 */
export function unattendedQuestion() {
  const error = new Error(
    'no one is attending this dsh-crew worker session, so a question cannot be answered and must not be waited on. '
    + 'Stop and put the unresolved question in your final message so the orchestrator can obtain the required answer or approval. '
    + 'An unanswered question grants no permission; never select an option automatically.',
  );
  error.name = 'UserQuestionError';
  error.code = 'UNATTENDED_WORKER';
  return error;
}

export const name = 'codex-desktop-session-hub';
export const inject = ['agents', 'sessions', 'agentDefaultModel', 'tools', 'llm', 'attachments', 'sessionPersistence'];

// Optional: the host's durable locale preference seeds server-side strings
// before the panel is ever opened. Absent preference means "browser decides".
function seedLangFromHost(ctx) {
  try {
    const pref = ctx.settings?.get?.('locale')?.preference;
    if (pref) setLang(pref);
  } catch { /* settings service absent or shaped differently — keep the default */ }
}

import { setLang } from '__CREW_SRC_URL__/i18n.mjs';

const ROUTE_BASE = '/_dsh/dsh-crew';
// Tier -> {provider, model}. The defaults live in tier-binding.mjs; the
// caller may override per dispatch, and the hub's own config is the fallback
// when it does not (the same shape the preset lookup below uses).
import { describeBindings, resolveTierBinding, TIERS } from '__CREW_SRC_URL__/tier-binding.mjs';
const CONFIG_DIR = join(homedir(), '.config', 'dsh-crew');

// ---------- job registry ----------

/** Bounded task preview with a visible truncation marker (PATTERN-AUDIT D3:
// a silently truncated task reads like the whole brief in status views). */
function clipTask(task, cap = 300) {
  return task.length > cap ? task.slice(0, cap) + '…' : task;
}

export class WorkerRegistry {
  constructor(ctx, shard = createShardWriter('hub')) {
    this.ctx = ctx;
    this.jobs = new Map();
    this.nextId = 1;
    this.conversationSlots = new Map();
    this.shard = shard;
  }

  view(job, withResult = false) {
    const v = {
      id: job.id, sessionId: job.sessionId, tier: job.tier, model: job.model, provider: job.provider,
      conversationKey: job.conversationKey, continued: job.continued,
      effort: job.effort, status: job.status, source: job.source, task: clipTask(job.task),
      cwd: job.cwd, turn: job.turn, step: job.step, currentTool: job.currentTool,
      toolCalls: job.toolCalls, tokens: job.tokens, mode: 'hub',
      startedAt: job.startedAt, endedAt: job.endedAt,
      ...(job.questions === undefined ? {} : { questions: job.questions }),
    };
    if (withResult) {
      v.result = job.result; v.error = job.error; v.stopReason = job.stopReason;
      v.reasonDetail = job.reasonDetail;
    }
    return v;
  }

  publish() {
    this.shard.publish([...this.jobs.values()].map((j) => this.view(j)));
  }

  async spawn({ task, tier = 'flash', effort = 'max', cwd, source = 'api', provider, model, preset, conversationKey }) {
    tier = 'flash'; effort = 'max'; provider = 'deepseek-official'; model = 'deepseek-flash';
    if (typeof task !== 'string' || !task.trim()) throw new Error('Task must not be empty');
    if (conversationKey === undefined) throw new Error('Codex MCP connection is stale: reconnect dsh_desktop_crew and pass conversation_id. No new session was created.');
    if (!TIERS.includes(tier)) throw new Error(`unknown tier "${tier}"`);
    // An explicit {provider, model} from the caller wins (the MCP process owns
    // session-level overrides, exactly as it does for presets); otherwise the
    // hub's own stored config decides, and failing that the tier default.
    const bound = resolveTierBinding(tier, this.getConfig?.() ?? {});
    const resolvedProvider = typeof provider === 'string' && provider.trim() !== '' ? provider.trim() : bound.provider;
    const resolvedModel = typeof model === 'string' && model.trim() !== '' ? model.trim() : bound.model;
    if (!['off', 'high', 'max'].includes(effort)) throw new Error(`unknown effort "${effort}"`);
    // Accept POSIX, Windows drive (D:\x, C:/x) and UNC (\\srv\share) roots.
    if (!isAbsoluteCwd(cwd)) throw new Error('cwd must be an absolute path');
    // One canonical form for the job, the advisory lock and the workspace
    // lookup: D:/x and D:\x must map to the same workspace on Windows.
    const cwdPath = canonicalCwd(cwd);
    await this.ctx.get('loader')?.await();

    const id = `hub-${this.nextId++}-${Date.now().toString(36)}`;
    let sessionId = `session-${randomUUID()}`;
    let slot;
    if (conversationKey !== undefined) {
      if (typeof conversationKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(conversationKey)) throw new Error('invalid conversation key');
      const digest = createHash('sha256').update(JSON.stringify(['codex-desktop', conversationKey, cwdPath])).digest('hex').slice(0, 32);
      sessionId = `session-${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20)}`;
      slot = this.conversationSlots.get(sessionId);
      if (slot?.activeJob && !slot.activeJob.endedAt) throw new Error('Desktop conversation is busy; wait for its current job');
      if ([...this.jobs.values()].some(j => j.cwd === cwdPath && !j.endedAt)) throw new Error('Desktop workspace is busy; writing turns must be serialized');
      const live = this.ctx.agents.get(sessionId);
      if (live?.status === 'running') throw new Error('Desktop conversation has an active manual turn');
      if (!slot) { slot = {}; this.conversationSlots.set(sessionId, slot); }
    }
    const job = {
      id, sessionId, conversationKey, continued: Boolean(slot?.handle), tier, model: resolvedModel, provider: resolvedProvider, effort, task, source, cwd: cwdPath,
      status: 'running', turn: 0, step: 0, currentTool: null, toolCalls: 0,
      tokens: { input: 0, output: 0, reasoning: 0 },
      startedAt: new Date().toISOString(), endedAt: null,
      result: null, error: null, stopReason: null, handle: null, waiters: [],
      texts: [],
    };
    this.jobs.set(id, job);
    if (slot) slot.activeJob = job;

    const selection = { provider: resolvedProvider, model: resolvedModel, reasoningEffort: effort };
    const presets = this.ctx.get('agentPresets');
    const cfg = this.getConfig?.() ?? {};
    const wanted = preset ?? (tier === 'flash' ? cfg.preset_flash : cfg.preset_pro);
    const presetId = presets === undefined
      ? undefined
      : (await presets.resolve(!wanted || wanted === 'default' ? undefined : wanted)).id;

    const firstJob = job;
    const turnDisposers = [];
    const onEvent = (session, event) => {
      const job = slot?.activeJob ?? firstJob;
      if (job.status !== 'running') return;
      switch (event.type) {
        case 'step/start':
          job.turn = event.data?.turn ?? job.turn;
          job.step = event.data?.step ?? job.step;
          break;
        case 'tool/call': job.currentTool = event.data?.name ?? null; job.toolCalls += 1; break;
        case 'tool/result': job.currentTool = null; break;
        case 'assistant/message': {
          const u = event.data?.usage;
          if (u) {
            job.tokens.input += u.inputTokens ?? 0;
            job.tokens.output += u.outputTokens ?? 0;
            job.tokens.reasoning += u.reasoningTokens ?? 0;
            if (u.cacheReadTokens !== undefined) job.tokens.cacheRead = (job.tokens.cacheRead ?? 0) + u.cacheReadTokens;
            if (u.cacheWriteTokens !== undefined) job.tokens.cacheWrite = (job.tokens.cacheWrite ?? 0) + u.cacheWriteTokens;
          }
          const text = (event.data?.message?.content ?? [])
            .filter((c) => c?.type === 'text').map((c) => c.text).join('');
          if (text) job.texts.push(text);
          break;
        }
        case 'turn/end':
          job.stopReason = event.data?.reason?.kind ?? null;
          job.reasonDetail = event.data?.reason;
          break;
      }
      this.publish();
    };

    const run = async () => {
      const setup = async (agentCtx, mountPreset = true) => {
        const trackedCtx = { on: (...args) => { const off = agentCtx.on(...args); if (typeof off === 'function') turnDisposers.push(off); return off; } };
        installModelSelection(trackedCtx, { current: selection, assembled: undefined });
        if (mountPreset && presets !== undefined) await presets.mount(agentCtx, presetId);
        // The listener belongs to the session; its target changes each turn.
        const currentJob = new Proxy(job, {
          get: (_target, key) => (slot?.activeJob ?? job)[key],
          set: (_target, key, value) => { (slot?.activeJob ?? job)[key] = value; return true; },
        });
        installWorkerQuestionHandoff(trackedCtx, currentJob, () => this.publish());
        trackedCtx.on('session/event', onEvent);
        trackedCtx.on('agent/error', (payload) => {
          const target = slot?.activeJob ?? job;
          if (target.status !== 'needs_input') target.error = payload?.error?.message ?? String(payload?.error);
        });
      };
      let handle = slot?.handle;
      if (handle && this.ctx.agents.get(sessionId) !== handle.agent) handle = undefined;
      if (handle) {
        if (slot.presetId !== presetId) throw new Error('Preset changed: keep the session preset stable or explicitly start another conversation');
        await setup(handle.agent.ctx, false);
      } else if (slot && this.ctx.agents.get(sessionId)) {
        const live = this.ctx.agents.get(sessionId);
        if (live.session.header?.cwd && live.session.header.cwd !== cwdPath) throw new Error('Desktop session workspace mismatch');
        if (live.session.header?.agentPreset && live.session.header.agentPreset !== presetId) throw new Error('Desktop session preset mismatch');
        handle = { agent: live, dispose: async () => { live.cancel({ kind: 'user' }); await live.whenIdle(); } };
        await setup(live.ctx, false);
        job.continued = true;
      } else if (slot && await this.ctx.sessionPersistence.stat(sessionId)) {
        handle = await this.ctx.agents.resume({ resumeSessionId: sessionId,
          agentOptions: { provider: selection.provider, model: selection.model }, setup });
        job.continued = true;
      } else handle = await this.ctx.agents.create({
        sessionId,
        meta: { cwd: cwdPath, ...(presetId === undefined ? {} : { agentPreset: presetId }) },
        agentOptions: { provider: selection.provider, model: selection.model },
        setup,
      });
      job.handle = handle;
      if (slot) { slot.handle = handle; slot.presetId = presetId; }
      if (job.status === 'needs_input') { await handle.dispose(); return; }
      try {
        // Group the worker session under the workspace of its cwd; create the
        // workspace when none exists yet (resolveByPath is exact-match, so a
        // job cwd never inherits a parent directory's workspace).
        const registry = this.ctx.get('workspaceRegistry');
        if (registry !== undefined) {
          const ws = (await registry.resolveByPath(cwdPath)) ?? (await registry.create(cwdPath));
          await ws.attachSession(sessionId);
        }
      } catch (err) {
        this.ctx.logger?.warn?.(`dsh-crew: workspace attach failed for ${cwdPath}: ${err?.message ?? err}`);
      }
      await handle.agent.whenIdle();
      handle.agent.followup(userMessage(task));
      await handle.agent.whenIdle();
      if (job.status === 'running') {
        job.result = job.texts.at(-1) ?? '';
        job.status = job.stopReason === 'completed' ? 'done' : 'failed';
      }
      if (job.status === 'failed' && !job.error) job.error = `turn ended: ${job.stopReason ?? 'unknown'}`;
      await this.ctx.sessions.flush(handle.agent.session);
    };

    job.promise = run()
      .catch((err) => {
        if (job.status === 'running') job.status = 'failed';
        job.error = job.error ?? (err?.message ?? String(err));
      })
      .finally(() => {
        for (const off of turnDisposers.splice(0)) { try { off(); } catch {} }
        job.endedAt = new Date().toISOString();
        job.currentTool = null;
        this.publish();
        for (const w of job.waiters.splice(0)) w();
      });

    this.publish();
    return job;
  }

  async wait(id, timeoutMs) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status !== 'running') return job;
    await Promise.race([
      new Promise((res) => job.waiters.push(res)),
      timeoutMs > 0 ? new Promise((res) => setTimeout(res, timeoutMs)) : Promise.resolve(),
    ]);
    return job;
  }

  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (job.status === 'running') {
      job.status = 'cancelled';
      job.error = 'cancelled by request';
      try { await job.handle?.dispose(); } catch {}
      this.publish();
    }
    return job;
  }

  async dispose() {
    for (const job of this.jobs.values()) {
      if (job.status === 'running') { try { await job.handle?.dispose(); } catch {} }
    }
  }
}

// ---------- loopback route helpers (pattern from dsh-noema) ----------

function isIpv4Loopback(a) { return /^127(\.\d{1,3}){3}$/.test(a); }
function isLoopbackAddress(address) {
  if (!address) return false;
  const n = address.toLowerCase().split('%', 1)[0];
  if (n === '::1' || isIpv4Loopback(n)) return true;
  if (!n.startsWith('::ffff:')) return false;
  return isIpv4Loopback(n.slice(7));
}
function isLoopbackRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  const host = (req.headers.host ?? '').split(':')[0].toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || isIpv4Loopback(host);
}
function sendJson(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'cross-origin-resource-policy': 'same-origin',
    ...headers,
  });
  res.end(body);
}
/**
 * The panel is the authority on the active locale (DSH's setting may be unset,
 * leaving it to the browser), so it tags requests with ?lang= / body.lang and
 * the hub adopts it. Conversation-side paths with no request behind them —
 * pasted-image transcription — then follow the same language.
 */
function adoptLang(value) {
  if (value === 'zh' || value === 'en') setLang(value);
}

/**
 * `?wait` as a non-negative integer second count. Absent/empty means 0;
 * anything non-numeric, fractional or negative is null (HTTP 400) — a
 * garbage wait must be an error, never a silent no-wait (PATTERN-AUDIT D2:
 * `?wait=abc` used to return immediately with 200 OK because
 * Math.min(NaN, 600) is NaN and the wait promise resolved instantly).
 */
export function parseWaitSeconds(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (!/^\d+$/.test(String(value))) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

async function readBody(req, limit = 64 * 1024) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) throw new Error('payload too large');
  }
  return body.trim() === '' ? {} : JSON.parse(body);
}

// ---------- plugin entry ----------

export async function apply(ctx, config = {}) {
  seedLangFromHost(ctx);
  const hub = new WorkerRegistry(ctx);
  const { readGlobalConfig } = await import('__CREW_SRC_URL__/install/install.mjs');
  hub.getConfig = () => readGlobalConfig();
  const webServer = await createBridgeTransport(config.port ?? 19387);
  const disposers = [];
  try {
    disposers.push(webServer.register({
      kind: 'exact', path: `${ROUTE_BASE}/worker-probe`,
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
        if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'POST only' }, { allow: 'POST' });
        if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) return sendJson(res, 415, { ok: false, error: 'application/json required' });
        try {
          const body = await readBody(req);
          if (typeof body.provider !== 'string' || body.provider.trim() === '' || typeof body.model !== 'string' || body.model.trim() === '') return sendJson(res, 400, { ok: false, error: 'provider and model required' });
          const result = await probeProvider(ctx.llm, { provider: body.provider.trim(), model: body.model.trim() });
          return sendJson(res, 200, { ok: true, result });
        } catch { return sendJson(res, 400, { ok: false, error: 'invalid probe request' }); }
      },
    }));

    disposers.push(webServer.register({
      kind: 'exact', path: `${ROUTE_BASE}/ping`,
      handler: (req, res) => sendJson(res, 200, { ok: true, service: 'dsh-crew-hub', sessionReuse: true, extensionVersion: 4, implementation: 'bundled-desktop-bridge', crewPluginRequired: false }),
    }));

    disposers.push(webServer.register({
      kind: 'prefix', path: `${ROUTE_BASE}/jobs`,
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
        try {
          const url = new URL(req.url, 'http://localhost');
          const parts = url.pathname.slice(`${ROUTE_BASE}/jobs`.length).split('/').filter(Boolean);
          if (req.method === 'GET' && parts.length === 0) {
            // Machine-wide view: this hub's live jobs plus fresh shards from
            // other writers (standalone MCP sessions, other hub instances).
            const own = [...hub.jobs.values()].map((j) => ({ ...hub.view(j), origin: hub.shard.writer }));
            const foreign = readMergedStatus({ excludeWriter: hub.shard.writer });
            return sendJson(res, 200, { ok: true, jobs: [...own, ...foreign] });
          }
          if (req.method === 'GET' && parts.length === 1) {
            const wait = parseWaitSeconds(url.searchParams.get('wait'));
            if (wait === null) return sendJson(res, 400, { ok: false, error: 'wait must be a non-negative integer number of seconds' });
            const job = await hub.wait(parts[0], Math.min(wait, 600) * 1000);
            if (!job) return sendJson(res, 404, { ok: false, error: 'no such job' });
            return sendJson(res, 200, { ok: true, job: hub.view(job, true) });
          }
          if (req.method === 'POST' && parts.length === 0) {
            const payload = await readBody(req);
            const job = await hub.spawn(payload);
            return sendJson(res, 200, { ok: true, job: hub.view(job) });
          }
          if (req.method === 'POST' && parts.length === 2 && parts[1] === 'cancel') {
            const job = await hub.cancel(parts[0]);
            if (!job) return sendJson(res, 404, { ok: false, error: 'no such job' });
            return sendJson(res, 200, { ok: true, job: hub.view(job, true) });
          }
          return sendJson(res, 404, { ok: false, error: 'unknown jobs endpoint' });
        } catch (err) {
          return sendJson(res, 400, { ok: false, error: err?.message ?? String(err) });
        }
      },
    }));

    disposers.push(webServer.register({
      kind: 'exact', path: `${ROUTE_BASE}/providers`,
      handler: async (req, res) => {
        if (!isLoopbackRequest(req)) return sendJson(res, 403, { ok: false, error: 'loopback only' });
        try {
          const { readGlobalConfig } = await import('__CREW_SRC_URL__/install/install.mjs');
          const providers = ctx.llm.listProviders().map((p) => ({ id: p.id, name: p.name ?? p.id }));
          return sendJson(res, 200, {
            ok: true,
            providers,
            bindings: describeBindings(readGlobalConfig()),
          });
        } catch (err) {
          return sendJson(res, 500, { ok: false, error: err?.message ?? String(err) });
        }
      },
    }));


  } catch (error) {
    await webServer.close();
    await hub.dispose();
    throw error;
  }
  ctx.logger?.info?.('Codex Desktop bridge ready; separate Crew plugin is not required');
  return async () => {
    for (const dispose of disposers.reverse()) { try { dispose(); } catch {} }
    await webServer.close();
    await hub.dispose();
  };
}
