import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, HOME, DATA, CONFIG, PLIST, LABEL, BASE, LOG, privateDir, readJSON, writeJSON,
  executable, findDsh, run, crewReady, portOccupied, delay, control, openURL, spawnHost, redact } from './common.mjs';

const say = text => console.error(text);
const xml = value => String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
function backup(file) { if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.backup-${stamp()}`); }

async function install() {
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('需要 Node.js 24 或更新版本。请先更新 Node.js。');
  const dshBin = findDsh();
  if (!executable('pnpm')) throw new Error('缺少 pnpm。DSH 官方插件安装需要它；请安装 pnpm 后再选择“安装与配置”。');
  const codexDir = path.join(HOME, '.codex');
  const codexConfig = path.join(codexDir, 'config.toml');
  const existing = fs.existsSync(codexConfig) ? fs.readFileSync(codexConfig, 'utf8') : '';
  const section = /^\s*\[\s*mcp_servers\s*\.\s*(?:dsh-crew|"dsh-crew"|'dsh-crew')\s*\]/m;
  if (section.test(existing) && !existing.includes('# managed-by: codex-to-dsh-bridge')) {
    throw new Error('Codex 已有另一份 dsh-crew 配置。为保留它，本次未做修改；请先检查现有配置。');
  }
  if (existing.includes('# managed-by: codex-to-dsh-bridge') && !existing.includes(JSON.stringify(path.join(ROOT, 'scripts', 'mcp.mjs')))) {
    throw new Error('启动器位置改变了。请先恢复备份或移除旧的带 managed-by 标记配置，再安装新位置的程序。');
  }
  privateDir();
  const dshHome = process.env.DSH_HOME || path.join(HOME, '.dsh');
  for (const name of ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml']) backup(path.join(dshHome, 'profiles', 'web', name));
  say('正在为 DSH Web 安装固定版本的 Crew 插件，需要联网下载它的依赖……');
  run(process.execPath, [dshBin, 'plugin', '--profile', 'web', 'add', path.join(ROOT, 'vendor', 'zseven-w-dsh-crew-0.1.0-rc.14.tgz')], { stdio: 'inherit' });
  fs.mkdirSync(codexDir, { recursive: true });
  backup(codexConfig);
  if (!section.test(existing)) {
    const addition = `\n# managed-by: codex-to-dsh-bridge\n[mcp_servers.dsh-crew]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(ROOT, 'scripts', 'mcp.mjs'))}]\nstartup_timeout_sec = 120\ntool_timeout_sec = 120\n`;
    fs.writeFileSync(codexConfig, existing + addition, { mode: 0o600 });
  }
  const policyFile = path.join(codexDir, 'AGENTS.md');
  const policy = fs.existsSync(policyFile) ? fs.readFileSync(policyFile, 'utf8') : '';
  if (!policy.includes('<!-- codex-to-dsh-crew -->')) {
    backup(policyFile);
    fs.writeFileSync(policyFile, policy + `\n<!-- codex-to-dsh-crew -->\n## DSH Crew delegation\nPrefer the dsh-crew MCP server for independent, verifiable subtasks when beneficial. Codex owns decisions, review and integration. Do not duplicate a task through another DSH bridge. Prepare an isolated workspace before delegation; Crew does not itself guarantee git-worktree isolation. Use dsh_spawn_worker, continue independent work, then poll dsh_worker_status and dsh_worker_result. Show http://127.0.0.1:3080 as the DSH Web monitor. Inspect actual changes and verify acceptance before integrating. Never send secrets or the entire conversation. If needs_input occurs, provide the missing answer and re-dispatch as the upstream requires. Do not claim automatic external wakeups or Desktop session synchronization.\n<!-- /codex-to-dsh-crew -->\n`, { mode: 0o600 });
  }
  writeJSON(CONFIG, { dshBin, node: process.execPath, root: ROOT, version: '0.1.0-preview.1', installed: new Date().toISOString() });
  say('安装配置完成。原配置已有备份。请完全退出并重新打开 Codex，再选择“启动 DSH Web”。');
}

