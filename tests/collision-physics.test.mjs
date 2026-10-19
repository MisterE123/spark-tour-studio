import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {chunkConfig,collisionPhysicsChunkConfig,localPhysicsChunks,collisionChunkSurface} from '../shared/collision-physics.mjs';
import {encodeCollisionTile,decodeCollisionTile,containsCollisionCell,collisionAirIndex,collisionCellId} from '../shared/paged-collision.mjs';

const tile=(coord,n,occupied)=>decodeCollisionTile(encodeCollisionTile({coord,tileCells:n,...(occupied?{occupied}:{full:true})}),{expand:false});
const descriptor=(coord,cells)=>({key:coord.join(','),coord,cells});
const emptyAir=collisionAirIndex({});
function query(tiles,n,air=emptyAir){return cell=>{const coord=cell.map(v=>Math.floor(v/n));if(air.hasTile(coord))return true;const tile=tiles.get(coord.join(','));return !!tile&&containsCollisionCell(tile,...cell.map((v,i)=>v-coord[i]*n));};}
function expectedFaces(chunk,allowed){
 const result=new Set(),origin=chunk.coord.map(v=>v*chunk.cells),n=chunk.cells;
 for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){
  const p=[x,y,z].map((v,i)=>v+origin[i]);if(!allowed(p))continue;
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const q=[...p];q[axis]+=sign;if(!allowed(q))result.add([axis,p[axis]+(sign>0?1:0),p[(axis+1)%3],p[(axis+2)%3],-sign].join(','));}
 }
 return result;
}
function extractedFaces(surface,detail){
 const result=new Set();assert.equal(surface.indices.length%6,0);
 for(let i=0;i<surface.indices.length;i+=6){
  const points=Array.from({length:6},(_,j)=>Array.from(surface.positions.slice(surface.indices[i+j]*3,surface.indices[i+j]*3+3),v=>Math.round(v/detail))),a=points[0],b=points[1],c=points[2],u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],axis=normal.findIndex(v=>v!==0);
  assert.ok(axis>=0);assert.equal(normal.filter(v=>v!==0).length,1);const first=(axis+1)%3,second=(axis+2)%3,min=points.reduce((p,q)=>p.map((v,i)=>Math.min(v,q[i]))),max=points.reduce((p,q)=>p.map((v,i)=>Math.max(v,q[i])));
  assert.equal(min[axis],max[axis]);for(let row=min[first];row<max[first];row++)for(let col=min[second];col<max[second];col++){const key=[axis,min[axis],row,col,Math.sign(normal[axis])].join(',');assert.ok(!result.has(key),'faces are owned once: '+key);result.add(key);}
 }
 return result;
}

test('physics chunks stay near one metre, divide every supported page, and never exceed 32 cells',()=>{
 assert.equal(collisionPhysicsChunkConfig,chunkConfig);
 for(const detail of [.01,.05,.1,.2,.5,1,2])for(let n=4;n<=256;n+=4){const config=chunkConfig(detail,n);assert.ok(config.cells>=1&&config.cells<=32);assert.equal(n%config.cells,0);assert.equal(config.size,config.cells*detail);for(let cells=1;cells<=Math.min(32,n);cells++)if(n%cells===0)assert.ok(Math.abs(config.size-1)<=Math.abs(cells*detail-1)+1e-12);}
 assert.deepEqual(chunkConfig(.05,160),{cells:20,size:1});assert.deepEqual(chunkConfig(.01,256),{cells:32,size:.32});
 for(const [detail,n]of [[0,80],[.1,0],[.1,81],[NaN,80],[.1,512]])assert.throws(()=>chunkConfig(detail,n),/resolution/);
});

test('local neighborhoods are bounded, sorted, globally aligned, and handle negative coordinates',()=>{
 const config=chunkConfig(.1,80),chunks=localPhysicsChunks({x:-.5,y:1.5,z:2.5},[.6,.2,.2],config);
 assert.deepEqual(chunks[0],{key:'-1,1,2',coord:[-1,1,2],cells:10,bounds:{min:[-1,1,2],max:[0,2,3]}});assert.equal(chunks.length,3);
 assert.deepEqual(chunks.map(c=>c.coord[0]),[-1,-2,0]);assert.equal(new Set(chunks.map(c=>c.key)).size,chunks.length);
 assert.equal(localPhysicsChunks([0,0,0],0,config).length,1);
 assert.throws(()=>localPhysicsChunks([0,0,0],100,config),/too large/);assert.throws(()=>localPhysicsChunks([NaN,0,0],1,config),/neighborhood/);
});

