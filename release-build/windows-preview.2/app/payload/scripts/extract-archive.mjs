import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createGunzip} from 'node:zlib';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const manifest=JSON.parse(await fsp.readFile(path.join(root,'build-manifest.json'),'utf8'));
const archive=path.join(root,'bridge-runtime.tar.gz');
const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk);
if(hash.digest('hex')!==manifest.archive?.sha256)throw new Error('Runtime archive checksum mismatch');
let buffer=Buffer.alloc(0),state='header',remaining=0,padding=0,current,handle,pax=[],nextName,count=0,bytes=0,zeroBlocks=0;
const gunzip=fs.createReadStream(archive).pipe(createGunzip());
function safeTarget(name){
  if(!name||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').includes('..'))throw new Error('Unsafe archive entry');
  if(!['runtime/dsh/','payload/template/web/','payload/vendor/crew/'].some(prefix=>name.startsWith(prefix)))throw new Error('Unexpected archive entry');
  const target=path.resolve(root,...name.split('/'));
  if(!target.startsWith(root+path.sep))throw new Error('Archive entry outside installation');return target;
}
function parsePax(data){let at=0;while(at<data.length){const space=data.indexOf(32,at);if(space<0)throw new Error('Invalid PAX');const length=Number(data.subarray(at,space).toString());if(!Number.isInteger(length)||length<=0||at+length>data.length)throw new Error('Invalid PAX length');const value=data.subarray(space+1,at+length-1).toString('utf8');if(value.startsWith('path='))nextName=value.slice(5);at+=length;}}
try{
  for await(const piece of gunzip){
    buffer=buffer.length?Buffer.concat([buffer,piece]):piece;
    while(true){
      if(state==='header'){
        if(buffer.length<512)break;
        const h=buffer.subarray(0,512);buffer=buffer.subarray(512);
        if(h.every(value=>value===0)){zeroBlocks++;continue;}
        if(zeroBlocks)throw new Error('Data after archive terminator');
        const stored=parseInt(h.subarray(148,156).toString().replace(/\0/g,'').trim(),8);
        let sum=0;for(let i=0;i<512;i++)sum+=(i>=148&&i<156)?32:h[i];if(sum!==stored)throw new Error('Invalid tar header');
        const size=parseInt(h.subarray(124,136).toString().replace(/\0/g,'').trim(),8);
        if(!Number.isSafeInteger(size)||size<0||size>1024*1024*1024)throw new Error('Invalid entry size');
        const type=String.fromCharCode(h[156]);if(type!=='x'&&type!=='0')throw new Error('Unsupported archive entry');
        current={type,size};remaining=size;padding=(512-size%512)%512;pax=[];
        if(type==='0'){
          const name=nextName||h.subarray(0,100).toString().split('\0')[0];nextName=undefined;
          const target=safeTarget(name);await fsp.mkdir(path.dirname(target),{recursive:true});handle=await fsp.open(target,'w');
        }
        state='body';
      }
      if(state==='body'){
        if(remaining && !buffer.length)break;
        const length=Math.min(remaining,buffer.length),chunk=buffer.subarray(0,length);buffer=buffer.subarray(length);remaining-=length;
        if(current.type==='x')pax.push(chunk);else if(length){let offset=0;while(offset<chunk.length){const written=await handle.write(chunk,offset,chunk.length-offset);offset+=written.bytesWritten;}}
        if(remaining)break;
        if(current.type==='x')parsePax(Buffer.concat(pax));else{await handle.close();handle=undefined;count++;bytes+=current.size;if(count%10000===0)console.log('Extracted',count,'files');}
        state='padding';
      }
      if(state==='padding'){
        if(buffer.length<padding)break;buffer=buffer.subarray(padding);state='header';
      }
    }
  }
  if(state!=='header'||buffer.length||zeroBlocks<2||count!==manifest.archive.files||bytes!==manifest.archive.uncompressedBytes)throw new Error('Incomplete runtime archive');
  console.log('Runtime verified and extracted:',count,'files');
}finally{await handle?.close();}
