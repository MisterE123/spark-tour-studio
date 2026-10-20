import test from 'node:test';import assert from 'node:assert/strict';
import {CollisionStream,segmentBoxDistanceSquared} from '../shared/collision-stream.mjs';
import {encodeCollisionTile,collisionSha256,collisionTileBounds,collisionCellId,COLLISION_TILE_HEADER_BYTES} from '../shared/paged-collision.mjs';
async function fixture(coords=[[0,0,0]]){
 const bodies=new Map(),tiles=[];
 for(const coord of coords){const occupied=Array.from({length:512},(_,i)=>i),bytes=encodeCollisionTile({coord,tileCells:8,occupied}),entry={key:coord.join(','),coord,url:'tiles/'+coord.join('_')+'.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,4),voxels:512};tiles.push(entry);bodies.set(new URL(entry.url,'https://tour.test/collider/scene.collision.json').href,bytes);}
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.5,tileCells:8,tileSize:4,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[-4,-4,-4],max:[20,8,8]},tiles,stats:{}};
 return {manifest,bodies,fetch:async url=>new Response(bodies.get(url)||'',{status:bodies.has(url)?200:404})};
}
test('allowed space stays blocked until verified and neighboring holes join without implicit exterior access',async()=>{
 const f=await fixture([[0,0,0],[1,0,0]]),stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{fetch:f.fetch});
 assert.equal(stream.allowsPoint([2,2,2]),false);await stream.load(f.manifest.tiles[0]);assert.equal(stream.allowsPoint([2,2,2]),true);assert.equal(stream.allowsPoint([-1,2,2]),false);
 assert.ok(stream.allowsCapsule([2,1,2],[2,3,2],.25));assert.equal(stream.allowsCapsule([3.9,2,2],[3.9,2,2],.25),false,'unloaded neighbor remains solid');
 await stream.load(f.manifest.tiles[1]);assert.ok(stream.allowsCapsule([3.9,2,2],[4.1,2,2],.25),'loaded free seam is open');assert.equal(stream.allowsCapsule([2,.1,2],[2,2,2],.25),false,'capsule cannot extend below domain');stream.dispose();assert.equal(stream.resident.size,0);
});
test('residency is bounded, failures never create air, and failed tiles can be retried',async()=>{
 const f=await fixture([[0,0,0],[1,0,0],[2,0,0]]);let fail=true;const stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{maxTiles:2,fetch:async url=>fail&&url.endsWith('2_0_0.scv')?new Response('no',{status:503}):f.fetch(url)});
 await stream.ensureNear([2,2,2],.1);await stream.ensureNear([6,2,2],.1);await assert.rejects(stream.ensureNear([10,2,2],.1),/503/);assert.equal(stream.allowsPoint([10,2,2]),false);fail=false;await stream.ensureNear([10,2,2],.1);assert.equal(stream.resident.size,2);assert.ok(stream.allowsPoint([10,2,2]));assert.equal(stream.allowsPoint([2,2,2]),false,'evicted tiles return to solid');stream.dispose();
});
test('corruption and oversized responses do not enter the resident set',async()=>{
 const f=await fixture(),entry=f.manifest.tiles[0],bad=f.bodies.values().next().value.slice();bad[bad.length-1]^=1;
 for(const response of [()=>new Response(bad),()=>new Response(new Uint8Array(entry.bytes+1))]){const stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{fetch:async()=>response()});await assert.rejects(stream.load(entry),/checksum|oversized/);assert.equal(stream.resident.size,0);stream.dispose();}
});
test('automatic missing-page retries are throttled while explicit queries can recover immediately',async()=>{
 const f=await fixture(),entry=f.manifest.tiles[0];let requests=0,fail=true;
 const stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{fetch:async url=>{requests++;return fail?new Response('',{status:404}):f.fetch(url);}});
 try{
  await assert.rejects(stream.load(entry,{retryDelay:3000}),/404/);await assert.rejects(stream.load(entry,{retryDelay:3000}),/404/);assert.equal(requests,1);assert.equal(stream.allowsPoint([2,2,2]),false);
  fail=false;await stream.load(entry);assert.equal(requests,2);assert.ok(stream.allowsPoint([2,2,2]));assert.equal(stream.failures.size,0);assert.equal(stream.failedAt.size,0);
  stream.resident.clear();stream.bytes=0;fail=true;await assert.rejects(stream.load(entry,{retryDelay:3000}),/404/);stream.failedAt.set(entry.key,Date.now()-3001);fail=false;await stream.load(entry,{retryDelay:3000});assert.equal(requests,4);assert.ok(stream.allowsPoint([2,2,2]));
 }finally{stream.dispose();}assert.equal(stream.failures.size,0);assert.equal(stream.failedAt.size,0);
});
test('capsule-box distance handles rotated segments and grazing corners exactly',()=>{
 assert.equal(segmentBoxDistanceSquared([-2,0,0],[2,0,0],[-1,-1,-1],[1,1,1]),0);
 assert.equal(segmentBoxDistanceSquared([2,2,0],[2,3,0],[-1,-1,-1],[1,1,1]),2);
 assert.equal(segmentBoxDistanceSquared([0,0,0],[1,1,1],[2,2,2],[3,3,3]),3);
 assert.equal(segmentBoxDistanceSquared([3,1,0],[1,3,0],[0,0,-1],[1,1,1]),2);
});

