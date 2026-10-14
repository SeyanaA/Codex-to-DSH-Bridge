import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
const arg=name=>process.argv[process.argv.indexOf(name)+1];
const app=path.resolve(arg('--root'));
const home=path.resolve(arg('--home'));
const port=arg('--port')||'3082';
const env={...process.env,CODEX_DSH_BRIDGE_TEST_HOME:home,CODEX_DSH_BRIDGE_TEST_PORT:port};
const node=path.join(app,'runtime/node.exe'),launcher=path.join(app,'payload/scripts/launcher.mjs');
const result={installerLayout:fs.existsSync(path.join(app,'Uninstall.exe')),node:false,registered:false,protocol:false,tools:[],hub:false,generation:null};
fs.mkdirSync(home,{recursive:true});
let id=0,buffer='';const pending=new Map();let child;
function command(action){const r=spawnSync(node,[launcher,action],{env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw new Error(`${action} failed: ${r.stderr}`);return r;}
function request(method,params){return new Promise((resolve,reject)=>{const current=++id,timer=setTimeout(()=>{pending.delete(current);reject(new Error('MCP timeout: '+method));},90000);pending.set(current,{resolve:value=>{clearTimeout(timer);resolve(value)},reject:error=>{clearTimeout(timer);reject(error)}});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:current,method,params})+'\n');});}
const call=async(name,args={})=>{const r=await request('tools/call',{name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r.content));return JSON.parse(r.content.find(item=>item.type==='text').text);};
try{
  result.node=spawnSync(node,['--version'],{encoding:'utf8'}).stdout.trim()==='v24.19.0';
  command('install');
  const config=fs.readFileSync(path.join(home,'.codex/config.toml'),'utf8');
  result.registered=config.includes('[mcp_servers.dsh-crew]')&&config.includes(JSON.stringify(path.join(app,'payload/scripts/mcp.mjs')));
  child=spawn(node,[path.join(app,'payload/scripts/mcp.mjs')],{env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  child.stdout.setEncoding('utf8');child.stdout.on('data',data=>{buffer+=data;while(buffer.includes('\n')){const pos=buffer.indexOf('\n'),line=buffer.slice(0,pos);buffer=buffer.slice(pos+1);let message;try{message=JSON.parse(line)}catch{continue}const waiting=pending.get(message.id);if(waiting){pending.delete(message.id);message.error?waiting.reject(new Error(JSON.stringify(message.error))):waiting.resolve(message.result);}}});
  child.stderr.on('data',data=>process.stderr.write(data));
  child.on('exit',code=>{for(const item of pending.values())item.reject(new Error('MCP exited: '+code));pending.clear();});
  const init=await request('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'windows-installer-smoke',version:'0.1.0-preview.2'}});
  result.protocol=init.serverInfo?.name==='dsh-crew';
  child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
  result.tools=(await request('tools/list',{})).tools.map(tool=>tool.name);
  const conf=await call('dsh_worker_config',{mode:'hub',preset_flash:'standard'});result.hub=conf.hub_reachable===true;
  if(process.argv.includes('--dispatch')){
    const cwd=path.join(home,'worker');fs.mkdirSync(cwd,{recursive:true});
    const job=await call('dsh_spawn_worker',{task:`这是 Windows 安装包的实际 MCP 生成验收。只在工作目录 ${cwd} 新建 installer-check.txt，UTF-8 内容为 INSTALLER_MCP_OK 后加换行。用文件编辑工具，不执行终端命令，不读写其他目录，不联网，不派发子代理。完成后只回复 INSTALLER_MCP_OK。`,cwd,tier:'flash',effort:'off'});
    const end=await call('dsh_worker_result',{job_id:job.id,wait_seconds:45});
    result.generation={id:job.id,status:end.status,reply:end.result,fileCreated:fs.existsSync(path.join(cwd,'installer-check.txt')),fileMatches:fs.existsSync(path.join(cwd,'installer-check.txt'))&&fs.readFileSync(path.join(cwd,'installer-check.txt'),'utf8').trim()==='INSTALLER_MCP_OK',toolCalls:end.toolCalls,error:end.error};
  }
  result.passed=result.node&&result.registered&&result.protocol&&result.tools.length===7&&result.hub&&(!result.generation||(result.generation.status==='done'&&result.generation.fileMatches));
}catch(error){result.error=error.message;result.passed=false;process.exitCode=1;}
finally{child?.stdin.end();if(child)setTimeout(()=>child.kill(),1000).unref();command('stop');}
fs.writeFileSync(arg('--report'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));if(!result.passed)process.exitCode=1;
