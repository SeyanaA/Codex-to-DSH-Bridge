import { createServer } from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { startSessionProxy } from '../scripts/session-proxy.mjs';

test('proxy injects only the explicit current call key and blocks unrelated dispatch', async t => {
  let active, received;
  const host = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received = { path: req.url, body: raw ? JSON.parse(raw) : null };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}');
  });
  await new Promise(resolve => host.listen(0, '127.0.0.1', resolve));
  const proxy = await startSessionProxy(`http://127.0.0.1:${host.address().port}`, () => active);
  t.after(() => { proxy.close(); host.close(); });
  const dispatch = headers => fetch(proxy.url + '/_dsh/dsh-crew/jobs', { method: 'POST', body: '{"task":"hello"}', headers: { 'content-type': 'application/json', ...headers } });
  assert.equal((await dispatch()).status, 400); assert.equal(received, undefined);
  active = { params: { name: 'dsh_spawn_worker' }, conversationKey: '01a12383-e2c4-7ca2-9f66-b80c299ca0df' };
  assert.equal((await dispatch()).status, 200); assert.equal(received.body.conversationKey, active.conversationKey);
  active.conversationKey = '01a13d22-d342-7d02-98a2-1f1ec0b534df';
  await dispatch(); assert.equal(received.body.conversationKey, active.conversationKey);
  const before = received;
  active.conversationKey = '01a13e79-b4db-7863-a678-88b094f41f41f1b';
  assert.equal((await dispatch()).status, 400); assert.equal(received, before);
  assert.equal((await dispatch({ origin: 'https://example.com' })).status, 400);
  assert.equal((await fetch(proxy.url + '/unrelated')).status, 400);
});
