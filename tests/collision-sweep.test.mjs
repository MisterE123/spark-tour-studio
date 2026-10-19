import test from 'node:test';
import assert from 'node:assert/strict';
import {CollisionStream,segmentBoxDistanceSquared} from '../shared/collision-stream.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';

async function fixture({n=16,detail=.1,coords=[[0,0,0]],blocked=()=>false,airNodes}={}){
 const tiles=[],bodies=new Map(),size=n*detail;
 for(const coord of coords){const occupied=[];for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){const global=[x,y,z].map((v,i)=>v+coord[i]*n);if(!blocked(global))occupied.push(collisionCellId(x,y,z,n));}const bytes=encodeCollisionTile({coord,tileCells:n,occupied}),entry={key:coord.join(','),coord,url:'tiles/'+coord.join('_')+'.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),voxels:occupied.length,bounds:collisionTileBounds(coord,size)};tiles.push(entry);bodies.set(new URL(entry.url,'https://tour.test/collision/scene.collision.json').href,bytes);}
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail,tileCells:n,tileSize:size,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,1,2].map(i=>Math.min(...coords.map(coord=>coord[i]))*size),max:[0,1,2].map(i=>(Math.max(...coords.map(coord=>coord[i]))+1)*size)},tiles,...(airNodes?{airNodes}:{})};
 const stream=new CollisionStream(manifest,'https://tour.test/collision/scene.collision.json',{fetch:async url=>new Response(bodies.get(url)||'',{status:bodies.has(url)?200:404})});
 return {stream,load:async()=>{for(const entry of tiles)await stream.load(entry);}};
}

test('a swept walking capsule detects a thin mid-height obstacle while both endpoints are clear',async()=>{
 const f=await fixture({blocked:([x,y,z])=>x===8&&y===11&&z===8});try{await f.load();const a=[.3,.8,.85],b=[1.3,.8,.85],half=[0,.4,0];
  assert.equal(f.stream.allowsCapsule(a,a,.1,half),true);assert.equal(f.stream.allowsCapsule(b,b,.1,half),true);
  assert.equal(f.stream.allowsCapsule(a,b,.1),true,'a center sphere alone would miss the obstacle above it');assert.equal(f.stream.allowsCapsule(a,b,.1,half),false,'the complete body height must be swept through the path');
 }finally{f.stream.dispose();}
});

test('unknown and unprepared pages stay blocked throughout a walking sweep',async()=>{
 const f=await fixture({n:8,detail:.2,coords:[[-1,0,0],[1,0,0]]});try{await f.load();const a=[-.4,.8,.8],b=[2,.8,.8],half=[0,.4,0];
  assert.equal(f.stream.allowsCapsule(a,a,.1,half),true);assert.equal(f.stream.allowsCapsule(b,b,.1,half),true);assert.equal(f.stream.allowsCapsule(a,b,.1,half),false,'clear endpoints do not certify their missing middle page');
  f.stream.available=()=>false;assert.equal(f.stream.allowsCapsule(a,a,.1,half),false,'resident bytes cannot override caller readiness');
 }finally{f.stream.dispose();}
});

test('a certified air parent resolves a long full-height sweep without leaf requests',()=>{
 let requests=0;const stream=new CollisionStream({format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.1,tileCells:16,tileSize:1.6,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[409.6,409.6,409.6]},tiles:[],airNodes:[{coord:[0,0,0],level:8}]},'https://tour.test/collision/scene.collision.json',{fetch:async()=>{requests++;throw Error('Air needs no payload.');}});
 try{assert.equal(stream.allowsCapsule([10,10,10],[300,300,300],.24,[.2,.6,.2]),true);assert.deepEqual(stream.lastCapsuleQuery,{tiles:1,bricks:0,cells:0});assert.equal(requests,0);assert.equal(stream.resident.size,0);assert.equal(stream.allowsCapsule([10,.5,10],[12,.5,10],.24,[0,.6,0]),false,'parent proof does not permit body height outside the domain');}finally{stream.dispose();}
});

test('component half bounds conservatively retain a rotated capsule axis',async()=>{
 const f=await fixture({blocked:([x,y,z])=>x===9&&y===10&&z===9});try{await f.load();const a=[.3,.8,.8],b=[1.3,.8,.8],axis=[.2,Math.sqrt(.6**2-.2**2-.2**2),.2],half=axis.map(Math.abs),actualMidpoint=a.map((v,i)=>(v+b[i])/2+axis[i]*.5);
  assert.ok(segmentBoxDistanceSquared(actualMidpoint,actualMidpoint,[.9,1,.9],[1,1.1,1])<.05**2,'the tilted physical capsule really crosses the voxel');
  assert.equal(f.stream.allowsCapsule(a,a,.05,half),true);assert.equal(f.stream.allowsCapsule(b,b,.05,half),true);assert.equal(f.stream.allowsCapsule(a,b,.05),true);assert.equal(f.stream.allowsCapsule(a,b,.05,half),false,'rotated bounds must not unlock the obstacle');
 }finally{f.stream.dispose();}
});

test('swept brick queries match an independent expanded-cell oracle at negative coordinates',async()=>{
 const f=await fixture({n:8,detail:.2,coords:[[-1,0,0],[0,0,0]],blocked:([x,y,z])=>(x*13+y*7+z*3)%23===0});try{await f.load();let seed=271828;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),detail=.2;
  const oracle=(a,b,r,half)=>{const low=a.map((v,i)=>Math.floor((Math.min(v,b[i])-r-half[i])/detail)),high=a.map((v,i)=>Math.floor((Math.max(v,b[i])+r+half[i])/detail));for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){if(f.stream.hasCell([x,y,z]))continue;const min=[x,y,z].map((v,i)=>v*detail-half[i]),max=[x,y,z].map((v,i)=>(v+1)*detail+half[i]);if(segmentBoxDistanceSquared(a,b,min,max)<r*r-1e-10)return false;}return true;};
  for(let i=0;i<120;i++){const a=[random()*2.4-1.2,random()*.6+.5,random()*.8+.4],b=[a[0]+random()*.8-.4,a[1]+random()*.4-.2,a[2]+random()*.6-.3],half=i%2?[0,random()*.3,0]:[random()*.15,random()*.25,random()*.15],radius=.04+random()*.12;assert.equal(f.stream.allowsCapsule(a,b,radius,half),oracle(a,b,radius,half),JSON.stringify({a,b,radius,half}));}
 }finally{f.stream.dispose();}
});

test('zero-radius requests permit only a verified stationary point and reject unsupported swept volumes',async()=>{
 const f=await fixture({blocked:([x,y,z])=>x===8&&y===11&&z===8});try{await f.load();const a=[.3,.8,.85],b=[1.3,.8,.85];
  assert.equal(f.stream.allowsCapsule(a,a,0),true);assert.equal(f.stream.allowsCapsule([.85,1.15,.85],[.85,1.15,.85],0),false);assert.equal(f.stream.allowsCapsule([-1,.8,.85],[-1,.8,.85],0),false);
  assert.equal(f.stream.allowsCapsule(a,b,0),false,'clear endpoints cannot prove a zero-radius sweep');assert.equal(f.stream.allowsCapsule(a,a,0,[0,.4,0]),false,'a nonzero body axis is not a point');assert.equal(f.stream.allowsCapsule(a,b,0,[.1,.4,.1]),false);
 }finally{f.stream.dispose();}
});
