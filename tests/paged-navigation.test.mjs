import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry} from 'three';
import {bakeNavigationSector,createPagedNavigation,validateNavigationData} from '../shared/paged-navigation.mjs';
import {PagedNavigationLoader} from '../shared/paged-navigation-loader.mjs';
import {encodeCollisionTile,decodeCollisionTile,collisionTileSurface,containsCollisionCell,collisionCellId} from '../shared/paged-collision.mjs';
import {compileNavigableDomain,navigableTileKeys,allowedCollisionCells,collisionFieldCells} from '../shared/paged-collision-generator.mjs';
import {Worker} from 'node:worker_threads';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';

test('prebaked walking tiles join seams, unload missing sectors and dispose',async()=>{
 const floor=new BoxGeometry(24,.2,12);floor.translate(12,-.1,4);const part={positions:floor.attributes.position.array,indices:floor.index.array},config={tileSize:8,bounds:{min:[0,-1,-2],max:[24,4,10]}};
 const first=await bakeNavigationSector([part],{...config,coord:[0,0]}),second=await bakeNavigationSector([part],{...config,coord:[1,0]});floor.dispose();assert.ok(first?.byteLength);assert.ok(second?.byteLength);assert.throws(()=>validateNavigationData(first.subarray(0,first.length-1),'0,0'),/Truncated/);assert.throws(()=>validateNavigationData(first,'1,0'),/identity/);
 const nav=await createPagedNavigation({...config,origin:[0,-1.5,0]});try{nav.sync([{key:'0,0',data:first},{key:'1,0',data:second}]);assert.equal(nav.residentCount,2);const route=nav.path({x:2,y:0,z:4},{x:14,y:0,z:4});assert.ok(route.length>=2);assert.ok(Math.abs(route.at(-1).x-14)<.1);nav.sync([{key:'0,0',data:first}]);assert.equal(nav.residentCount,1);assert.throws(()=>nav.path({x:2,y:0,z:4},{x:14,y:0,z:4}),/surface|route/);nav.sync([{key:'0,0',data:first},{key:'1,0',data:second}]);assert.ok(nav.path({x:2,y:0,z:4},{x:14,y:0,z:4}).length);}finally{nav.dispose();nav.dispose();}assert.throws(()=>nav.path({x:2,y:0,z:4},{x:14,y:0,z:4}),/closed/);
});

test('2 m, 16 m and 64 m walking tiles connect with only immediate neighbor geometry',async()=>{
 for(const [tileSize,cellSize] of [[2,.05],[2,.1],[16,.05],[16,.1],[64,.1]]){
  const floors=Array.from({length:4},(_,index)=>{const floor=new BoxGeometry(tileSize,.2,tileSize*3);floor.translate((index-.5)*tileSize,-.1,tileSize*.5);return floor;}),parts=floors.map(floor=>({positions:floor.attributes.position.array,indices:floor.index.array})),config={tileSize,cellSize,bounds:{min:[-tileSize,-1,-tileSize],max:[tileSize*3,3,tileSize*2]}};
  try{const first=await bakeNavigationSector(parts.slice(0,3),{...config,coord:[0,0]}),second=await bakeNavigationSector(parts.slice(1,4),{...config,coord:[1,0]});assert.ok(first?.byteLength);assert.ok(second?.byteLength);const native=await createPagedNavigation({...config,origin:[0,-1.5,0]});try{native.sync([{key:'0,0',data:first},{key:'1,0',data:second}]);const end={x:tileSize*1.5,y:0,z:tileSize*.5},route=native.path({x:tileSize*.5,y:0,z:tileSize*.5},end);assert.ok(route.length>=2);assert.ok(Math.hypot(route.at(-1).x-end.x,route.at(-1).z-end.z)<.1,`${tileSize} m / ${cellSize} m seam`);}finally{native.dispose();}}finally{for(const floor of floors)floor.dispose();}
 }
});

test('walking tiles use local height bounds on a shared grid despite distant scene heights',async()=>{
 const floor=new BoxGeometry(24,.2,12);floor.translate(12,9999.9,4);const part={positions:floor.attributes.position.array,indices:floor.index.array},config={tileSize:8,bounds:{min:[0,-100000,-2],max:[24,100000,10]}};
 const first=await bakeNavigationSector([part],{...config,coord:[0,0]}),second=await bakeNavigationSector([part],{...config,coord:[1,0]});floor.dispose();assert.ok(first?.byteLength);assert.ok(second?.byteLength);const nav=await createPagedNavigation({...config,origin:[0,-100000.5,0]});try{nav.sync([{key:'0,0',data:first},{key:'1,0',data:second}]);const route=nav.path({x:2,y:10000,z:4},{x:14,y:10000,z:4});assert.ok(route.length>=2);assert.ok(Math.abs(route.at(-1).y-10000)<.12);}finally{nav.dispose();}
});