test('full verified neighboring chunks have no fake internal walls and unknown exterior remains closed',()=>{
 const n=8,detail=.25,tiles=new Map([['0,0,0',tile([0,0,0],n)]]),allowed=query(tiles,n),chunk=descriptor([0,0,0],4),surface=collisionChunkSurface(chunk,tiles,detail,n);
 assert.equal(surface.complete,true);assert.equal(surface.triangleCount,6,'three exterior faces merge to three quads');assert.deepEqual(extractedFaces(surface,detail),expectedFaces(chunk,allowed));
 const inner=collisionChunkSurface(descriptor([1,1,1],4),tiles,detail,n);assert.equal(inner.triangleCount,6,'opposite three outer faces are preserved');
 const all=new Set();for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++)for(const key of extractedFaces(collisionChunkSurface(descriptor([x,y,z],4),tiles,detail,n),detail)){assert.ok(!all.has(key));all.add(key);}
 assert.equal(all.size,6*n*n,'only the original cube exterior survives splitting');
});

test('loaded adjacent network pages open their seam while missing data restores the cap',()=>{
 const n=8,detail=.1,left=tile([0,0,0],n),right=tile([1,0,0],n),chunk=descriptor([1,0,0],4),tiles=new Map([['0,0,0',left]]),closed=collisionChunkSurface(chunk,tiles,detail,n);
 tiles.set('1,0,0',right);const opened=collisionChunkSurface(chunk,tiles,detail,n);assert.deepEqual(extractedFaces(opened,detail),expectedFaces(chunk,query(tiles,n)));assert.equal(closed.triangleCount-opened.triangleCount,2);
 assert.equal([...extractedFaces(opened,detail)].some(key=>key.startsWith('0,8,')),false);
 tiles.delete('1,0,0');assert.deepEqual(collisionChunkSurface(chunk,tiles,detail,n).indices,closed.indices);
});

test('mixed source pages retain every fine voxel boundary and clip output to owned chunks',()=>{
 const n=8,detail=.1,tiles=new Map();for(const coord of [[-1,0,0],[0,0,0]]){const occupied=[];for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++)if((x*13+y*7+z*3)%17!==0)occupied.push(collisionCellId(x,y,z,n));tiles.set(coord.join(','),tile(coord,n,occupied));}
 const allowed=query(tiles,n),all=new Set();for(let x=-2;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++){
  const chunk=descriptor([x,y,z],4),surface=collisionChunkSurface(chunk,tiles,detail,n);assert.equal(surface.complete,true);assert.equal(surface.triangleCount,surface.indices.length/3);assert.deepEqual(extractedFaces(surface,detail),expectedFaces(chunk,allowed));
  for(let i=0;i<surface.positions.length;i++)assert.ok(surface.positions[i]>=surface.bounds.min[i%3]-1e-6&&surface.positions[i]<=surface.bounds.max[i%3]+1e-6);
  for(const key of extractedFaces(surface,detail)){assert.ok(!all.has(key),'neighbor blocks must not duplicate faces');all.add(key);}
 }
 assert.ok(all.size>100,'the test retains rough detail instead of replacing it with a coarse shell');
});

test('certified air bypasses page payloads and missing owned data never becomes complete physics',()=>{
 const n=256,detail=.01,air=collisionAirIndex({airNodes:[{coord:[0,0,0],level:20}]}),tiles={get(){throw Error('Certified air should not look for a payload.');}},chunk=descriptor([1000,1000,1000],32),surface=collisionChunkSurface(chunk,tiles,detail,n,air);
 assert.equal(surface.complete,true);assert.equal(surface.triangleCount,0);assert.equal(surface.positions.length,0);
 const unknown=collisionChunkSurface(descriptor([-1,0,0],32),new Map(),detail,n,air);assert.equal(unknown.complete,false);assert.equal(unknown.triangleCount,0);
 const boundary=collisionChunkSurface(descriptor([0,0,0],32),new Map(),detail,n,air);assert.equal(boundary.complete,true);assert.equal(boundary.triangleCount,6,'unknown lower domain faces are closed');
});

test('a verified all-solid owned block is complete but emits no neighbor-owned faces',()=>{
 const n=8,detail=.1,occupied=[collisionCellId(7,7,7,n)],tiles=new Map([['0,0,0',tile([0,0,0],n,occupied)],['-1,0,0',tile([-1,0,0],n)]]),surface=collisionChunkSurface(descriptor([0,0,0],4),tiles,detail,n);
 assert.equal(surface.complete,true);assert.equal(surface.triangleCount,0);
 assert.throws(()=>collisionChunkSurface(descriptor([0,0,0],3),tiles,detail,n),/resolution/);assert.throws(()=>collisionChunkSurface({key:'wrong',coord:[0,0,0],cells:4},tiles,detail,n),/identity/);
});

