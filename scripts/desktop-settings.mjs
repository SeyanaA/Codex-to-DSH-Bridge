import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const home = () => path.resolve(process.env.CODEX_DSH_BRIDGE_TEST_HOME || os.homedir());
export const settingsPath = () => path.join(home(), '.codex-to-dsh-bridge/desktop.json');
export function readSettings() {
  try { return JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('Desktop 桥接配置损坏，请运行诊断。'); return null; }
}
export function localAddress(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Desktop 地址必须是 http://127.0.0.1:端口。');
  if (!url.port || Number(url.port) < 1024) throw new Error('请选择 1024–65535 之间的本机端口。');
  return url.origin;
}
export function connectionSettings() {
  const saved = readSettings();
  const dshHome = path.resolve(process.env.DSH_HOME || saved?.dshHome || path.join(home(), '.dsh'));
  return { ...saved, dshHome,
    hub: localAddress(process.env.DSHPLUGIN_CREW_HUB || saved?.hub || 'http://127.0.0.1:19387'),
    profile: path.join(dshHome, 'profiles/desktop'),
    workspace: saved?.workspace || path.join(home(), '.codex-to-dsh-bridge/desktop-smoke-workspace') };
}
export function backup(file) {
  if (!fs.existsSync(file)) return;
  const copy = file + '.backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  fs.copyFileSync(file, copy); return copy;
}
export function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + process.pid + '.tmp';
  fs.writeFileSync(temporary, content, { mode: 0o600 }); fs.renameSync(temporary, file);
}
