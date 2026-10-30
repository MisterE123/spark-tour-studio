import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionStream} from '../shared/collision-stream.mjs';
import {raycastCollision} from '../shared/collision-ray.mjs';
import {encodeCollisionTile,collisionSha256,collisionTileBounds} from '../shared/paged-collision.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(concurrency=3){
 const tiles=[],bodies=new Map(),requests=[];let active=0,maximum=0;
 for(let x=0;x<5;x++){
  const coord=[x,0,0],bytes=encodeCollisionTile({coord,tileCells:8,full:true}),entry={key:coord.join(','),coord,url:'tiles/'+x+'.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,4),voxels:512};tiles.push(entry);bodies.set('https://tour.test/'+entry.url,bytes);
 }
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.5,tileCells:8,tileSize:4,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[20,4,4]},tiles};
 const stream=new CollisionStream(manifest,'https://tour.test/collision.json',{concurrency,maxTiles:2,maxBytes:96,fetch:(url,{signal})=>new Promise((resolve,reject)=>{
  active++;maximum=Math.max(maximum,active);let done=false;const finish=()=>{if(done)return false;done=true;active--;signal.removeEventListener('abort',abort);return true;};
  const abort=()=>{if(finish())reject(new DOMException('Stopped test transfer','AbortError'));};
  requests.push({url,signal,release:()=>{if(finish())resolve(new Response(bodies.get(url)));}});signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
 })});
 return {stream,tiles,requests,get maximum(){return maximum;}};
}

test('abandoned collision rays abort their unshared transfer and free the bounded queue for a newer aim',async()=>{
 const f=await fixture(1),abort=new AbortController();try{
  const old=raycastCollision(f.stream,[2,2,2],[1,0,0],{signal:abort.signal});assert.equal(f.requests.length,1);abort.abort();await assert.rejects(old,{name:'AbortError'});await tick();assert.equal(f.requests[0].signal.aborted,true);assert.equal(f.stream.pending.size,0);assert.equal(f.stream.failures.size,0,'cancellation must not create a retry failure');
  const next=f.stream.load(f.tiles[1]);assert.equal(f.requests.length,2,'new work starts without waiting for the abandoned download');f.requests[1].release();await next;assert.ok(f.stream.allowsPoint([6,2,2]));assert.equal(f.stream.allowsPoint([2,2,2]),false);assert.equal(f.maximum,1);assert.equal(f.stream.maxTiles,2);assert.equal(f.stream.maxBytes,96);
 }finally{f.stream.dispose();}
});

test('one cancelled query cannot abort another consumer of the same collision tile',async()=>{
 const f=await fixture(),a=new AbortController(),b=new AbortController();try{
  const first=f.stream.load(f.tiles[0],{signal:a.signal}),second=f.stream.load(f.tiles[0],{signal:b.signal});a.abort();await assert.rejects(first,{name:'AbortError'});assert.equal(f.requests.length,1);assert.equal(f.requests[0].signal.aborted,false);f.requests[0].release();await second;assert.ok(f.stream.allowsPoint([2,2,2]));assert.equal(f.stream.pending.size,0);
 }finally{f.stream.dispose();}
});

test('primary support requests and pinned physics survive query cancellation',async()=>{
 const f=await fixture(),a=new AbortController(),b=new AbortController();try{
  const primary=f.stream.load(f.tiles[0]),query=f.stream.load(f.tiles[0],{signal:a.signal});a.abort();await assert.rejects(query,{name:'AbortError'});assert.equal(f.requests[0].signal.aborted,false);f.requests[0].release();await primary;
  f.stream.pinned=new Set([f.tiles[1].key]);const pinned=f.stream.load(f.tiles[1],{signal:b.signal}),verified=f.stream.pending.get(f.tiles[1].key);b.abort();await assert.rejects(pinned,{name:'AbortError'});assert.equal(f.requests[1].signal.aborted,false,'a pinned floor keeps its transfer');f.requests[1].release();await verified;assert.ok(f.stream.allowsPoint([2,2,2]));assert.ok(f.stream.allowsPoint([6,2,2]));assert.equal(f.stream.resident.size,2);
 }finally{f.stream.dispose();}
});

test('cancelled queued requests never start and a released destination pin cancels unused work',async()=>{
 const f=await fixture(1),a=new AbortController(),b=new AbortController();try{
  const first=f.stream.load(f.tiles[0]),queued=f.stream.load(f.tiles[1],{signal:a.signal});a.abort();await assert.rejects(queued,{name:'AbortError'});f.requests[0].release();await first;await tick();assert.equal(f.requests.length,1);
  f.stream.pinned=new Set([f.tiles[2].key]);const pinned=f.stream.load(f.tiles[2],{signal:b.signal});b.abort();await assert.rejects(pinned,{name:'AbortError'});assert.equal(f.requests[1].signal.aborted,false);f.stream.pinned.clear();f.stream.releaseUnpinned();await tick();assert.equal(f.requests[1].signal.aborted,true);assert.equal(f.stream.pending.size,0);assert.equal(f.stream.failures.size,0);
 }finally{f.stream.dispose();}
});

test('disposing a collision scene aborts in-flight requests and rejects queued requests',async()=>{
 const f=await fixture(1),a=f.stream.load(f.tiles[0]),b=f.stream.load(f.tiles[1]);f.stream.dispose();await Promise.all([assert.rejects(a,{name:'AbortError'}),assert.rejects(b,{name:'AbortError'})]);await tick();assert.ok(f.requests.every(request=>request.signal.aborted));assert.equal(f.stream.pending.size,0);assert.equal(f.stream.bytes,0);assert.equal(f.stream.failures.size,0);
});
