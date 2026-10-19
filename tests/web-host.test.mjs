import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { webControl, stopBundledWeb, webStatePath } from '../scripts/web-runtime.mjs';

test('owned Web host recovers a stale lock, redacts credentials, and stops its child before uninstall', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'Web 中文 test-'));
  const previous = process.env.CODEX_DSH_BRIDGE_TEST_HOME;
  process.env.CODEX_DSH_BRIDGE_TEST_HOME = directory;
  let child;
  try {
    const config = path.join(directory, '.codex-to-dsh-bridge'); fs.mkdirSync(config);
    const cli = path.join(directory, 'fake-web.mjs');
    const reservation = http.createServer();
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
    const hub = `http://127.0.0.1:${reservation.address().port}`;
    await new Promise(resolve => reservation.close(resolve));
    const busyFile = path.join(directory, 'busy'); fs.writeFileSync(busyFile, 'running');
    fs.writeFileSync(cli, `import http from 'node:http'; import fs from 'node:fs';
      http.createServer((req,res)=>{res.setHeader('content-type','application/json');res.end(JSON.stringify({jobs:fs.existsSync(${JSON.stringify(busyFile)})?[{origin:'hub-'+process.pid,status:'running'}]:[]}));}).listen(${new URL(hub).port},'127.0.0.1',()=>{
      console.log('dsh web: http://127.0.0.1:3080/?token=fixture-secret'); console.log('Bearer fixture-bearer');});`);
    fs.writeFileSync(path.join(config, 'installation.json'), JSON.stringify({ dshBin: cli }));
    fs.writeFileSync(path.join(config, 'desktop.json'), JSON.stringify({ surface: 'web', dshHome: directory, hub }));
    const lock = webStatePath() + '.lock'; fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: 2147483647 }));
    child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/web-host.mjs', import.meta.url))], { env: { ...process.env }, stdio: 'ignore', windowsHide: true });
    const deadline = Date.now() + 10000;
    let status;
    while (Date.now() < deadline) {
      status = await webControl('status');
      if (status?.browserURL) break;
      assert.equal(child.exitCode, null);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(status?.browserURL, 'http://127.0.0.1:3080/?token=fixture-secret');
    const state = JSON.parse(fs.readFileSync(webStatePath(), 'utf8'));
    const denied = await fetch(`http://127.0.0.1:${state.port}/status`);
    assert.equal(denied.status, 403);
    const log = fs.readFileSync(path.join(config, 'bundled-web.log'), 'utf8');
    assert(!log.includes('fixture-secret')); assert(!log.includes('fixture-bearer'));
    await assert.rejects(stopBundledWeb(), /仍有桥接任务运行/);
    assert.equal(child.exitCode, null); fs.unlinkSync(busyFile);
    fs.unlinkSync(webStatePath());
    assert.equal((await webControl('status')).pid, status.pid);
    assert(await stopBundledWeb());
    if (child.exitCode === null) await once(child, 'exit');
    assert(!fs.existsSync(webStatePath())); assert(!fs.existsSync(lock));
  } finally {
    if (child?.exitCode === null) { child.kill(); await once(child, 'exit'); }
    if (previous === undefined) delete process.env.CODEX_DSH_BRIDGE_TEST_HOME; else process.env.CODEX_DSH_BRIDGE_TEST_HOME = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
