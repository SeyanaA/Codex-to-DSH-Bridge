import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {createGzip} from 'node:zlib';
import {once} from 'node:events';
import crypto from 'node:crypto';
const app=path.resolve('release-build/windows-preview.2/app');
const output=path.join(app,'bridge-runtime.tar.gz');
const gzip=createGzip({level:9}), stream=fs.createWriteStream(output);
gzip.pipe(stream);let count=0,bytes=0;
function header(name,size,type='0'){
  const b=Buffer.alloc(512);b.write(name,0,100,'utf8');
  const octal=(value,start,width)=>b.write(value.toString(8).padStart(width-1,'0')+'\0',start,width,'ascii');
  octal(0o644,100,8);octal(0,108,8);octal(0,116,8);octal(size,124,12);octal(0,136,12);
  b.fill(32,148,156);b.write(type,156,1);b.write('ustar\0',257,6);b.write('00',263,2);
  const sum=b.reduce((total,value)=>total+value,0);b.write(sum.toString(8).padStart(6,'0')+'\0 ',148,8);return b;
}
const write=b=>new Promise((resolve,reject)=>gzip.write(b,error=>error?reject(error):resolve()));
function paxRecord(name){const body=' path='+name+'\n';let len=Buffer.byteLength(body)+2;while(Buffer.byteLength(String(len)+body)!==len)len=Buffer.byteLength(String(len)+body);return Buffer.from(String(len)+body);}
async function add(file,name){const size=(await fsp.stat(file)).size;const pax=paxRecord(name);await write(header('PaxHeaders/'+count,pax.length,'x'));await write(pax);if(pax.length%512)await write(Buffer.alloc(512-pax.length%512));await write(header('entry/'+count,size));for await(const piece of fs.createReadStream(file))await write(piece);if(size%512)await write(Buffer.alloc(512-size%512));bytes+=size;if(++count%10000===0)console.log('Packed',count,'files');}
async function walk(directory){for(const item of await fsp.readdir(directory,{withFileTypes:true})){const full=path.join(directory,item.name);if((await fsp.lstat(full)).isSymbolicLink())throw new Error('Refuse link: '+full);if(item.isDirectory())await walk(full);else await add(full,path.relative(app,full).replaceAll('\\','/'));}}
for(const relative of ['runtime/dsh','payload/template/web','payload/vendor/crew'])await walk(path.join(app,relative));
await write(Buffer.alloc(1024));gzip.end();await once(stream,'close');
const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(output))hash.update(chunk);
const manifest=JSON.parse(await fsp.readFile(path.join(app,'build-manifest.json'),'utf8'));
manifest.archive={file:'bridge-runtime.tar.gz',sha256:hash.digest('hex'),files:count,uncompressedBytes:bytes};await fsp.writeFile(path.join(app,'build-manifest.json'),JSON.stringify(manifest,null,2));
console.log(JSON.stringify({files:count,uncompressedBytes:bytes,archiveBytes:(await fsp.stat(output)).size}));
