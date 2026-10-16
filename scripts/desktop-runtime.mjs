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
    return response.ok && body.service === 'dsh-crew-hub' && body.sessionReuse === true;
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
  if (await desktopHealth()) return;
  launchDesktop();
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    if (await desktopHealth()) return;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  throw new Error('Desktop 在 45 秒内未就绪。请检查登录、Crew 插件、端口与诊断；不会启动 Web 或独立 Agent 替代。');
}
export function installCrewIfNeeded() {
  const settings = connectionSettings(), manifest = path.join(settings.profile, 'package.json');
  if (!fs.existsSync(manifest)) throw new Error('请先安装并打开一次 DSH Desktop 完成初始化，然后完全退出再配置。');
  const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (pkg.dsh?.profile?.bundles?.includes('@zseven-w/dsh-crew') && fs.existsSync(path.join(settings.profile, 'node_modules/@zseven-w/dsh-crew/src/hub/index.mjs'))) return;
  const app = findDesktop();
  if (!app) throw new Error('请先安装 DSH Desktop，或指定 --desktop-path。');
  const cli = process.platform === 'darwin' ? path.join(app, 'Contents/Resources/runtime/cli/bin/dsh') : path.join(path.dirname(app), 'resources/runtime/cli/bin/dsh.cmd');
  if (!fs.existsSync(cli)) throw new Error('此 Desktop 版本未找到自带 CLI。请在 Desktop 插件页安装并启用 @zseven-w/dsh-crew 0.1.0-rc.14 后重试。');
  const archive = path.join(ROOT, 'vendor/zseven-w-dsh-crew-0.1.0-rc.14.tgz');
  if (!fs.existsSync(archive)) throw new Error('安装包缺少固定版本 Crew，请重新下载。');
  console.error('通过 Desktop 官方命令安装 Crew；若应用仍在运行，请完全退出后重试。首次可能需要联网下载插件依赖。');
  if (process.platform === 'darwin') {
    const result = spawnSync('/bin/sh', [cli, 'plugin', '--profile', 'desktop', 'add', archive], { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Desktop 插件安装未完成；现有服务未被停止。');
  } else {
    if (/[\r\n&|<>^%!\"]/.test(cli + archive)) throw new Error('此安装路径含 Windows 命令特殊字符。请在 Desktop 插件页安装 Crew，避免通过命令安装。');
    const quote = value => "'" + value.replaceAll("'", "''") + "'";
    powershell(`& ${quote(cli)} plugin --profile desktop add ${quote(archive)}; exit $LASTEXITCODE`);
  }
}
