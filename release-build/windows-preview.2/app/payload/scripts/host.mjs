import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { CONFIG, STATE, LABEL, DATA, BASE, log, readJSON, writeJSON, crewReady, portOccupied } from './common.mjs';

const settings = readJSON(CONFIG);
if (!settings?.dshBin) { log('还没有安装配置。'); process.exit(1); }
if (await crewReady()) process.exit(0);
if (await portOccupied()) { log('3080 已被其他服务占用；未停止任何现有服务。'); process.exit(1); }
const lock = path.join(DATA, 'host.lock');
const lockOwner = path.join(lock, 'owner.json');
try { fs.mkdirSync(lock, { mode: 0o700 }); }
catch {
  const previous = readJSON(lockOwner);
  if (!previous?.pid) { log('另一份启动器正在启动，或锁记录不完整。'); process.exit(1); }
  try { process.kill(previous.pid, 0); log('另一份启动器仍在运行。'); process.exit(1); }
  catch (error) {
    if (error.code !== 'ESRCH') { log('无法确认旧启动器状态，未改动它。'); process.exit(1); }
    fs.rmSync(lock, { recursive: true });
    fs.mkdirSync(lock, { mode: 0o700 });
  }
}
writeJSON(lockOwner, { pid: process.pid });
const controlToken = randomBytes(32).toString('hex');
let browserURL = null;
let child;
let stopping = false;
const server = http.createServer((request, response) => {
  const supplied = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from(`Bearer ${controlToken}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    response.writeHead(403); response.end('Forbidden'); return;
  }
  if (request.url !== '/status' && !(request.url === '/stop' && request.method === 'POST')) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify({ owner: LABEL, pid: process.pid, browserURL }));
  if (request.url === '/stop') shutdown();
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
writeJSON(STATE, { owner: LABEL, pid: process.pid, port: server.address().port, controlToken });

function shutdown() {
  if (stopping) return;
  stopping = true;
  if (child?.exitCode === null) child.kill('SIGTERM');
  setTimeout(() => { if (child?.exitCode === null) child.kill('SIGKILL'); cleanup(); process.exit(0); }, 7000).unref();
  server.close();
  if (!child || child.exitCode !== null) { cleanup(); process.exit(0); }
}
function cleanup() {
  if (readJSON(STATE)?.controlToken === controlToken) fs.rmSync(STATE, { force: true });
  if (readJSON(lockOwner)?.pid === process.pid) fs.rmSync(lock, { recursive: true, force: true });
}
child = spawn(process.execPath, ['--expose-internals', settings.dshBin, 'web', '--host', '127.0.0.1', '--port', new URL(BASE).port, '--no-open'], {
  cwd: DATA, env: { ...process.env, ...(settings.dshHome ? { DSH_HOME: settings.dshHome } : {}) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
for (const stream of [child.stdout, child.stderr]) {
  const lines = createInterface({ input: stream });
  lines.on('line', line => {
    const match = line.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+[^\s]*)/);
    if (match && new URL(match[1]).origin === BASE) browserURL = match[1]; // Private IPC only; never write the authenticated URL to a log.
    log(line);
  });
}
child.on('error', error => { log(error.message); shutdown(); });
child.on('exit', code => { log(`本启动器的 DSH 已退出，退出码 ${code}`); cleanup(); server.close(); process.exit(code || 0); });
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('uncaughtException', error => { log(error.message); shutdown(); });
