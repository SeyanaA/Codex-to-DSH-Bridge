import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { installDesktop, uninstallDesktop } from './desktop-install.mjs';
import { ROOT, connectionSettings, localAddress, readSettings } from './desktop-settings.mjs';
import { desktopHealth, ensureDesktop, launchDesktop, findDesktop } from './desktop-runtime.mjs';
import { webControl, stopBundledWeb } from './web-runtime.mjs';

export async function main(args = process.argv.slice(2)) {
  const action = args[0] || 'start';
  const option = key => { const at = args.indexOf(key); if (at < 0) return undefined; if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(key + ' 后面需要填写路径或地址。'); return args[at + 1]; };
  if (action === 'install') {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。');
    if (option('--desktop-path')) process.env.DSH_DESKTOP_PATH = path.resolve(option('--desktop-path'));
    const result = installDesktop({ workspace: option('--workspace'), hub: option('--desktop-url') ? localAddress(option('--desktop-url')) : undefined, desktopPath: option('--desktop-path'), adopt: args.includes('--adopt-existing'), surface: option('--surface'), dshHome: option('--dsh-home'), webURL: option('--web-url') });
    console.log(`DSH ${connectionSettings().surface} 配置完成，原配置已备份。请重启对应 DSH 服务并重新打开 Codex。`);
    console.log('工作区：' + result.workspace); console.log('Host：' + result.hub);
  } else if (action === 'start' || action === 'open') {
    await ensureDesktop();
    if (connectionSettings().surface === 'web') {
      const status = await webControl('status');
      if (!status?.browserURL) throw new Error('Web 已启动，认证链接尚未就绪，请稍后重试 open。');
      // Keep authenticated URLs out of console and log output.
      const { openURL } = await import('./common.mjs'); openURL(status.browserURL, connectionSettings().webURL || 'http://127.0.0.1:3080');
      console.log('已连接 DSH Web，Crew 插件无需启用。');
    } else { launchDesktop(); console.log('已连接 DSH Desktop。任务在配置的 Desktop 工作区查看。'); }
  } else if (action === 'serve') {
    await ensureDesktop();
  } else if (action === 'stop') {
    if (connectionSettings().surface === 'web') { await stopBundledWeb(); console.log('本桥接器管理的 Web 已停止。'); }
    else console.log('Desktop 由你独立管理，本程序不会终止它。需要退出时，请使用 Desktop 的“退出”菜单；关闭窗口可能只是隐藏。');
  } else if (action === 'doctor') {
    const settings = connectionSettings();
    const lines = [
      ['Node.js 24+', Number(process.versions.node.split('.')[0]) >= 24],
      ['DSH 运行环境', settings.surface === 'web' ? Boolean((await import('./web-runtime.mjs')).webInstallation().dshBin) : Boolean(findDesktop())],
      ['桥接安装配置', readSettings()?.root === ROOT],
      ['内置通信源码（不依赖 Crew 插件开关）', Boolean(settings.crew && fs.existsSync(path.join(settings.crew, 'lib/server.mjs')))],
      ['会话组件已生成', fs.existsSync(path.join(settings.profile, 'codex-bridge/crew-session-hub.mjs'))],
      ['持久会话通信接口', await desktopHealth(settings)],
    ];
    for (const [name, pass] of lines) console.log(`[${pass ? 'OK' : 'FAIL'}] ${name}`);
    console.log('模型固定：DeepSeek-V41-Flash / deepseek-flash / MAX。');
    console.log('当前模式：' + settings.surface + '。诊断不调用模型；真实任务需另行验收。');
    if (lines.some(([, pass]) => !pass)) process.exitCode = 1;
  } else if (action === 'uninstall') {
    if (readSettings()?.root === ROOT && connectionSettings().surface === 'web') await stopBundledWeb();
    console.log(JSON.stringify(uninstallDesktop()));
  } else if (action.startsWith('web-')) {
    const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/launcher.mjs'), action.slice(4)], { stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('旧 Web 模式操作失败，请查看上方提示。');
  } else throw new Error('用法：install | start | open | stop | doctor | uninstall | web-install | web-start | web-stop');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
