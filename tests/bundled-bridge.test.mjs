import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { installBundledCrew, unpackCrew } from '../scripts/bundled-crew.mjs';
import { createBridgeTransport } from '../scripts/bridge-transport.mjs';
import { apply } from '../extensions/crew-session-hub.mjs';

async function availablePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
test('bundled source installs without an external plugin and detects corrupted cache', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-bundle-'));
  try {
    const crew = installBundledCrew(directory);
    assert(fs.readFileSync(path.join(crew, 'LICENSE'), 'utf8').includes('ZSeven-W'));
    assert.equal(installBundledCrew(directory), crew);
    fs.appendFileSync(path.join(crew, 'src/paths.mjs'), '\n// unexpected edit');
    assert.throws(() => installBundledCrew(directory), /已被修改/);
    assert.throws(() => unpackCrew(Buffer.from('untrusted'), directory), /校验失败/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('bridge runs without host webServer, blocks browser traffic, and releases its port', async () => {
  const port = await availablePort();
  const stop = await apply({ get: () => undefined, settings: undefined, logger: {}, llm: { listProviders: () => [] } }, { port });
  const base = `http://127.0.0.1:${port}/_dsh/dsh-crew`;
  try {
    const info = await (await fetch(base + '/ping')).json();
    assert.equal(info.crewPluginRequired, false);
    assert.equal(info.implementation, 'bundled-desktop-bridge');
    assert.equal((await fetch(base + '/ping', { headers: { origin: 'http://evil.example' } })).status, 403);
    const badHost = await new Promise((resolve, reject) => {
      const request = http.get(base + '/ping', { headers: { host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
      request.on('error', reject);
    });
    assert.equal(badHost, 403);
    assert.equal((await fetch(base + '/install', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
    assert.equal((await fetch(base + '/proc-kill', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
    assert.equal((await fetch(base + '/jobs', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    await assert.rejects(createBridgeTransport(port), /EADDRINUSE/);
    assert.equal((await fetch(base + '/ping')).status, 200);
  } finally { await stop(); }
  const again = await createBridgeTransport(port); await again.close();
});
