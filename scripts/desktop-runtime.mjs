import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { connectionSettings, home, ROOT } from './desktop-settings.mjs';

export function desktopCandidates(platform = process.platform, environment = process.env) {
  const saved = connectionSettings();
  if (platform === 'darwin') return [environment.DSH_DESKTOP_PATH, saved.desktopPath, '/Applications/DeepSeek Harness.app', path.join(home(), 'Applications/DeepSeek Harness.app')].filter(Boolean);
  return [environment.DSH_DESKTOP_PATH, saved.desktopPath,
    ...[environment.LOCALAPPDATA && path.join(environment.LOCALAPPDATA, 'Programs'), environment.ProgramFiles].filter(Boolean)
      .flatMap(base => ['DeepSeek Harness', 'deepseek-harness'].map(name => path.join(base, name, 'DeepSeek Harness.exe')))].filter(Boolean);
}
export function findDesktop() { return desktopCandidates().find(candidate => fs.existsSync(candidate)); }
export async function desktopHealth(settings = connectionSettings()) {
  try {
    const response = await fetch(settings.hub + '/_dsh/dsh-crew/ping', { signal: AbortSignal.timeout(1500) });
    const body = await response.json();
    return response.ok && body.service === 'dsh-crew-hub' && body.sessionReuse === true && body.implementation === 'bundled-desktop-bridge';
  } catch { return false; }
}
function powershell(script) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Desktop 命令失败，请检查安装路径或完全退出 Desktop 后重试。');
}
export function launchDesktop() {
  const app = findDesktop();
  if (!app) throw new Error('没有找到 DSH Desktop。请先安装，或用 install --desktop-path 指定应用位置。');
  if (process.platform === 'darwin') {
    const result = spawnSync('/usr/bin/open', ['-a', app], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error('无法打开 DSH Desktop，请手动打开后运行诊断。');
  } else if (process.platform === 'win32') {
    const child = spawn(app, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => {}); child.unref();
  } else throw new Error('此启动器支持 macOS 和 Windows。');
}
export async function ensureDesktop() {
  if (connectionSettings().surface === 'web') {
    const { ensureBundledWeb } = await import('./web-runtime.mjs');
    return ensureBundledWeb();
  }
  if (await desktopHealth()) return;
  launchDesktop();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await desktopHealth()) return;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('Desktop 在 45 秒内未就绪。请检查内置通信组件、端口与诊断；无需启用 Crew 插件，不会启动 Web 或独立 Agent 替代。');
}