export async function ensureStarted() {
  if (await crewReady()) return;
  if (!readJSON(CONFIG)) throw new Error('请先在应用中选择“安装与配置”。');
  if (await portOccupied()) throw new Error('3080 已被其他服务占用，且无法确认它是 Crew Web。请自行检查该服务；本程序没有停止它。');
  const managed = await control('status');
  if (!managed) {
    if (process.platform === 'darwin') {
      const domain = `gui/${process.getuid()}`;
      const plistText = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>${xml(path.join(ROOT, 'scripts', 'host.mjs'))}</string></array><key>WorkingDirectory</key><string>${xml(DATA)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(process.env.PATH || '')}</string>${process.env.DSH_HOME ? `<key>DSH_HOME</key><string>${xml(process.env.DSH_HOME)}</string>` : ''}</dict><key>RunAtLoad</key><false/><key>KeepAlive</key><false/></dict></plist>`;
      if (fs.existsSync(PLIST) && fs.readFileSync(PLIST, 'utf8') !== plistText) {
        throw new Error('已有另一份启动服务配置，请先停止旧位置的服务，再移除旧的本启动器 plist 文件。');
      }
      fs.mkdirSync(path.dirname(PLIST), { recursive: true });
      fs.writeFileSync(PLIST, plistText, { mode: 0o600 });
      const loaded = (() => { try { run('/bin/launchctl', ['print', `${domain}/${LABEL}`]); return true; } catch { return false; } })();
      if (!loaded) run('/bin/launchctl', ['bootstrap', domain, PLIST]);
      // No -k: never kill a running host while another caller is starting it.
      run('/bin/launchctl', ['kickstart', `${domain}/${LABEL}`]);
    } else if (process.platform === 'win32') spawnHost();
    else throw new Error('仅支持 macOS 和 Windows。');
  }
  for (let i = 0; i < 75; i++) {
    if (await crewReady()) return;
    await delay(1000);
  }
  throw new Error(`DSH 在 75 秒内没有就绪。请查看诊断和日志：${LOG}`);
}
async function openWeb() {
  if (!await crewReady()) throw new Error('Crew Web 尚未就绪，请先选择“启动 DSH Web”。');
  const status = await control('status');
  openURL(status?.browserURL || BASE);
  say('已打开 DSH Web。复用他人启动的 Web 时，可能需要按 DSH 的提示自行登录。');
}
async function stop() {
  const result = await control('stop');
  if (result?.owner !== LABEL) { say('没有找到由本启动器管理的运行服务；没有停止其他 DSH。'); return; }
  if (process.platform === 'darwin') {
    await delay(1000);
    run('/bin/launchctl', ['bootout', `gui/${process.getuid()}/${LABEL}`]);
  }
  say('已请求停止本启动器创建的 DSH 服务。');
}
async function doctor() {
  say(`Node.js：${process.versions.node}`);
  try { say(`DSH CLI：${findDsh()}`); } catch (error) { say(error.message); }
  say(`pnpm：${executable('pnpm') ? '已找到' : '未找到'}`);
  say(`本程序配置：${readJSON(CONFIG) ? '已安装' : '未安装'}`);
  say(`Codex 配置：${fs.existsSync(path.join(HOME, '.codex', 'config.toml')) ? '存在' : '不存在'}`);
  say(`3080：${await crewReady() ? '可确认的 Crew Web' : await portOccupied() ? '其他服务占用或身份无法确认' : '未监听'}`);
  say(`本启动器服务：${await control('status') ? '运行中' : '未运行'}`);
  say(`日志：${LOG}`);
  say('模型连接、任务执行和界面功能：此诊断不做探测，仍需用户实机验收。');
}

if (process.argv[1] === new URL(import.meta.url).pathname || process.argv[1] === path.join(ROOT, 'scripts', 'launcher.mjs')) {
  try {
    const action = process.argv[2];
    if (action === 'install') await install();
    else if (action === 'start') { await ensureStarted(); await openWeb(); }
    else if (action === 'open') await openWeb();
    else if (action === 'stop') await stop();
    else if (action === 'doctor') await doctor();
    else throw new Error('用法：launcher.mjs install | start | open | stop | doctor');
  } catch (error) { say(redact(error.message)); process.exitCode = 1; }
}
