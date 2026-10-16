import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installDesktop, uninstallDesktop } from './desktop-install.mjs';
import { ROOT, connectionSettings, localAddress, readSettings } from './desktop-settings.mjs';
import { desktopHealth, ensureDesktop, installCrewIfNeeded, launchDesktop, findDesktop } from './desktop-runtime.mjs';

export async function main(args = process.argv.slice(2)) {
  const action = args[0] || 'start';
  const option = key => { const at = args.indexOf(key); if (at < 0) return undefined; if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(key + ' 后面需要填写路径或地址。'); return args[at + 1]; };
  if (action === 'install') {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
    if (option('--desktop-path')) process.env.DSH_DESKTOP_PATH = path.resolve(option('--desktop-path'));
    installCrewIfNeeded();
    const result = installDesktop({ workspace: option('--workspace'), hub: option('--desktop-url') ? localAddress(option('--desktop-url')) : undefined, desktopPath: option('--desktop-path'), adopt: args.includes('--adopt-existing') });
    console.log('Desktop 配置完成，原配置已备份。请重新打开 DSH Desktop 和 Codex。');
    console.log('工作区：' + result.workspace); console.log('Host：' + result.hub);
  } else if (action === 'start' || action === 'open') {
    await ensureDesktop(); launchDesktop(); console.log('已连接 DSH Desktop。任务在配置的 Desktop 工作区查看。');
  } else if (action === 'stop') {
    console.log('Desktop 由你独立管理，本程序不会终止它。需要退出时，请使用 Desktop 的“退出”菜单；关闭窗口可能只是隐藏。');
  } else if (action === 'doctor') {
    const settings = connectionSettings();
    const lines = [
      ['Node.js 24+', Number(process.versions.node.split('.')[0]) >= 24],
      ['Desktop 安装位置', Boolean(findDesktop())],
      ['桥接安装配置', readSettings()?.root === ROOT],
      ['Crew 已安装', fs.existsSync(path.join(settings.profile, 'node_modules/@zseven-w/dsh-crew/lib/server.mjs'))],
      ['会话组件已生成', fs.existsSync(path.join(settings.profile, 'codex-bridge/crew-session-hub.mjs'))],
      ['Desktop 续聊接口', await desktopHealth(settings)],
    ];
    for (const [name, pass] of lines) console.log(`[${pass ? 'OK' : 'FAIL'}] ${name}`);
    console.log('模型固定：DeepSeek-V41-Flash / deepseek-flash / MAX。');
    console.log('诊断不调用模型；Windows 实机任务需另行验收。');
    if (lines.some(([, pass]) => !pass)) process.exitCode = 1;
  } else if (action === 'uninstall') {
    console.log(JSON.stringify(uninstallDesktop()));
  } else if (action.startsWith('web-')) {
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/launcher.mjs'), action.slice(4)], { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('旧 Web 模式操作失败，请查看上方提示。');
  } else throw new Error('用法：install | start | open | stop | doctor | uninstall | web-install | web-start | web-stop');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
