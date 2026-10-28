import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import {randomBytes} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs');
const {startSharing}=createRequire(import.meta.url)('../launcher/sharing.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(t){const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'tour-server-performance-')),running=await startServer({root});t.after(async()=>{await new Promise(resolve=>running.server.close(resolve));await fs.promises.rm(root,{recursive:true,force:true});});return {root,...running};}
function request(url,{method='GET',headers={}}={}){return new Promise((resolve,reject)=>{const client=url.startsWith('https:')?https:http,req=client.request(url,{method,headers,agent:false,...(client===https?{rejectUnauthorized:false}:{})},res=>{const chunks=[];res.on('data',part=>chunks.push(part));res.on('error',reject);res.on('aborted',()=>reject(Error('Response aborted')));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.setTimeout(5000,()=>{req.destroy(Error('Request timed out'));});req.end();});}
const text=Buffer.from('const label="A locally bundled Gaussian splat tour";\n'.repeat(300));

test('local server negotiates streaming gzip, respects q=0 and wildcard, and validates the encoded representation',async t=>{
 const f=await fixture(t);await fs.promises.writeFile(path.join(f.root,'viewer.js'),text);
 for(const encoding of ['gzip','br, gzip, deflate','GZip; q=1','*;q=0.5','gzip;q=0.5, identity;q=0.1']){const response=await request(f.url+'viewer.js',{headers:{'Accept-Encoding':encoding}});assert.equal(response.status,200);assert.equal(response.headers['content-type'],'text/javascript');assert.equal(response.headers['content-encoding'],'gzip',encoding);assert.equal(response.headers.vary,'Accept-Encoding');assert.equal(response.headers['cache-control'],'no-cache');assert.ok(!response.headers['content-length']);assert.deepEqual(gunzipSync(response.body),text);assert.ok(response.body.length<text.length/4);const repeat=await request(f.url+'viewer.js',{headers:{'Accept-Encoding':encoding,'If-None-Match':response.headers.etag}});assert.equal(repeat.status,304);assert.equal(repeat.body.length,0);assert.equal(repeat.headers.vary,'Accept-Encoding');}
 for(const encoding of [undefined,'br','gzip;q=0','*;q=0','gzip;q=0, *;q=1','gzip;q=invalid','gzip;q=0.2, identity;q=1']){const response=await request(f.url+'viewer.js',{headers:encoding?{'Accept-Encoding':encoding}:{}});assert.equal(response.headers['content-encoding'],undefined,encoding);assert.equal(response.headers['content-length'],String(text.length));assert.deepEqual(response.body,text);}
});

test('HEAD, ranges and binary assets keep original byte semantics while normal text compresses',async t=>{
 const f=await fixture(t);await fs.promises.writeFile(path.join(f.root,'viewer.js'),text);await fs.promises.writeFile(path.join(f.root,'small.json'),'{}');
 const head=await request(f.url+'viewer.js',{method:'HEAD',headers:{'Accept-Encoding':'gzip'}});assert.equal(head.status,200);assert.equal(head.headers['content-encoding'],'gzip');assert.equal(head.body.length,0);assert.equal(head.headers['content-length'],undefined);
 for(const method of ['GET','HEAD']){const range=await request(f.url+'viewer.js',{method,headers:{'Accept-Encoding':'gzip',Range:'bytes=5-99'}});assert.equal(range.status,206);assert.equal(range.headers['content-encoding'],undefined);assert.equal(range.headers['content-range'],`bytes 5-99/${text.length}`);assert.equal(range.headers['content-length'],'95');assert.deepEqual(range.body,method==='GET'?text.subarray(5,100):Buffer.alloc(0));}
 const invalid=await request(f.url+'viewer.js',{headers:{'Accept-Encoding':'gzip',Range:'bytes=999999-'}});assert.equal(invalid.status,416);assert.equal(invalid.headers['content-range'],`bytes */${text.length}`);
 for(const extension of ['rad','radc','scv','glb','wasm','png','jpg','mp3','mp4','woff2']){await fs.promises.writeFile(path.join(f.root,'asset.'+extension),text);const response=await request(f.url+'asset.'+extension,{headers:{'Accept-Encoding':'gzip'}});assert.equal(response.headers['content-encoding'],undefined,extension);assert.equal(response.headers['content-length'],String(text.length));assert.deepEqual(response.body,text);const range=await request(f.url+'asset.'+extension,{headers:{'Accept-Encoding':'gzip',Range:'bytes=0-7'}});assert.equal(range.status,206);assert.deepEqual(range.body,text.subarray(0,8));}
 const small=await request(f.url+'small.json',{headers:{'Accept-Encoding':'gzip'}});assert.equal(small.headers['content-encoding'],undefined);assert.equal(small.body.toString(),'{}');
});

test('validators avoid repeated bodies, prioritize entity tags, and keep edited configuration fresh',async t=>{
 const f=await fixture(t),file=path.join(f.root,'tour.json'),original=Buffer.from('{"title":"first"}'),replacement=Buffer.from('{"title":"other"}');await fs.promises.writeFile(file,original);const first=await request(f.url+'tour.json');assert.ok(first.headers.etag.startsWith('W/"'));assert.ok(first.headers['last-modified']);
 for(const [name,value] of [['If-None-Match',first.headers.etag],['If-None-Match',first.headers.etag.slice(2)],['If-None-Match','"unrelated", '+first.headers.etag],['If-None-Match','*'],['If-Modified-Since',first.headers['last-modified']]]){for(const method of ['GET','HEAD']){const response=await request(f.url+'tour.json',{method,headers:{[name]:value}});assert.equal(response.status,304);assert.equal(response.body.length,0);assert.equal(response.headers.etag,first.headers.etag);assert.equal(response.headers['cache-control'],'no-cache');}}
 const priority=await request(f.url+'tour.json',{headers:{'If-None-Match':'"different"','If-Modified-Since':new Date(Date.now()+86400000).toUTCString()}});assert.equal(priority.status,200,'a stale ETag overrides a matching modification date');assert.deepEqual(priority.body,original);
 await fs.promises.writeFile(file,replacement);const modified=new Date(Date.now()+2500);await fs.promises.utimes(file,modified,modified);const changed=await request(f.url+'tour.json',{headers:{'If-None-Match':first.headers.etag,'If-Modified-Since':first.headers['last-modified']}});assert.equal(changed.status,200);assert.notEqual(changed.headers.etag,first.headers.etag);assert.deepEqual(changed.body,replacement);assert.equal(changed.headers['cache-control'],'no-cache');
});

test('validators do not reuse a previous project asset when a dynamic route changes roots',async t=>{
 const parent=await fs.promises.mkdtemp(path.join(os.tmpdir(),'tour-server-root-change-')),firstRoot=path.join(parent,'one'),secondRoot=path.join(parent,'two');await fs.promises.mkdir(firstRoot);await fs.promises.mkdir(secondRoot);const firstFile=path.join(firstRoot,'scene.json'),secondFile=path.join(secondRoot,'scene.json'),timestamp=new Date('2026-01-01T00:00:00Z');await fs.promises.writeFile(firstFile,'{"scene":"first"}');await fs.promises.writeFile(secondFile,'{"scene":"other"}');await fs.promises.utimes(firstFile,timestamp,timestamp);await fs.promises.utimes(secondFile,timestamp,timestamp);let projectRoot=firstRoot;const running=await startServer({root:parent,resolve:name=>({root:projectRoot,relative:name})});t.after(async()=>{await new Promise(resolve=>running.server.close(resolve));await fs.promises.rm(parent,{recursive:true,force:true});});
 const first=await request(running.url+'scene.json');assert.equal(first.body.toString(),'{"scene":"first"}');projectRoot=secondRoot;const changed=await request(running.url+'scene.json',{headers:{'If-None-Match':first.headers.etag}});assert.equal(changed.status,200);assert.equal(changed.body.toString(),'{"scene":"other"}');assert.notEqual(changed.headers.etag,first.headers.etag);assert.ok(!changed.headers.etag.includes(secondRoot));assert.equal((await request(running.url+'scene.json',{headers:{'If-None-Match':changed.headers.etag}})).status,304);
});

test('aborted compressed responses close their source stream and read failures leave the server usable',async t=>{
 const f=await fixture(t),large=path.join(f.root,'large.js');await fs.promises.writeFile(large,randomBytes(2*1024*1024));await fs.promises.writeFile(path.join(f.root,'healthy.json'),'{}');const original=fs.createReadStream;let source,closed;fs.createReadStream=(file,...args)=>{const value=original(file,...args);if(file===large){source=value;closed=new Promise(resolve=>value.once('close',resolve));}return value;};
 try{await new Promise((resolve,reject)=>{const req=http.get(f.url+'large.js',{headers:{'Accept-Encoding':'gzip'},agent:false},res=>{res.once('data',()=>{res.destroy();req.destroy();resolve();});res.on('error',()=>{});});req.on('error',error=>{if(error.code!=='ECONNRESET')reject(error);});});await Promise.race([closed,new Promise((_,reject)=>setTimeout(()=>reject(Error('Aborted file stream did not close')),2000))]);assert.ok(source.destroyed);assert.ok(source.bytesRead<2*1024*1024,'abort stops reading the remaining file');
  let failedSource;fs.createReadStream=(file,...args)=>file===large?(failedSource=new Readable({read(){this.destroy(Error('Fixture read failure'));}})):original(file,...args);await assert.rejects(request(f.url+'large.js',{headers:{'Accept-Encoding':'gzip'}}));await tick();assert.ok(failedSource.destroyed);assert.equal((await request(f.url+'healthy.json')).body.toString(),'{}');
 }finally{fs.createReadStream=original;}
});

test('HTTPS network sharing inherits compression and validation while private routes remain inaccessible',async t=>{
 const root=await fs.promises.mkdtemp(path.join(os.tmpdir(),'tour-share-performance-'));let server;t.after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await fs.promises.rm(root,{recursive:true,force:true});});await fs.promises.writeFile(path.join(root,'viewer.js'),text);await fs.promises.writeFile(path.join(root,'autosave.json'),'private');const share=await startSharing({root,host:'127.0.0.1',port:0,cacheRoot:path.join(root,'certificate')});server=share.server;
 const first=await request(share.url+'viewer.js',{headers:{'Accept-Encoding':'gzip'}});assert.equal(first.status,200);assert.equal(first.headers['content-encoding'],'gzip');assert.equal(first.headers['permissions-policy'],'xr-spatial-tracking=(self)');assert.deepEqual(gunzipSync(first.body),text);const repeat=await request(share.url+'viewer.js',{headers:{'Accept-Encoding':'gzip','If-None-Match':first.headers.etag}});assert.equal(repeat.status,304);assert.equal(repeat.body.length,0);assert.equal((await request(share.url+'autosave.json',{headers:{'If-None-Match':'*'}})).status,404);assert.equal((await request(share.url+'__launcher')).status,404);
});
