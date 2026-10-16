// Desktop-only stdio adapter. All worker turns stay in the visible Crew Hub.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import os from 'node:os';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { startSessionProxy } from './session-proxy.mjs';
import { conversationIdPattern, isConversationId } from './session-id.mjs';
import { fixedModelPolicy, lockDispatch } from './model-policy.mjs';
import { connectionSettings, localAddress } from './desktop-settings.mjs';
import { ensureDesktop } from './desktop-runtime.mjs';

const settings = connectionSettings();
const legacyWeb = process.env.DSH_BRIDGE_SURFACE === 'legacy-web';
const base = legacyWeb ? localAddress(process.env.DSHPLUGIN_CREW_HUB || 'http://127.0.0.1:3080') : settings.hub;
const url = new URL(base);
if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash) {
  console.error('Desktop Crew 地址必须是本机 HTTP 地址。'); process.exit(1);
}
const dshHome = settings.dshHome;
const entry = path.join(dshHome, 'profiles', legacyWeb ? 'web' : 'desktop', 'node_modules', '@zseven-w', 'dsh-crew', 'lib', 'server.mjs');
try {
  if (!existsSync(entry)) throw new Error('DSH Desktop 尚未安装 Crew 插件。');
  if (!legacyWeb) await ensureDesktop();
  const response = await fetch(`${base.replace(/\/$/, '')}/_dsh/dsh-crew/ping`, { signal: AbortSignal.timeout(4000) });
  const info = await response.json();
  if (!response.ok || info.service !== 'dsh-crew-hub' || (!legacyWeb && info.sessionReuse !== true)) throw new Error('Desktop Crew 会话复用扩展未就绪。');
} catch {
  console.error(legacyWeb ? '显式选择的旧 Web Crew 未就绪，请检查旧 Web 配置；不会改用 Desktop 或独立 Agent。' : '请先打开 DSH Desktop 并启用 Crew；当前 Desktop 连接未就绪。不会回落到后台独立 Agent。');
  process.exit(1);
}

