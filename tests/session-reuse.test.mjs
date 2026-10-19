import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerRegistry } from '../extensions/crew-session-hub.mjs';

function host() {
  const live = new Map(), persisted = new Map(); let creates = 0, resumes = 0;
  async function make(id, setup) {
    const callbacks = new Map();
    const agent = { id, status: 'idle', session: { id }, ctx: { on(name, cb) { const list = callbacks.get(name) ?? []; list.push(cb); callbacks.set(name, list); return () => { const at = list.indexOf(cb); if (at >= 0) list.splice(at, 1); }; } } };
    let pending = Promise.resolve();
    agent.whenIdle = () => pending;
    agent.followup = message => {
      agent.status = 'running';
      pending = new Promise(resolve => setTimeout(() => {
        const history = persisted.get(id) ?? []; history.push(message.content[0].text); persisted.set(id, history);
        for (const cb of callbacks.get('session/event') ?? []) {
          cb(agent.session, { type: 'step/start', data: { turn: history.length, step: 1 } });
          cb(agent.session, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: history.join('|') }] }, usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 100 } } });
          cb(agent.session, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
        }
        agent.status = 'idle'; resolve();
      }, 15));
    };
    await setup(agent.ctx); live.set(id, agent);
    return { agent, dispose: async () => { live.delete(id); } };
  }
  const ctx = {
    get: () => undefined,
    agents: { get: id => live.get(id), create: async options => { creates++; return make(options.sessionId, options.setup); }, resume: async options => { resumes++; return make(options.resumeSessionId, options.setup); } },
    sessionPersistence: { stat: async id => persisted.has(id) ? {} : undefined },
    sessions: { flush: async () => {} },
  };
  const registry = () => new WorkerRegistry(ctx, { publish() {} });
  return { ctx, registry, live, counts: () => ({ creates, resumes }) };
}
const spec = { cwd: '/private/tmp/crew-unit-test', conversationKey: '00000001-0000-0000-0000-000000000001', effort: 'off' };

test('same Codex conversation keeps one session and separates job results and usage', async () => {
  const h = host(), hub = h.registry();
  const first = await hub.spawn({ ...spec, task: 'alpha' });
  await assert.rejects(hub.spawn({ ...spec, task: 'overlap' }), /busy/);
  await first.promise;
  const second = await hub.spawn({ ...spec, task: 'beta' }); await second.promise;
  assert.equal(first.sessionId, second.sessionId); assert.notEqual(first.id, second.id);
  assert.equal(first.result, 'alpha'); assert.equal(second.result, 'alpha|beta');
  assert.equal(first.tokens.input, 10); assert.equal(second.tokens.input, 10);
  assert.equal(second.tokens.cacheRead, 100); assert.equal(second.continued, true);
  assert.deepEqual(h.counts(), { creates: 1, resumes: 0 });
});

test('another Codex thread gets another session and workspace writes stay serialized', async () => {
  const h = host(), hub = h.registry();
  const first = await hub.spawn({ ...spec, task: 'one' });
  await assert.rejects(hub.spawn({ ...spec, conversationKey: '00000002-0000-0000-0000-000000000002', task: 'two' }), /busy/);
  await first.promise;
  const second = await hub.spawn({ ...spec, conversationKey: '00000002-0000-0000-0000-000000000002', task: 'two' }); await second.promise;
  assert.notEqual(first.sessionId, second.sessionId); assert.equal(second.result, 'two');
});

test('after host runtime is gone the same key resumes persisted session', async () => {
  const h = host(); const first = await h.registry().spawn({ ...spec, task: 'remember' }); await first.promise;
  h.live.clear(); const hub = h.registry();
  const second = await hub.spawn({ ...spec, task: 'recall' }); await second.promise;
  assert.equal(first.sessionId, second.sessionId); assert.equal(second.continued, true);
  assert.equal(second.result, 'remember|recall'); assert.deepEqual(h.counts(), { creates: 1, resumes: 1 });
});

test('manual active Desktop turn and malformed conversation key are rejected', async () => {
  const h = host(), hub = h.registry(); const first = await hub.spawn({ ...spec, task: 'one' }); await first.promise;
  h.live.get(first.sessionId).status = 'running';
  await assert.rejects(hub.spawn({ ...spec, task: 'two' }), /manual turn/);
  await assert.rejects(hub.spawn({ ...spec, conversationKey: '../invalid', task: 'no' }), /invalid/);
});

test('stale clients and empty tasks cannot create an unbound or billable session', async () => {
  const h = host(), hub = h.registry();
  await assert.rejects(hub.spawn({ task: 'non-empty', cwd: spec.cwd }), /connection is stale/);
  await assert.rejects(hub.spawn({ ...spec, task: '   ' }), /must not be empty/);
  assert.equal(hub.jobs.size, 0); assert.deepEqual(h.counts(), { creates: 0, resumes: 0 });
});

test('after registry restart an idle session opened by Desktop is adopted', async () => {
  const h = host(); const first = await h.registry().spawn({ ...spec, task: 'remember' }); await first.promise;
  const second = await h.registry().spawn({ ...spec, task: 'recall' }); await second.promise;
  assert.equal(second.sessionId, first.sessionId); assert.equal(second.result, 'remember|recall');
  assert.equal(second.continued, true); assert.deepEqual(h.counts(), { creates: 1, resumes: 0 });
  assert.equal(first.tokens.input, 10); assert.equal(second.tokens.input, 10);
});

test('cancelling while session setup is pending never submits the cancelled prompt', async () => {
  const h = host(), hub = h.registry();
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const create = h.ctx.agents.create;
  h.ctx.agents.create = async options => { entered(); await gate; return create(options); };
  const job = await hub.spawn({ ...spec, task: 'must never reach the model' });
  await ready;
  const cancelled = hub.cancel(job.id);
  release(); await cancelled;
  assert.equal(job.status, 'cancelled'); assert(job.endedAt);
  assert.equal(job.tokens.input, 0); assert.equal(job.result, null);
  const next = await hub.spawn({ ...spec, task: 'safe follow-up' }); await next.promise;
  assert.equal(next.result, 'safe follow-up');
});