function denseTileWithHole(coord,n,hole){
 const full=encodeCollisionTile({coord,tileCells:n,full:true});if(!hole)return full;
 const axis=n/4,count=axis**3,bytes=new Uint8Array(COLLISION_TILE_HEADER_BYTES+count*12);bytes.set(full);const view=new DataView(bytes.buffer);view.setUint32(24,count,true);view.setUint32(28,n**3-1,true);view.setUint32(32,0,true);
 for(let i=0;i<count;i++){const offset=COLLISION_TILE_HEADER_BYTES+i*12;view.setUint32(offset,i,true);view.setUint32(offset+4,0xffffffff,true);view.setUint32(offset+8,0xffffffff,true);}
 const [x,y,z]=hole,key=(Math.floor(x/4)*axis+Math.floor(y/4))*axis+Math.floor(z/4),bit=((x%4)*4+y%4)*4+z%4,offset=COLLISION_TILE_HEADER_BYTES+key*12+4+(bit>>>5)*4;view.setUint32(offset,(0xffffffff^(1<<(bit&31)))>>>0,true);return bytes;
}
async function detailedFixture(hole){
 const n=80,detail=.01,tileSize=n*detail,bodies=new Map(),tiles=[];
 for(let y=0;y<3;y++){const coord=[0,y,0],bytes=denseTileWithHole(coord,n,y===0?hole:undefined),entry={key:coord.join(','),coord,url:`tiles/0_${y}_0.scv`,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,tileSize),voxels:n**3-(y===0&&hole?1:0)};tiles.push(entry);bodies.set(new URL(entry.url,'https://tour.test/collider/scene.collision.json').href,bytes);}
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail,tileCells:n,tileSize,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[tileSize,tileSize*3,tileSize]},tiles,stats:{}};
 return {manifest,fetch:async url=>new Response(bodies.get(url)||'',{status:bodies.has(url)?200:404})};
}
test('1 cm walking capsules skip compact full tiles rather than rejecting their large cell bounds',async()=>{
 const f=await detailedFixture(),stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{fetch:f.fetch}),a=[.4,.3,.4],b=[.4,1.5,.4];try{
  assert.equal(stream.allowsCapsule(a,b,.25),false,'unloaded data is still blocked');for(const entry of f.manifest.tiles)await stream.load(entry);
  assert.ok(stream.allowsCapsule(a,b,.25));assert.deepEqual(stream.lastCapsuleQuery,{tiles:3,bricks:0,cells:0},'over 400,000 cells resolve through three compact tiles');
  stream.available=key=>key!=='0,1,0';assert.equal(stream.allowsCapsule(a,b,.25),false,'downloaded but unprepared neighbors stay blocked');stream.available=()=>true;
  assert.equal(stream.allowsCapsule([.05,.3,.4],[.05,1.5,.4],.25),false,'capsule cannot cross the outside domain');
 }finally{stream.dispose();}
});
test('1 cm mixed tiles skip full-free bricks and still detect a single blocked voxel',async()=>{
 for(const [hole,expected] of [[[0,0,0],true],[[40,40,40],false]]){const f=await detailedFixture(hole),stream=new CollisionStream(f.manifest,'https://tour.test/collider/scene.collision.json',{fetch:f.fetch});try{
  for(const entry of f.manifest.tiles)await stream.load(entry);assert.equal(stream.allowsCapsule([.4,.3,.4],[.4,1.5,.4],.25),expected);
  assert.ok(stream.lastCapsuleQuery.bricks<5000,'mixed tile query stays at brick granularity');assert.ok(stream.lastCapsuleQuery.cells<=1,'only the isolated blocked voxel needs an exact test');
 }finally{stream.dispose();}}
});
test('brick queries match a cell-by-cell oracle for rotated capsules, negative tiles and mixed boundaries',async()=>{
 const n=8,detail=.2,tiles=[],bodies=new Map();for(const coord of [[-1,0,0],[0,0,0]]){const occupied=[];for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++)if((x*13+y*7+z*3)%17!==0)occupied.push(collisionCellId(x,y,z,n));const bytes=encodeCollisionTile({coord,tileCells:n,occupied}),entry={key:coord.join(','),coord,url:`tiles/${coord.join('_')}.scv`,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,n*detail),voxels:occupied.length};tiles.push(entry);bodies.set(new URL(entry.url,'https://tour.test/collider/scene.collision.json').href,bytes);}
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail,tileCells:n,tileSize:n*detail,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[-1.6,0,0],max:[1.6,1.6,1.6]},tiles,stats:{}},stream=new CollisionStream(manifest,'https://tour.test/collider/scene.collision.json',{fetch:async url=>new Response(bodies.get(url))});try{
  for(const entry of tiles)await stream.load(entry);
  let seed=271828;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const brute=(a,b,radius)=>{const low=a.map((v,i)=>Math.floor((Math.min(v,b[i])-radius)/detail)),high=a.map((v,i)=>Math.floor((Math.max(v,b[i])+radius)/detail));for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){if(stream.hasCell([x,y,z]))continue;const min=[x,y,z].map(v=>v*detail),max=min.map(v=>v+detail);if(segmentBoxDistanceSquared(a,b,min,max)<radius*radius-1e-10)return false;}return true;};
  for(let i=0;i<100;i++){const a=[random()*2.8-1.4,random()*1.2+.2,random()*1.2+.2],b=[a[0]+random()*.8-.4,a[1]+random()*.8-.4,a[2]+random()*.8-.4],radius=.03+random()*.2;assert.equal(stream.allowsCapsule(a,b,radius),brute(a,b,radius),JSON.stringify({a,b,radius}));}
 }finally{stream.dispose();}
});
