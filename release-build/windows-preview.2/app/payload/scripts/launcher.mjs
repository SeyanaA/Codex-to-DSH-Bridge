import fs from 'node:fs';
import path from 'node:path';
import { ROOT, HOME, DATA, CONFIG, BASE, LOG, privateDir, readJSON, writeJSON, findDsh, crewReady, portOccupied, delay, control, openURL, spawnHost, redact } from './common.mjs';
const VERSION = '0.1.0-preview.2';
const marker = '# managed-by: codex-to-dsh-bridge';
const policyStart = '<!-- codex-to-dsh-crew -->';
const policyEnd = '<!-- /codex-to-dsh-crew -->';
const codexConfig = path.join(HOME,'.codex/config.toml');
const policyFile = path.join(HOME,'.codex/AGENTS.md');
const stamp = () => new Date().toISOString().replace(/[:.]/g,'-');
const say = value => console.error(value);
const backup = file => { if (fs.existsSync(file)) fs.copyFileSync(file,file+'.backup-'+stamp()); };
function sectionOf(text) {
  const match = /^\s*\[\s*mcp_servers\s*\.\s*(?:dsh-crew|"dsh-crew"|'dsh-crew')\s*\][ \t]*(?:#.*)?$/m.exec(text);
  if (!match) return null;
  const after = match.index+match[0].length;
  const next = /^\s*\[[^\n]+\][ \t]*(?:#.*)?$/m.exec(text.slice(after));
  const end = next ? after+next.index : text.length;
  const previous = text.slice(0,match.index);
  const owned = previous.trimEnd().endsWith(marker);
  const start = owned ? previous.lastIndexOf(marker) : match.index;
  return {start,end,owned,body:text.slice(match.index,end)};
}
function mcpBlock() {
  return `${marker}\n[mcp_servers.dsh-crew]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(ROOT,'scripts/mcp.mjs'))}]\nstartup_timeout_sec = 120\ntool_timeout_sec = 120\n`;
}
async function install() {
  if(process.platform!=='win32'||process.arch!=='x64') throw new Error('此安装包适用于 Windows x64。');
  privateDir();
  const existing = fs.existsSync(codexConfig)?fs.readFileSync(codexConfig,'utf8'):'';
  const section = sectionOf(existing);
  if(section && !section.owned) throw new Error('已有非本程序管理的 dsh-crew MCP 配置，请先检查该配置；本次没有覆盖它。');
  const previous = readJSON(CONFIG);
  const dshBin = findDsh();
  const dshHome = previous?.dshHome || path.join(HOME,'.dsh-codex-bridge');
  const template = path.join(ROOT,'template/web');
  const profile = path.join(dshHome,'profiles/web');
  const profileManifest = path.join(profile,'package.json');
  if(fs.existsSync(profileManifest)) {
    const current=readJSON(profileManifest);
    if(!current?.dsh?.profile?.bundles?.includes('@zseven-w/dsh-crew')) throw new Error(`已有另一份 Web profile，请检查 ${profileManifest} 后再安装。`);
    if(!fs.existsSync(path.join(profile,'node_modules/@zseven-w/dsh-crew/src/hub/index.mjs'))) throw new Error('原 Web profile 的 Crew 依赖不完整，请使用备份恢复或改名该 profile 后重试。');
  } else {
    fs.mkdirSync(path.dirname(profile),{recursive:true});
    fs.cpSync(template,profile,{recursive:true});
  }
  fs.mkdirSync(path.dirname(codexConfig),{recursive:true});
  backup(codexConfig);
  const next=section?existing.slice(0,section.start)+mcpBlock()+existing.slice(section.end):existing+'\n'+mcpBlock();
  fs.writeFileSync(codexConfig,next,{mode:0o600});
  const policy=fs.existsSync(policyFile)?fs.readFileSync(policyFile,'utf8'):'';
  if(!policy.includes(policyStart)) {
    backup(policyFile);
    fs.writeFileSync(policyFile,policy+`\n${policyStart}\n## DSH Crew delegation\nUse the dsh-crew MCP server for user-requested DSH tasks and independent, verifiable subtasks when beneficial. Codex owns decisions, review and integration. Prepare an isolated workspace for writing tasks. Use dsh_worker_config with mode hub and preset_flash standard for file generation, then dsh_spawn_worker, dsh_worker_status and dsh_worker_result. A spawn response is not a completed result: inspect generated files and verify acceptance. Show ${BASE} as the DSH Web monitor. Never send secrets or the entire conversation. Treat needs_input as requiring clarification and a new dispatch. Do not claim automatic external wakeups or Desktop conversation synchronization.\n${policyEnd}\n`,{mode:0o600});
  }
  backup(CONFIG);
  writeJSON(CONFIG,{root:ROOT,dshBin,dshHome,node:process.execPath,version:VERSION,dshVersion:'0.2.1-alpha.3',crewVersion:'0.1.0-rc.14',installed:new Date().toISOString()});
  const crewConfig=path.join(HOME,'.config/dsh-crew/config.json');
  if(!fs.existsSync(crewConfig)) {
    fs.mkdirSync(path.dirname(crewConfig),{recursive:true});
    fs.writeFileSync(crewConfig,JSON.stringify({mode:'hub',preset_flash:'standard',hub_url:BASE},null,2));
  }
  say('安装配置完成：已注册 dsh-crew MCP。请重新打开 Codex，启动 DSH Web 并在网页中配置自己的模型凭据。');
}
export async function ensureStarted() {
  if(await crewReady()) return;
  const settings=readJSON(CONFIG);
  if(!settings || settings.root!==ROOT) throw new Error('请先运行“安装与配置”，让 MCP 配置指向当前安装位置。');
  if(await portOccupied()) throw new Error(`${new URL(BASE).port} 已被其他服务占用，请检查该服务。`);
  if(!await control('status')) spawnHost();
  let stable=0;
  for(let index=0;index<120;index++) {
    if(await crewReady()) { if(++stable>=2)return; } else stable=0;
    await delay(500);
  }
  throw new Error(`DSH 启动未就绪，请查看诊断和日志：${LOG}`);
}
async function openWeb() {
  if(!await crewReady()) throw new Error('DSH Web 尚未启动，请先选择“启动 DSH Web”。');
  const status=await control('status');
  if(!status?.browserURL) throw new Error('未取得此启动器的网页认证链接，请稍后重试。');
  openURL(status.browserURL);
}
async function stop() {
  const settings=readJSON(CONFIG);
  if(settings?.root!==ROOT) {say('当前服务不属于此安装位置。');return;}
  const result=await control('stop');
  if(result) {for(let i=0;i<20&&await control('status');i++)await delay(250);say('已停止本程序管理的服务。');}
  else say('本程序管理的服务未运行。');
}
async function doctor() {
  say(`Bridge：${VERSION}`);say(`Node.js：${process.versions.node}`);say(`DSH CLI：${findDsh()}`);
  say(`本程序配置：${readJSON(CONFIG)?.root===ROOT?'已安装':'未注册此位置'}`);
  say(`Web：${await crewReady()?'Crew hub 就绪':await portOccupied()?'端口被占用':'未监听'}`);
  say(`服务：${await control('status')?'运行中':'未运行'}`);say(`日志：${LOG}`);
}
async function uninstall() {
  const app=path.resolve(ROOT,'..'), sentinel=readJSON(path.join(app,'bridge-install.json'));
  if(sentinel?.product!=='codex-to-dsh-bridge'||path.resolve(sentinel.installDir)!==app||app===path.parse(app).root) throw new Error('安装目录标记不匹配，拒绝卸载。');
  const settings=readJSON(CONFIG);
  if(settings?.root===ROOT) {
    await stop();
    const text=fs.existsSync(codexConfig)?fs.readFileSync(codexConfig,'utf8'):'';
    const section=sectionOf(text);
    if(section?.owned && section.body.includes(JSON.stringify(path.join(ROOT,'scripts/mcp.mjs')))) {
      backup(codexConfig);fs.writeFileSync(codexConfig,text.slice(0,section.start)+text.slice(section.end));
      if(fs.existsSync(policyFile)) {
        const policy=fs.readFileSync(policyFile,'utf8'), start=policy.indexOf(policyStart), end=policy.indexOf(policyEnd,start);
        if(start>=0&&end>=0) {backup(policyFile);fs.writeFileSync(policyFile,policy.slice(0,start)+policy.slice(end+policyEnd.length));}
      }
    }
    fs.rmSync(CONFIG,{force:true});
  }
  // Node supports the extended Windows paths used by some DSH dependencies.
  // Remove only the installed program trees, after validating the root sentinel.
  for(const relative of ['runtime/dsh','payload/template','payload/vendor']) {
    const target=path.resolve(app,relative);
    if(!target.startsWith(app+path.sep))throw new Error('拒绝清理安装目录之外的路径。');
    await fs.promises.rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:250});
  }
  say('已移除此安装位置管理的 MCP 配置。模型凭据与会话数据保留。');
}
if(process.argv[1]===path.join(ROOT,'scripts/launcher.mjs')) {
  try {
    const action=process.argv[2];
    if(action==='install')await install();
    else if(action==='start'){await ensureStarted();await openWeb();}
    else if(action==='serve')await ensureStarted();
    else if(action==='open')await openWeb();
    else if(action==='stop')await stop();
    else if(action==='doctor')await doctor();
    else if(action==='uninstall')await uninstall();
    else throw new Error('用法：install | start | open | stop | doctor | uninstall');
  }catch(error){say(redact(error.message));process.exitCode=1;}
}
