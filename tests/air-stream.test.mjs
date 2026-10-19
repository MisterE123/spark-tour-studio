import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionStream} from '../shared/collision-stream.mjs';
import {collisionCellId,collisionSha256,encodeCollisionTile,collisionTileBounds} from '../shared/paged-collision.mjs';

async function fixture(){
 const coord=[256,0,0],occupied=[];for(let x=1;x<8;x++)for(let y=0;y<8;y++)for(let z=0;z<8;z++)occupied.push(collisionCellId(x,y,z,8));
 const bytes=encodeCollisionTile({coord,tileCells:8,occupied}),entry={key:coord.join(','),coord,url:'wall.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),voxels:occupied.length,bounds:collisionTileBounds(coord,8)};
 return {bytes,entry,manifest:{format:'spark-tour-collision',version:1,representation:'allowed-space',detail:1,tileCells:8,tileSize:8,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[2056,2048,2048]},airNodes:[{coord:[0,0,0],level:8}],tiles:[entry]}};
}

test('a certified parent opens a large uniform region without fetching or visiting its leaves',async()=>{
 const f=await fixture(),requests=[],stream=new CollisionStream(f.manifest,'https://tour.test/scene.collision.json',{fetch:async url=>{requests.push(url);throw Error('No empty-air payload should be requested.');}});
 try{
  assert.equal(stream.allowsCapsule([8,1.7,8],[2000,1.7,2000],.24),true);assert.equal(stream.lastCapsuleQuery.tiles,1,'one exact parent replaces over 60,000 leaf checks');assert.equal(stream.resident.size,0);assert.equal(requests.length,0);
  assert.equal(stream.allowsCapsule([8,1.7,8],[2049,1.7,8],.24),false,'unloaded mixed space stays blocked');assert.equal(stream.allowsPoint([-1,1,1]),false);
  await stream.ensureNear([1000,1000,1000],.5);assert.ok(stream.resident.size<=8);assert.equal(requests.length,0);for(const item of stream.resident.values()){assert.equal(item.bytes.length,48);assert.equal(item.tile.full,true);assert.equal(item.tile.occupied,undefined);}
 }finally{stream.dispose();}
});

test('certified air cannot mask an unloaded, unprepared, or solid mixed neighbor',async()=>{
 const f=await fixture(),requests=[],stream=new CollisionStream(f.manifest,'https://tour.test/scene.collision.json',{fetch:async url=>{requests.push(url);return new Response(f.bytes);}});let prepared=false;stream.available=()=>prepared;
 try{
  assert.equal(stream.allowsPoint([2053,1,4]),false);await stream.load(f.entry);assert.equal(requests.length,1);assert.equal(stream.allowsPoint([2053,1,4]),false,'downloaded mixed detail needs installed physics');
  assert.equal(stream.allowsPoint([2000,1,4]),true,'certified empty space is already complete data');prepared=true;assert.equal(stream.allowsPoint([2053,1,4]),true);
  assert.equal(stream.allowsCapsule([2046,1,4],[2053,1,4],.19),false,'the verified neighboring wall blocks the entire motion segment');
 }finally{stream.dispose();}
});

test('virtual air pages obey the same resident budget without losing the parent proof',async()=>{
 const f=await fixture(),stream=new CollisionStream(f.manifest,'https://tour.test/scene.collision.json',{maxTiles:2,maxBytes:96,fetch:async()=>{throw Error('Unexpected HTTP');}});
 try{for(const point of [[4,4,4],[12,4,4],[20,4,4],[28,4,4]])await stream.ensureNear(point,.1);assert.equal(stream.resident.size,2);assert.equal(stream.bytes,96);assert.equal(stream.allowsPoint([4,4,4]),true,'evicting a virtual surface does not erase complete air data');assert.equal(stream.allowsPoint([2053,1,4]),false);}finally{stream.dispose();}
});