test('sparse coarse RAD floors omit confirmed empty nav sectors without failing collision generation',async()=>{
 const detail=.2,n=40,tileSize=8,transform={position:[0,0,0],rotation:[0,0,0],scale:1},domain=compileNavigableDomain({scope:'entire',bounds:{id:'bounds',type:'box',operation:'add',position:[0,0,0],rotation:[0,0,0],size:[6.8,.8,6.8]},volumes:[],options:{extrudeUp:true,wallHeight:3}},transform),keys=navigableTileKeys(domain.bounds,tileSize),obstacles=new Map();
 // Actual RAD centers are Float32. Quantization at this coarse voxel spacing
 // leaves small floor islands that cannot all survive the walking-radius filter.
 for(let x=-15;x<=15;x++)for(let z=-15;z<=15;z++){const cell=[Math.fround(x*.2),0,Math.fround(z*.2)].map(value=>Math.floor(value/detail)),coord=cell.map(value=>Math.floor(value/n)),key=coord.join(',');let field=obstacles.get(key);if(!field)obstacles.set(key,field=new Uint8Array(n**3));field[collisionCellId(...cell.map((value,axis)=>value-coord[axis]*n),n)]=1;}
 const tiles=new Map();for(const key of keys){const coord=key.split(',').map(Number),free=allowedCollisionCells(coord,n,detail,domain.contains,obstacles.get(key));if(!free.voxels)continue;tiles.set(key,decodeCollisionTile(encodeCollisionTile({coord,tileCells:n,occupied:collisionFieldCells(free.field)}),{expand:false}));}
 const neighbor=cell=>{const coord=cell.map(value=>Math.floor(value/n)),tile=tiles.get(coord.join(','));return !!tile&&containsCollisionCell(tile,...cell.map((value,axis)=>value-coord[axis]*n));},parts=[...tiles.values()].map(tile=>collisionTileSurface(tile,detail,{allowed:true,neighbor}));let empty=0,nonempty=0;
 for(const coord of [[-1,-1],[-1,0],[0,-1],[0,0]]){const data=await bakeNavigationSector(parts,{coord,tileSize,bounds:{min:[-8,-8,-8],max:[8,8,8]}});if(data?.length){validateNavigationData(data,coord.join(','));nonempty++;}else empty++;}
 assert.ok(empty>0,'confirmed unwalkable sectors are omitted');assert.ok(nonempty>0,'usable walking sectors remain');await assert.rejects(bakeNavigationSector(parts,{coord:[0,0],tileSize:-1,bounds:{min:[0,0,0],max:[1,1,1]}}),/Invalid/);
});

test('authoring worker bakes allowed-space sectors with open seams and verified descriptors',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-paged-nav-'));let worker;try{
  await fs.mkdir(path.join(root,'tiles'));const tiles=[],tileCells=32,detail=.1,tileSize=3.2;
  for(let x=0;x<2;x++){const coord=[x,0,0],data=encodeCollisionTile({coord,tileCells,occupied:Uint32Array.from({length:tileCells**3},(_,index)=>index)}),url=`tiles/${x}_0_0.scv`;await fs.writeFile(path.join(root,url),data);tiles.push({key:coord.join(','),coord,url,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex'),voxels:tileCells**3,bounds:{min:[x*tileSize,0,0],max:[(x+1)*tileSize,tileSize,tileSize]}});}
  const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},tiles,tileCells,detail,tileSize,bounds:{min:[0,0,0],max:[6.4,3.2,3.2]}};
  worker=new Worker(new URL('../desktop/paged-collision-navigation.cjs',import.meta.url),{workerData:{root,manifest,stepHeight:.42}});const navigation=await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',message=>{if(message.type==='error')reject(Error(message.message));else if(message.type==='complete')resolve(message.navigation);});});
  assert.equal(navigation.stepHeight,.42);assert.equal(navigation.tiles.length,2);const native=await createPagedNavigation(navigation);try{const resident=[];for(const entry of navigation.tiles){const data=new Uint8Array(await fs.readFile(path.join(root,entry.url)));assert.equal(data.length,entry.bytes);assert.equal(createHash('sha256').update(data).digest('hex'),entry.sha256);resident.push({key:entry.key,data});}native.sync(resident);assert.ok(native.path({x:1,y:0,z:1.6},{x:5.4,y:0,z:1.6}).length>=2);}finally{native.dispose();}
 }finally{await worker?.terminate();assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});}
});

