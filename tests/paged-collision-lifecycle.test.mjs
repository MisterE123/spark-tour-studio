import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {EventEmitter} from 'node:events';import {createRequire} from 'node:module';
import {encodeCollisionTile,collisionTileBounds} from '../shared/paged-collision.mjs';
const require=createRequire(import.meta.url),{PagedCollisionWriter,validateLocalManifest}=require('../desktop/paged-collision.cjs'),{attachClose}=require('../desktop/close.cjs');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};},turn=()=>new Promise(resolve=>setImmediate(resolve)),temporary=()=>fs.mkdtemp(path.join(os.tmpdir(),'spark-collision-lifecycle-'));
const outcome=promise=>promise.then(value=>({value}),error=>({error}));
function fixture(){const coord=[0,0,0],bytes=encodeCollisionTile({coord,tileCells:8,occupied:new Uint32Array([0,1,2,8])}),bounds=collisionTileBounds(coord,8),entry={key:'0,0,0',coord,url:'tiles/0_0_0.scv',bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bounds,voxels:4};return {bytes,entry,manifest:{format:'spark-tour-collision',version:1,representation:'allowed-space',coordinateSystem:'generation',detail:1,tileCells:8,tileSize:8,sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds,tiles:[entry]}};}
const noNavigation={prepareNavigation:async(_root,manifest)=>manifest};

test('concurrent abort callers share worker termination and the complete cleanup promise',async()=>{const root=await temporary(),stop=deferred();let cleanup;try{
 const writer=await PagedCollisionWriter.create(root);let calls=0,finished=false;writer.navWorker={terminate(){calls++;return stop.promise;}};cleanup=writer.abort();const repeated=writer.abort();assert.equal(repeated,cleanup);void repeated.then(()=>{finished=true;});await turn();assert.equal(finished,false);assert.equal(calls,1);await fs.access(writer.stage);stop.resolve();await cleanup;assert.equal(finished,true);await assert.rejects(fs.access(writer.stage));
 }finally{stop.resolve();await cleanup?.catch(()=>{});await fs.rm(root,{recursive:true,force:true});}});

test('abort drains an admitted tile write before removing staging and rejects new writes',async()=>{const root=await temporary(),entered=deferred(),release=deferred(),originalMkdir=fs.mkdir;let writing,cleanup;try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes}=fixture();fs.mkdir=async(folder,...args)=>{if(path.resolve(folder)===path.join(writer.stage,'tiles')){entered.resolve();await release.promise;}return originalMkdir(folder,...args);};writing=outcome(writer.writeTile(entry,bytes));await entered.promise;let finished=false;cleanup=writer.abort();void cleanup.then(()=>{finished=true;});await assert.rejects(writer.append('0,0,0',new Uint32Array([1])),/cancelled/);await turn();assert.equal(finished,false);release.resolve();assert.equal((await writing).error,undefined);await cleanup;await turn();assert.deepEqual(await fs.readdir(path.join(root,'colliders')),[]);
 }finally{release.resolve();fs.mkdir=originalMkdir;await writing;await cleanup?.catch(()=>{});await fs.rm(root,{recursive:true,force:true});}});

test('finalization waits for admitted writes and refuses concurrent mutations',async()=>{const root=await temporary(),entered=deferred(),release=deferred(),originalWrite=fs.writeFile;let writing,finishing;try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes,manifest}=fixture();fs.writeFile=async(file,...args)=>{if(path.resolve(file)===path.join(writer.stage,entry.url)){entered.resolve();await release.promise;}return originalWrite(file,...args);};writing=outcome(writer.writeTile(entry,bytes));await entered.promise;finishing=outcome(writer.finalize(manifest,noNavigation));await assert.rejects(writer.append('0,0,0',new Uint32Array([1])),/already finalizing/);await assert.rejects(writer.finalize(manifest,noNavigation),/already finalizing/);release.resolve();assert.equal((await writing).error,undefined);const result=await finishing;assert.equal(result.error,undefined);await validateLocalManifest(path.join(root,result.value));
 }finally{release.resolve();fs.writeFile=originalWrite;await writing;await finishing;await fs.rm(root,{recursive:true,force:true});}});

