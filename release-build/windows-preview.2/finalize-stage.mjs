import fs from 'node:fs';
import path from 'node:path';
const app=path.resolve('release-build/windows-preview.2/app');
const payload=path.join(app,'payload');
const commonFile=path.join(payload,'scripts/common.mjs');
let common=fs.readFileSync(commonFile,'utf8');
common=common.replace('export const HOME = os.homedir();',"export const HOME = process.env.CODEX_DSH_BRIDGE_TEST_HOME ? path.resolve(process.env.CODEX_DSH_BRIDGE_TEST_HOME) : os.homedir();");
common=common.replace("export const BASE = 'http://127.0.0.1:3080';","const webPort = Number(process.env.CODEX_DSH_BRIDGE_TEST_PORT || 3080);\nif (!Number.isInteger(webPort) || webPort < 1024 || webPort > 65535) throw new Error('Invalid Web port');\nexport const BASE = `http://127.0.0.1:${webPort}`;");
const from=common.indexOf('export function findDsh() {'),to=common.indexOf('export function run(',from);
if(from<0||to<0)throw new Error('Unexpected common.mjs');
common=common.slice(0,from)+`export function findDsh() {
  const bundled=path.resolve(ROOT,'../runtime/dsh/node_modules/@deepseek-ai/dsh/lib/bin.js');
  if(fs.existsSync(bundled))return bundled;
  throw new Error('安装包中的 DSH 运行环境不完整，请重新安装。');
}
`+common.slice(to);
common=common.replace("host: '127.0.0.1', port: 3080","host: '127.0.0.1', port: Number(new URL(BASE).port)");
common=common.replace("url.startsWith('http://127.0.0.1:3080')","new URL(url).origin === BASE");
// Avoid accepting a different port or a non-loopback URL in the browser opener.
common=common.replace("if (!/^http:\\/\\/127\\.0\\.0\\.1:3080(?:[/?#]|$)/.test(url))", "if (new URL(url).origin !== BASE)");
fs.writeFileSync(commonFile,common);
const hostFile=path.join(payload,'scripts/host.mjs');
let host=fs.readFileSync(hostFile,'utf8');
host=host.replace('CONFIG, STATE, LABEL, DATA, log','CONFIG, STATE, LABEL, DATA, BASE, log');
host=host.replace("'--port', '3080'","'--port', new URL(BASE).port");
host=host.replace("if (match) browserURL = match[1];", "if (match && new URL(match[1]).origin === BASE) browserURL = match[1];");
host=host.replace('127\\.0\\.0\\.1:3080','127\\.0\\.0\\.1:\\d+');
fs.writeFileSync(hostFile,host);
const profile=path.join(payload,'template/web');
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'codex-dsh-bridge-web-profile',private:true,dependencies:{'@zseven-w/dsh-crew':'0.1.0-rc.14'},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@zseven-w/dsh-crew']}}},null,2));
fs.writeFileSync(path.join(profile,'cordis.yml'),'[]\n');
fs.writeFileSync(path.join(profile,'cordis.patch.yml'),'# Local DSH settings are written here after setup.\n[]\n');
fs.rmSync(path.join(profile,'node_modules/.package-lock.json'),{force:true});
const metadata={product:'Codex-to-DSH Bridge',version:'0.1.0-preview.2',platform:'windows-x64',node:'24.19.0',dsh:'0.2.1-alpha.3',crew:'0.1.0-rc.14',profile:'offline',source:'https://github.com/ZSeven-W/dsh-crew'};
fs.writeFileSync(path.join(app,'build-manifest.json'),JSON.stringify(metadata,null,2));
fs.writeFileSync(path.join(payload,'package.json'),JSON.stringify({name:'codex-to-dsh-bridge-launcher',version:metadata.version,private:true,type:'module',license:'MIT',description:'Windows installer and MCP launcher for DSH Crew',engines:{node:'>=24'}},null,2));
fs.writeFileSync(path.join(app,'run.cmd'),['@echo off','setlocal','chcp 65001 >nul','"%~dp0runtime\\node.exe" "%~dp0payload\\scripts\\launcher.mjs" %*','set "bridgeExit=%errorlevel%"','echo.','pause','exit /b %bridgeExit%',''].join('\r\n'));
console.log('Staged',metadata);