function descriptor(x,z){return {key:`${x},${z}`,coord:[x,z],url:`nav/${x}_${z}.bin`,bytes:4};}
test('paged routes fetch a bounded corridor, reuse tiles and reject disconnected destinations',async()=>{
 const tiles=Array.from({length:50},(_,x)=>descriptor(x,0)),loaded=[],loader=new PagedNavigationLoader({tileSize:8,tiles},async entry=>{loaded.push(entry.key);return new Uint8Array(4);},{maxTiles:8,maxBytes:32});
 try{const result=await loader.route({x:1,y:0,z:1},{x:20,y:0,z:1});assert.equal(result.length,4);assert.deepEqual(loaded,['0,0','1,0','2,0','3,0']);await loader.route({x:1,y:0,z:1},{x:20,y:0,z:1});assert.equal(loaded.length,4);assert.throws(()=>loader.corridor({x:1,z:1},{x:180,z:1}),/far away/);assert.ok(loader.bytes<=32);}finally{loader.dispose();}assert.equal(loader.bytes,0);assert.equal(loader.cache.size,0);
 const disconnected=new PagedNavigationLoader({tileSize:8,tiles:[descriptor(0,0),descriptor(2,0)]},async()=>new Uint8Array(4));assert.throws(()=>disconnected.corridor({x:1,z:1},{x:17,z:1}),/route/);disconnected.dispose();
});
test('failed walking tile requests can be retried, cancelled results cannot enter cache',async()=>{
 let fail=true;const loader=new PagedNavigationLoader({tileSize:8,tiles:[descriptor(0,0)]},async()=>{if(fail)throw Error('network unavailable');return new Uint8Array(4);});await assert.rejects(loader.route({x:1,z:1},{x:2,z:1}),/network/);assert.equal(loader.cache.size,0);fail=false;assert.equal((await loader.route({x:1,z:1},{x:2,z:1})).length,1);loader.dispose();
 let release;const controller=new AbortController(),cancelled=new PagedNavigationLoader({tileSize:8,tiles:[descriptor(0,0)]},()=>new Promise(resolve=>{release=resolve;})),pending=cancelled.route({x:1,z:1},{x:2,z:1},controller.signal);controller.abort();release(new Uint8Array(4));await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(cancelled.cache.size,0);cancelled.dispose();
});
test('missing optional navigation neighbors do not discard a healthy walking corridor and retry later',async()=>{
 let fail=true;const requested=[],loader=new PagedNavigationLoader({tileSize:8,tiles:[descriptor(0,0),descriptor(1,0),descriptor(0,1)]},async entry=>{requested.push(entry.key);if(fail&&entry.key==='0,1')throw Error('Navigation tile request failed (404).');return new Uint8Array(4);});
 try{assert.deepEqual((await loader.route({x:1,z:1},{x:9,z:1})).map(entry=>entry.key),['0,0','1,0']);assert.equal(loader.cache.has('0,1'),false);fail=false;assert.deepEqual((await loader.route({x:1,z:1},{x:9,z:1})).map(entry=>entry.key),['0,0','1,0','0,1']);assert.equal(requested.filter(key=>key==='0,1').length,2);}finally{loader.dispose();}
});

test('route byte budgets are checked before download and optional halos fit remaining memory',async()=>{
 let requests=0;const oversized=new PagedNavigationLoader({tileSize:8,tiles:[{...descriptor(0,0),bytes:20},{...descriptor(1,0),bytes:20}]},async entry=>{requests++;return new Uint8Array(entry.bytes);},{maxBytes:32});try{await assert.rejects(oversized.route({x:1,z:1},{x:9,z:1}),/memory/);assert.equal(requests,0);assert.equal(oversized.bytes,0);}finally{oversized.dispose();}
 const entries=Array.from({length:10},(_,x)=>descriptor(x,0)),loaded=[],bounded=new PagedNavigationLoader({tileSize:8,tiles:entries},async entry=>{loaded.push(entry.key);return new Uint8Array(entry.bytes);},{maxBytes:8});try{const route=await bounded.route({x:1,z:1},{x:9,z:1});assert.deepEqual(route.map(tile=>tile.key),['0,0','1,0']);assert.deepEqual(loaded,['0,0','1,0']);assert.equal(bounded.bytes,8);assert.equal(route.reduce((bytes,tile)=>bytes+tile.data.byteLength,0),8);}finally{bounded.dispose();}
});

test('disposing a navigation loader cancels pending requests and clears route residency',async()=>{
 let cancelled=false;const loader=new PagedNavigationLoader({tileSize:8,tiles:[descriptor(0,0)]},(_entry,signal)=>new Promise((_resolve,reject)=>{signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('cancelled','AbortError'));},{once:true});})),pending=loader.route({x:1,z:1},{x:2,z:1});assert.equal(loader.active.size,1);loader.dispose();await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(cancelled,true);assert.equal(loader.active.size,0);assert.equal(loader.bytes,0);assert.equal(loader.cache.size,0);
});