test('cancellation before commit drains a pending manifest write and publishes no output',async()=>{const root=await temporary(),entered=deferred(),release=deferred(),originalWrite=fs.writeFile;let finishing,cleanup;try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes,manifest}=fixture();await writer.writeTile(entry,bytes);fs.writeFile=async(file,...args)=>{if(path.resolve(file)===path.join(writer.stage,'scene.collision.json')){entered.resolve();await release.promise;}return originalWrite(file,...args);};finishing=outcome(writer.finalize(manifest,noNavigation));await entered.promise;let done=false;cleanup=writer.abort();void cleanup.then(()=>{done=true;});await turn();assert.equal(done,false);release.resolve();assert.match(String((await finishing).error),/cancelled/);await cleanup;assert.deepEqual(await fs.readdir(path.join(root,'colliders')),[]);
 }finally{release.resolve();fs.writeFile=originalWrite;await finishing;await cleanup?.catch(()=>{});await fs.rm(root,{recursive:true,force:true});}});

test('a finalize error handler can await the same abort without deadlock or early idle state',async()=>{const root=await temporary(),navEntered=deferred(),navRelease=deferred(),cleanupEntered=deferred(),cleanupRelease=deferred(),originalRemove=fs.rm;let finishing,cleanup;try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes,manifest}=fixture();await writer.writeTile(entry,bytes);let busy=true;
 fs.rm=async(folder,...args)=>{if(path.resolve(folder)===writer.stage){cleanupEntered.resolve();await cleanupRelease.promise;}return originalRemove(folder,...args);};
 // Match the main-process handler: its catch awaits abort outside the tracked
 // writer operation, and its finally releases ownership only after cleanup.
 finishing=outcome(writer.finalize(manifest,{prepareNavigation:async(_root,value)=>{navEntered.resolve();await navRelease.promise;return value;}}).catch(async error=>{await writer.abort();throw error;}).finally(()=>{busy=false;}));
 await navEntered.promise;cleanup=writer.abort();navRelease.resolve();await cleanupEntered.promise;await turn();assert.equal(busy,true);cleanupRelease.resolve();await cleanup;assert.match(String((await finishing).error),/cancelled/);assert.equal(busy,false);await assert.rejects(fs.access(writer.stage));
 }finally{navRelease.resolve();cleanupRelease.resolve();fs.rm=originalRemove;await finishing;await cleanup?.catch(()=>{});await fs.rm(root,{recursive:true,force:true});}});

test('cancellation during the final rename rolls back only the unpublished job directory',async()=>{const root=await temporary(),entered=deferred(),release=deferred(),originalRename=fs.rename;let finishing,cleanup;try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes,manifest}=fixture();await fs.mkdir(path.join(root,'colliders','previous'));await fs.writeFile(path.join(root,'colliders','previous','keep.txt'),'old collider');await writer.writeTile(entry,bytes);
 fs.rename=async(from,to)=>{const result=await originalRename(from,to);if(path.resolve(from)===writer.stage&&path.resolve(to)===writer.target){entered.resolve();await release.promise;}return result;};finishing=outcome(writer.finalize(manifest,noNavigation));await entered.promise;await fs.access(writer.target);cleanup=writer.abort();release.resolve();assert.match(String((await finishing).error),/cancelled/);await cleanup;assert.deepEqual(await fs.readdir(path.join(root,'colliders')),['previous']);assert.equal(await fs.readFile(path.join(root,'colliders','previous','keep.txt'),'utf8'),'old collider');
 }finally{release.resolve();fs.rename=originalRename;await finishing;await cleanup?.catch(()=>{});await fs.rm(root,{recursive:true,force:true});}});

test('abort after a committed finalization preserves the published asset',async()=>{const root=await temporary();try{
 const writer=await PagedCollisionWriter.create(root),{entry,bytes,manifest}=fixture();await writer.writeTile(entry,bytes);const ref=await writer.finalize(manifest,noNavigation);await writer.abort();await writer.abort();await validateLocalManifest(path.join(root,ref));
 }finally{await fs.rm(root,{recursive:true,force:true});}});

test('closing the editor waits for asynchronous native cancellation before destroying its window',async()=>{
 const win=new EventEmitter(),entered=deferred(),release=deferred(),destroyed=deferred();let closed=false;win.webContents=new EventEmitter();win.webContents.executeJavaScript=async()=>({dirty:false});win.destroy=()=>{closed=true;destroyed.resolve();};
 attachClose({win,dialog:{showMessageBox:async()=>({response:1})},model:{},getRoot:()=>'',getSources:()=>({}),isBusy:()=>true,cancelJob:async()=>{entered.resolve();await release.promise;}});
 win.emit('close',{preventDefault(){}});await entered.promise;await turn();assert.equal(closed,false);release.resolve();await destroyed.promise;assert.equal(closed,true);
});
