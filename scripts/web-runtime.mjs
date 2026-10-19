// Explicit Web host for the bundled bridge. Never starts Desktop or a separate agent.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { connectionSettings, home, ROOT, localAddress } from './desktop-settings.mjs';
import { desktopHealth } from './desktop-runtime.mjs';

export const webStatePath = () => path.join(home(), '.codex-to-dsh-bridge/bundled-web-host.json');
export function webLog(value) {
  const file = path.join(path.dirname(webStatePath()), 'bundled-web.log');
  const redacted = String(value).replace(/([?&](?:token|access_token|key|auth)=)[^\s&#"']+/gi, '$1[redacted]').replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]').replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]');
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1024 * 1024) fs.renameSync(file, file + '.previous');
    fs.appendFileSync(file, redacted + '\n');
  } catch { /* Log failure must not terminate the DSH host. */ }
}
export function webInstallation() {
  const settings = connectionSettings();
  let previous = {};
  try { previous = JSON.parse(fs.readFileSync(path.join(home(), '.codex-to-dsh-bridge/installation.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const bundled = path.resolve(ROOT, '../runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js');
  const dshBin = fs.existsSync(bundled) ? bundled : previous.dshBin;
  if (!dshBin || !fs.existsSync(dshBin)) throw new Error('找不到 Web 运行环境，请先安装 Windows 离线运行环境。');
  return { ...settings, dshBin, webURL: localAddress(settings.webURL || 'http://127.0.0.1:3080') };
}
export async function webControl(action) {
  let state;
  try { state = JSON.parse(fs.readFileSync(webStatePath(), 'utf8')); }
  catch { try { state = JSON.parse(fs.readFileSync(path.join(webStatePath() + '.lock', 'owner.json'), 'utf8')); } catch { return null; } }
  if (state.owner !== 'codex-bundled-web' || !Number.isInteger(state.port)) return null;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${state.port}/${action}`, { method: action === 'stop' ? 'POST' : 'GET', headers: { authorization: `Bearer ${state.controlToken}` }, signal: AbortSignal.timeout(3000) });
  } catch { return null; }
  if (response.status === 409) throw new Error((await response.json()).error);
  return response.ok ? response.json() : null;
}
export async function ensureBundledWeb() {
  if (await desktopHealth()) return;
  const settings = webInstallation();
  const occupied = await new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(new URL(settings.webURL).port) });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(1500, () => { socket.destroy(); resolve(true); });
  });
  const managed = await webControl('status');
  if (occupied && !managed) throw new Error('Web 端口已被占用。先停止旧启动器管理的 Web，再启动内置通信版本；不会终止占用进程。');
  if (!managed) {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts/web-host.mjs')], { detached: true, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    child.stderr.on('data', chunk => webLog(chunk)); child.stderr.unref();
    child.on('error', error => webLog('Web host spawn failed: ' + error.message)); child.unref();
  }
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await desktopHealth()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Web 内置通信组件未就绪，请检查 bundled-web.log；不会切换到 Desktop 或旧 Crew。');
}

export async function stopBundledWeb() {
  const result = await webControl('stop');
  if (!result) return false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (!fs.existsSync(webStatePath()) && !fs.existsSync(webStatePath() + '.lock')) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Web 停止尚未完成，未删除运行环境，请稍后重试。');
}
