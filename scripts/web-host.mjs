import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { atomicWrite } from './desktop-settings.mjs';
import { webInstallation, webStatePath, webLog } from './web-runtime.mjs';

const settings = webInstallation();
const stateFile = webStatePath();
const lock = stateFile + '.lock';
fs.mkdirSync(path.dirname(lock), { recursive: true });
const owner = path.join(lock, 'owner.json');
try { fs.mkdirSync(lock); } catch (error) {
  if (error.code !== 'EEXIST') throw error;
  let previous;
  try { previous = JSON.parse(fs.readFileSync(owner, 'utf8')); } catch { throw new Error('Web 锁记录损坏，请检查 ' + owner); }
  if (!Number.isInteger(previous.pid) || previous.pid < 1) throw new Error('Web 锁 PID 无效，请检查 ' + owner);
  try { process.kill(previous.pid, 0); process.exit(0); }
  catch (error) { if (error.code !== 'ESRCH') throw new Error('无法确认 Web 锁所属进程，未改动它：' + owner); }
  fs.unlinkSync(owner); fs.rmdirSync(lock); fs.mkdirSync(lock);
}
atomicWrite(owner, JSON.stringify({ pid: process.pid }));
const token = randomBytes(32).toString('hex');
let browserURL = null, child, stopping = false;
const server = http.createServer(async (req, res) => {
  const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { res.writeHead(403); res.end(); return; }
  if (!(req.method === 'GET' && req.url === '/status') && !(req.method === 'POST' && req.url === '/stop')) { res.writeHead(404); res.end(); return; }
  if (req.url === '/stop') {
    let jobs = [];
    try {
      const response = await fetch(settings.hub + '/_dsh/dsh-crew/jobs', { signal: AbortSignal.timeout(1500) });
      if (response.ok) jobs = (await response.json()).jobs || [];
    } catch { /* An unhealthy startup must still be stoppable. */ }
    if (jobs.some(job => job.origin === `hub-${child?.pid}` && job.status === 'running' && !job.endedAt)) {
      res.writeHead(409, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Web 仍有桥接任务运行，请先等待完成或取消任务，再停止/卸载。' })); return;
    }
  }
  res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ owner: 'codex-bundled-web', pid: process.pid, browserURL }));
  if (req.url === '/stop') stop();
});
function cleanup() {
  try { if (JSON.parse(fs.readFileSync(stateFile, 'utf8')).pid === process.pid) fs.rmSync(stateFile); } catch {}
  try { fs.unlinkSync(owner); fs.rmdirSync(lock); } catch {}
}
function stop() {
  if (stopping) return; stopping = true;
  child?.kill(); server.close();
}
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const state = JSON.stringify({ owner: 'codex-bundled-web', pid: process.pid, port: server.address().port, controlToken: token });
atomicWrite(owner, state); atomicWrite(stateFile, state);
child = spawn(process.execPath, ['--expose-internals', settings.dshBin, 'web', '--host', '127.0.0.1', '--port', new URL(settings.webURL).port, '--no-open'], {
  env: { ...process.env, DSH_HOME: settings.dshHome }, cwd: path.dirname(stateFile), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', line => {
  const match = line.match(/dsh web:\s+(http:\/\/127\.0\.0\.1:\d+[^\s]*)/);
  if (match && new URL(match[1]).origin === settings.webURL) browserURL = match[1];
  webLog(line);
});
child.on('error', () => { cleanup(); server.close(); process.exit(1); });
child.on('exit', code => { cleanup(); server.close(); process.exit(code || 0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