test('a maximum-size fine network page meshes only its local block and preserves a one-voxel wall',()=>{
 const n=256,axis=n/4,count=axis**3,bytes=new Uint8Array(48+count*12);bytes.set(encodeCollisionTile({coord:[0,0,0],tileCells:n,full:true}));const view=new DataView(bytes.buffer);view.setUint32(24,count,true);view.setUint32(28,n**3-1,true);view.setUint32(32,0,true);
 for(let i=0;i<count;i++){view.setUint32(48+i*12,i,true);view.setUint32(52+i*12,0xffffffff,true);view.setUint32(56+i*12,0xffffffff,true);}
 const hole=[70,70,70],brick=(Math.floor(hole[0]/4)*axis+Math.floor(hole[1]/4))*axis+Math.floor(hole[2]/4),bit=((hole[0]%4)*4+hole[1]%4)*4+hole[2]%4;view.setUint32(48+brick*12+4+(bit>>>5)*4,(0xffffffff^(1<<(bit&31)))>>>0,true);
 const source=decodeCollisionTile(bytes,{expand:false});assert.equal(source.occupied,undefined);assert.equal(source.voxels,16777215);
 const surface=collisionChunkSurface(descriptor([2,2,2],32),new Map([['0,0,0',source]]),.01,n);assert.equal(surface.complete,true);assert.equal(surface.triangleCount,12,'only six sides of the isolated fine wall are needed');
 assert.ok(surface.positions.every(v=>v>=.7-1e-6&&v<=.71+1e-6),'the original one-centimetre feature survives');assert.equal(surface.positions.length,24);assert.equal(source.occupied,undefined,'local extraction never expands the sixteen-million-cell source page');
 const clear=collisionChunkSurface(descriptor([3,3,3],32),new Map([['0,0,0',source]]),.01,n);assert.equal(clear.triangleCount,0,'a wholly free local brick halo inside a mixed page needs no surface');
});

test('physics worker retains only requested compact pages and replaces changed data without stale seams',async t=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'self'),messages=[],self={postMessage:message=>messages.push(message)};Object.defineProperty(globalThis,'self',{configurable:true,writable:true,value:self});t.after(()=>{if(previous)Object.defineProperty(globalThis,'self',previous);else delete globalThis.self;});
 const output=await build({entryPoints:[fileURLToPath(new URL('../src/paged-physics.worker.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',logLevel:'silent'});
 try{await import('data:text/javascript;base64,'+Buffer.from(output.outputFiles[0].contents).toString('base64'));}catch(error){throw Error('Physics worker test bundle could not load: '+String(error?.message||error).replace(/data:text[^\s]+/g,'[in-memory module]').slice(0,1000));}
 const init=()=>self.onmessage({data:{type:'init',airNodes:[]}});let id=0;const send=changes=>{const request=++id;self.onmessage({data:{id:request,chunks:[descriptor([1,0,0],4)],tiles:[],tileCells:8,detail:.1,...changes}});const result=messages.at(-1);assert.equal(result.id,request);return result;};
 const left={key:'0,0,0',bytes:tile([0,0,0],8).bytes},right={key:'1,0,0',bytes:tile([1,0,0],8).bytes};init();
 const closed=send({retain:[left.key],tiles:[left]}).results[0];assert.equal(closed.complete,true);
 const opened=send({retain:[left.key,right.key],tiles:[right]}).results[0];assert.equal(closed.triangleCount-opened.triangleCount,2);
 assert.deepEqual(send({retain:[left.key,right.key]}).results[0].indices,opened.indices,'unchanged retained pages need no repeated payload');
 assert.deepEqual(send({retain:[left.key]}).results[0].indices,closed.indices,'evicted neighbor restores the closed boundary');
 assert.equal(send({retain:[]}).results[0].complete,false);
 assert.equal(send({tiles:[left]}).results[0].complete,true);assert.equal(send({}).results[0].complete,false,'legacy messages replace the complete snapshot');
 send({retain:[left.key],tiles:[left]});init();assert.equal(send({retain:[left.key]}).results[0].complete,false,'a new scene cannot inherit cached geometry');
 send({retain:[left.key],tiles:[left]});const changed={key:left.key,bytes:tile([0,0,0],8,[0]).bytes};assert.equal(send({retain:[left.key],tiles:[changed]}).results[0].triangleCount,0,'changed page bytes replace old free space');
 assert.match(send({retain:[right.key],tiles:[{key:right.key,bytes:left.bytes}]}).error,/identity/);
});