const secret = randomUUID();
let serial = 0;
let active = null;
const waiting = [];
const initialization = new Set();
const toolLists = new Set();
const proxy = await startSessionProxy(base.replace(/\/$/, ''), () => active?.original);
const child = spawn(process.execPath, [entry], {
  env: { ...process.env, DSHPLUGIN_CREW_HUB: proxy.url }, stdio: ['pipe', 'pipe', 'pipe'],
});
function emit(packet) { process.stdout.write(JSON.stringify(packet) + '\n'); }
function forward(packet) { const { conversationKey, ...wire } = packet; child.stdin.write(JSON.stringify(wire) + '\n'); }
function refuse(packet, message) {
  emit({ jsonrpc: '2.0', id: packet.id, result: { isError: true, content: [{ type: 'text', text: message }] } });
}
function pump() {
  if (active || !waiting.length) return;
  const original = waiting.shift();
  const id = `desktop-hub-config-${secret}-${++serial}`;
  active = { original, id, stage: 'config' };
  // Use the upstream public tool; never modify its files or global preferences.
  forward({ jsonrpc: '2.0', id, method: 'tools/call', params: {
    name: 'dsh_worker_config', arguments: fixedModelPolicy,
  } });
}
createInterface({ input: process.stdin }).on('line', line => {
  let packet;
  try { packet = JSON.parse(line); } catch { console.error('MCP 输入不是有效 JSON。'); return; }
  if (packet.method === 'initialize') initialization.add(packet.id);
  if (packet.method === 'tools/list') toolLists.add(packet.id);
  if (packet.method === 'notifications/cancelled') {
    const target = packet.params?.requestId;
    const position = waiting.findIndex(item => item.id === target);
    if (position >= 0) waiting.splice(position, 1);
    if (active?.original.id === target && active.stage === 'config') active.cancelled = true;
  }
  if (packet.method === 'tools/call' && packet.id !== undefined) {
    if (['dsh_spawn_worker', 'dsh_run_worker'].includes(packet.params?.name)) {
      const args = packet.params.arguments ?? {};
      if (!isConversationId(args.conversation_id)) {
        refuse(packet, '请传入当前 Codex 会话 ID 作为 conversation_id，以复用同一个 Desktop 会话。'); return;
      }
      packet.conversationKey = args.conversation_id;
      const { conversation_id, ...rest } = args;
      try { packet.params.arguments = lockDispatch(rest); }
      catch (error) { refuse(packet, error.message); return; }
    }
    waiting.push(packet); pump();
  } else forward(packet);
});
createInterface({ input: child.stdout }).on('line', line => {
  let packet;
  try { packet = JSON.parse(line); } catch { console.error('上游 MCP 输出不是有效 JSON。'); return; }
  if (active && packet.id === active.id) {
    if (active.cancelled) { active = null; pump(); return; }
    if (packet.error || packet.result?.isError) {
      refuse(active.original, '无法确认 Desktop Hub 模式，任务没有派发。'); active = null; pump(); return;
    }
    if (active.original.params?.name === 'dsh_worker_config') {
      active.original.params.arguments = { ...active.original.params.arguments, ...fixedModelPolicy };
    }
    active.stage = 'call';
    forward(active.original); return;
  }
  if (initialization.has(packet.id) && packet.result) {
    initialization.delete(packet.id);
    packet.result.instructions = 'User model policy: ONLY DeepSeek-V41-Flash (deepseek-official/deepseek-flash), reasoning MAX. Pro requests are clamped to Flash; automatic escalation is disabled. Keep Desktop open and use visible Hub mode only. Every dispatch must provide conversation_id equal to the CURRENT Codex thread ID (CODEX_THREAD_ID); the same ID and cwd reuse one durable Desktop session. Never invent IDs or create replacement sessions to bypass errors. Serialize tasks, poll each result and review actual changes. Manual Desktop messages do not wake Codex automatically.';
    if (legacyWeb) packet.result.instructions = 'Explicit legacy Web mode at the configured localhost address, not Desktop and never an automatic fallback. Model policy remains DeepSeek-V41-Flash (deepseek-official/deepseek-flash), reasoning MAX, no Pro escalation. Every dispatch must include the exact current CODEX_THREAD_ID as conversation_id. Original Web Crew may create a new session per task; persistent same-session continuation requires Desktop mode. Poll results and review actual changes.';
  }
  if (toolLists.delete(packet.id) && packet.result?.tools) {
    for (const tool of packet.result.tools) if (['dsh_spawn_worker', 'dsh_run_worker'].includes(tool.name)) {
      tool.inputSchema.properties.conversation_id = { type: 'string', pattern: conversationIdPattern, description: 'Required: copy the exact current CODEX_THREAD_ID; it must be a canonical lowercase UUID. Do not retype or alter it. Same conversation_id and cwd continue the same durable DSH Desktop session. Each task still has its own job ID. Never use a shared constant across chats.' };
      tool.inputSchema.required = [...new Set([...(tool.inputSchema.required ?? []), 'conversation_id'])];
      tool.description = (legacyWeb ? 'Explicit legacy Web mode; do not promise same-session continuation. ' : 'Continue the Desktop session bound to conversation_id; serialize all turns for it. ') + tool.description;
    }
  }
  emit(packet);
  if (active?.stage === 'call' && packet.id === active.original.id) { active = null; pump(); }
});
const mask = value => String(value).replace(/([?&](?:token|access_token|key)=)[^\s&#]+/gi, '$1[redacted]').replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]');
createInterface({ input: child.stderr }).on('line', line => console.error(mask(line)));
child.on('error', () => { console.error('Desktop Crew MCP 启动失败。'); process.exit(1); });
child.on('exit', code => { proxy.close(); process.exit(code ?? 1); });
const stop = () => { proxy.close(); child.kill('SIGTERM'); };
process.stdin.on('end', stop); process.on('SIGTERM', stop); process.on('SIGINT', stop);
