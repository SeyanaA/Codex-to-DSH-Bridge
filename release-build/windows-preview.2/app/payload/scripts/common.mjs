import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOME = process.env.CODEX_DSH_BRIDGE_TEST_HOME ? path.resolve(process.env.CODEX_DSH_BRIDGE_TEST_HOME) : os.homedir();
// Desktop-launched MCP processes may not inherit the interactive terminal PATH.
if (process.platform === 'win32') {
  process.env.PATH = [path.dirname(process.execPath), path.join(process.env.APPDATA || path.join(HOME, 'AppData', 'Roaming'), 'npm'), process.env.PATH || ''].join(path.delimiter);
}
export const DATA = path.join(HOME, '.codex-to-dsh-bridge');
const webPort = Number(process.env.CODEX_DSH_BRIDGE_TEST_PORT || 3080);
if (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new Error('Invalid Web port');
export const BASE = `http://127.0.0.1:${webPort}`;
export const LABEL = 'com.seyana.codex-to-dsh-bridge';
export const PLIST = path.join(HOME, 'Library', 'LaunchAgents', `${LABEL}.plist`);
export const CONFIG = path.join(DATA, 'installation.json');
export const STATE = path.join(DATA, 'host.json');
export const LOG = path.join(DATA, 'service.log');

export function privateDir() { fs.mkdirSync(DATA, { recursive: true, mode: 0o700 }); }
export function readJSON(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } }
export function writeJSON(file, value) {
  privateDir();
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file);
}
export function redact(text) {
  return String(text).replace(/([?&](?:token|access_token|key|auth)=)[^\s&#"']+/gi, '$1[redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]');
}
export function log(text) {
  privateDir();
  if (fs.existsSync(LOG) && fs.statSync(LOG).size > 5 * 1024 * 1024) fs.renameSync(LOG, `${LOG}.previous`);
  fs.appendFileSync(LOG, `${new Date().toISOString()} ${redact(text)}\n`, { mode: 0o600 });
}
export function executable(name) {
  const directories = [...(process.env.PATH || '').split(path.delimiter),
    '/opt/homebrew/bin', '/usr/local/bin', path.dirname(process.execPath)];
  const suffixes = process.platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];
  for (const directory of directories.filter(Boolean)) for (const suffix of suffixes) {
    const candidate = path.join(directory, `${name}${suffix}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}
export function findDsh() {
  const bundled=path.resolve(ROOT,'../runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js');
  if(fs.existsSync(bundled))return bundled;
  throw new Error('安装包中的 DSH 运行环境不完整，请重新安装。');
}
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.error || result.status !== 0) {
    throw new Error(redact(result.error?.message || result.stderr || `操作失败（退出码 ${result.status}）`));
  }
  return result.stdout || '';
}
export async function crewReady() {
  try {
    const response = await fetch(`${BASE}/_dsh/dsh-crew/ping`, { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.json()).service === 'dsh-crew-hub';
  } catch { return false; }
}
export function portOccupied() {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: Number(new URL(BASE).port) });
    let done = false;
    const finish = value => { if (!done) { done = true; socket.destroy(); resolve(value); } };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(1000, () => finish(true));
  });
}
export const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function control(action) {
  const state = readJSON(STATE);
  if (!state || state.owner !== LABEL || !Number.isInteger(state.port)) return null;
  try {
    const response = await fetch(`http://127.0.0.1:${state.port}/${action}`, {
      method: action === 'stop' ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${state.controlToken}` }, signal: AbortSignal.timeout(3000),
    });
    return response.ok ? response.json() : null;
  } catch { return null; }
}
export function openURL(url) {
  if (new URL(url).origin !== BASE) throw new Error('拒绝打开非本机 DSH 地址。');
  if (process.platform === 'darwin') run('/usr/bin/open', [url]);
  else if (process.platform === 'win32') {
    const script = `Start-Process -FilePath '${url.replace(/'/g, "''")}'`;
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  } else throw new Error('本启动器仅支持 macOS 和 Windows。');
}
export function spawnHost() {
  const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'host.mjs')], {
    detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
}
