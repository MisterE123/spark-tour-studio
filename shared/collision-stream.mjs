import {validatePagedCollisionManifest,verifyCollisionTile,containsCollisionCell,collisionTileKey,collisionTileBounds,collisionAirIndex,collisionAirTile,COLLISION_TILE_HEADER_BYTES} from './paged-collision.mjs';

const axes=['x','y','z'];
const array=p=>Array.isArray(p)?p:axes.map(a=>p[a]);
export async function readCollisionResponse(response,maximum){
 if(Number(response.headers?.get('content-length'))>maximum)throw Error('Collision response is oversized.');
 if(!response.body?.getReader){const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.byteLength>maximum)throw Error('Collision response is oversized.');return bytes;}
 const reader=response.body.getReader(),parts=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>maximum)throw Error('Collision response is oversized.');parts.push(value);}}
 catch(error){await reader.cancel().catch(()=>{});throw error;}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
export function segmentBoxDistanceSquared(a,b,min,max){
 const cuts=[0,1],d=b.map((v,i)=>v-a[i]);
 for(let i=0;i<3;i++)if(Math.abs(d[i])>1e-12)for(const bound of [min[i],max[i]]){const t=(bound-a[i])/d[i];if(t>0&&t<1)cuts.push(t);}
 cuts.sort((x,y)=>x-y);
 const distance=t=>a.reduce((sum,v,i)=>{const p=v+d[i]*t,q=Math.max(min[i]-p,0,p-max[i]);return sum+q*q;},0);
 let best=Infinity;
 for(let k=0;k<cuts.length-1;k++){
  const lo=cuts[k],hi=cuts[k+1],mid=(lo+hi)/2;let aa=0,bb=0;
  for(let i=0;i<3;i++){const p=a[i]+d[i]*mid,bound=p<min[i]?min[i]:p>max[i]?max[i]:undefined;if(bound!==undefined){aa+=d[i]*d[i];bb+=(a[i]-bound)*d[i];}}
  const t=aa?Math.max(lo,Math.min(hi,-bb/aa)):lo;best=Math.min(best,distance(t),distance(lo),distance(hi));
 }
 return best;
}

/** The manifest lists allowed-space tiles; absent, failed or unloaded data is solid. */
export class CollisionStream {
 constructor(manifest,url,{fetch:fetcher=(...args)=>globalThis.fetch(...args),maxBytes=48*1024*1024,maxTiles=64,concurrency=3,onChange=(keys)=>{}}={}){
  this.manifest=validatePagedCollisionManifest(manifest);this.air=collisionAirIndex(manifest);this.url=url;this.fetcher=fetcher;this.maxBytes=maxBytes;this.maxTiles=maxTiles;this.concurrency=concurrency;this.onChange=onChange;
  this.entries=new Map(manifest.tiles.map(entry=>[entry.key,entry]));this.resident=new Map();this.pending=new Map();this.failures=new Map();this.failedAt=new Map();this.abort=new AbortController();this.queue=[];this.running=0;this.bytes=0;this.clock=0;this.dead=false;this.pinned=new Set();this.available=(key)=>true;
 }
 near(point,radius){
  const p=array(point),size=this.manifest.tileSize,min=p.map(v=>Math.floor((v-radius)/size)),max=p.map(v=>Math.floor((v+radius)/size)),result=[];
  if(min.some((v,i)=>max[i]-v>16))throw Error('Collision neighborhood is too large.');
  for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){const coord=[x,y,z],key=collisionTileKey(coord),entry=this.entries.get(key);if(entry)result.push(entry);else if(this.air.hasTile(coord))result.push({key,coord,bytes:COLLISION_TILE_HEADER_BYTES,voxels:this.manifest.tileCells**3,bounds:collisionTileBounds(coord,size),uniformAir:true});}
  return result.sort((a,b)=>a.coord.reduce((d,v,i)=>d+((v+.5)*size-p[i])**2,0)-b.coord.reduce((d,v,i)=>d+((v+.5)*size-p[i])**2,0));
 }
 async ensureNear(point,radius=this.manifest.tileSize*.8){const entries=this.near(point,radius);if(entries.length>this.maxTiles||entries.reduce((sum,entry)=>sum+entry.bytes,0)>this.maxBytes)throw Error('Required collision neighborhood exceeds its memory budget.');this.pinned=new Set(entries.map(entry=>entry.key));await Promise.all(entries.map(entry=>this.load(entry)));return entries.map(entry=>entry.key);}
 load(entry,{retryDelay=0}={}){
  if(this.dead)return Promise.reject(new DOMException('Collision stream disposed.','AbortError'));
  const resident=this.resident.get(entry.key);if(resident){resident.used=++this.clock;return Promise.resolve(resident.tile);}
  if(this.pending.has(entry.key))return this.pending.get(entry.key);
  // Frame-driven collision refreshes must not hammer a missing tile. Explicit
  // queries keep the default immediate retry so a repaired host needs no reload.
  if(retryDelay>0&&this.failures.has(entry.key)&&Date.now()-(this.failedAt.get(entry.key)??0)<retryDelay)return Promise.reject(this.failures.get(entry.key));
  const promise=new Promise((resolve,reject)=>{this.queue.push({entry,resolve,reject});});this.pending.set(entry.key,promise);this.drain();return promise;
 }
 drain(){while(!this.dead&&this.running<this.concurrency&&this.queue.length){const task=this.queue.shift();this.running++;const finish=()=>{this.running--;this.pending.delete(task.entry.key);};this.fetchTile(task.entry).then(tile=>{finish();task.resolve(tile);this.drain();},error=>{finish();task.reject(error);this.drain();});}}
 async fetchTile(entry){
  try{
   let tile,bytes;
   if(this.air.hasTile(entry.coord)){tile=collisionAirTile(entry.coord,this.manifest.tileCells);bytes=tile.bytes;}
   else{
   const expected=this.entries.get(entry.key);if(!expected)throw Error('Collision page is not listed in the manifest.');entry=expected;
   const response=await this.fetcher(new URL(entry.url,this.url).href,{signal:this.abort.signal});if(!response.ok)throw Error(`Collision tile request failed (${response.status}).`);
   const declared=Number(response.headers?.get('content-length'));if(declared>entry.bytes)throw Error('Collision tile response is oversized.');
   if(response.body?.getReader){const reader=response.body.getReader(),parts=[];let length=0;try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>entry.bytes)throw Error('Collision tile response is oversized.');parts.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}}
   else bytes=new Uint8Array(await response.arrayBuffer());
   tile=await verifyCollisionTile(bytes,entry,this.manifest.tileCells,{expand:false});
   }if(this.dead)throw new DOMException('Collision stream disposed.','AbortError');
   if(bytes.byteLength>this.maxBytes)throw Error('Collision tile exceeds the residency budget.');
   const removed=[];for(const [key,value] of [...this.resident].sort((a,b)=>a[1].used-b[1].used)){if(this.bytes+bytes.byteLength<=this.maxBytes&&this.resident.size<this.maxTiles)break;if(this.pinned.has(key))continue;this.resident.delete(key);this.bytes-=value.bytes.byteLength;removed.push(key);}if(removed.length)this.onChange(removed);if(this.bytes+bytes.byteLength>this.maxBytes||this.resident.size>=this.maxTiles)throw Error('Collision residency budget is exhausted.');
   this.resident.set(entry.key,{entry,tile,bytes,used:++this.clock});this.bytes+=bytes.byteLength;this.failures.delete(entry.key);this.failedAt.delete(entry.key);this.onChange([entry.key]);return tile;
  }catch(error){if(!this.dead){this.failures.set(entry.key,error);this.failedAt.set(entry.key,Date.now());}throw error;}
 }
 trim(protectedKeys=[]){
  this.pinned=new Set(protectedKeys);const removed=[];
  for(const [key,value] of [...this.resident].sort((a,b)=>a[1].used-b[1].used)){
   if(this.bytes<=this.maxBytes&&this.resident.size<=this.maxTiles)break;if(this.pinned.has(key))continue;
   this.resident.delete(key);this.bytes-=value.bytes.byteLength;removed.push(key);
  }
  if(removed.length)this.onChange(removed);
  if(this.bytes>this.maxBytes||this.resident.size>this.maxTiles)throw Error('The required collision neighborhood exceeds its memory budget. Use coarser collision detail.');
 }
 hasCell(cell){
  const n=this.manifest.tileCells,coord=cell.map(v=>Math.floor(v/n)),key=collisionTileKey(coord);if(this.air.hasTile(coord))return true;const tile=this.resident.get(key)?.tile;if(!tile||!this.available(key))return false;
  return containsCollisionCell(tile,...cell.map((v,i)=>v-coord[i]*n));
 }
 allowsPoint(point){const p=array(point);return p.every(Number.isFinite)&&this.hasCell(p.map(v=>Math.floor(v/this.manifest.detail)));}
 allowsCapsule(start,end,radius,halfExtent=[0,0,0]){
  const a=array(start),b=array(end),{detail,tileCells:n}=this.manifest,stats=this.lastCapsuleQuery={tiles:0,bricks:0,cells:0};if(![...a,...b,radius,...halfExtent].every(Number.isFinite)||radius<0||halfExtent.length!==3||halfExtent.some(value=>value<0))return false;
  if(radius===0)return halfExtent.every(value=>value===0)&&a.every((value,i)=>value===b[i])&&this.allowsPoint(a);
  const distance=(min,max)=>segmentBoxDistanceSquared(a,b,min.map((value,i)=>value-halfExtent[i]),max.map((value,i)=>value+halfExtent[i]));
  const low=a.map((v,i)=>Math.floor((Math.min(v,b[i])-radius-halfExtent[i])/detail)),high=a.map((v,i)=>Math.floor((Math.max(v,b[i])+radius+halfExtent[i])/detail)),tileLow=low.map(v=>Math.floor(v/n)),tileHigh=high.map(v=>Math.floor(v/n)),squared=radius*radius,threshold=squared-Math.min(1e-10,squared*1e-6);
  if(!Number.isFinite(threshold)||threshold<=0)return false;
  // A certified parent proves every finest voxel in this cube is free. It is
  // complete collision data, so neither payload requests nor leaf scans help.
  if(this.air.containingNode(tileLow,tileHigh)){stats.tiles=1;return true;}
  if(tileLow.reduce((count,v,i)=>count*(tileHigh[i]-v+1),1)>4096)return false;
  // One 1 cm walking capsule encloses hundreds of thousands of cells. Accept
  // compact full tiles and full 4³ bricks without expanding or scanning them;
  // exact capsule/box tests are needed only around blocked or mixed boundaries.
  for(let tx=tileLow[0];tx<=tileHigh[0];tx++)for(let ty=tileLow[1];ty<=tileHigh[1];ty++)for(let tz=tileLow[2];tz<=tileHigh[2];tz++){
   stats.tiles++;const coord=[tx,ty,tz];if(this.air.hasTile(coord))continue;const key=coord.join(','),tile=this.resident.get(key)?.tile,tileMin=coord.map(v=>v*n*detail),tileMax=tileMin.map(v=>v+n*detail);
   if(!tile||!this.available(key)){if(distance(tileMin,tileMax)<threshold)return false;continue;}
   if(tile.full)continue;
   const bytes=tile.bytes,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),axis=n/4,brickLow=low.map((v,i)=>Math.max(0,Math.floor((v-coord[i]*n)/4))),brickHigh=high.map((v,i)=>Math.min(axis-1,Math.floor((v-coord[i]*n)/4)));
   for(let bx=brickLow[0];bx<=brickHigh[0];bx++)for(let by=brickLow[1];by<=brickHigh[1];by++)for(let bz=brickLow[2];bz<=brickHigh[2];bz++){
    if(++stats.bricks>32768)return false;
    const brickKey=(bx*axis+by)*axis+bz;let left=0,right=view.getUint32(24,true)-1,maskLow=0,maskHigh=0;
    while(left<=right){const mid=(left+right)>>>1,offset=COLLISION_TILE_HEADER_BYTES+mid*12,value=view.getUint32(offset,true);if(value<brickKey)left=mid+1;else if(value>brickKey)right=mid-1;else{maskLow=view.getUint32(offset+4,true);maskHigh=view.getUint32(offset+8,true);break;}}
    if(maskLow===0xffffffff&&maskHigh===0xffffffff)continue;
    const cell=[tx*n+bx*4,ty*n+by*4,tz*n+bz*4],min=cell.map(v=>v*detail),max=min.map(v=>v+4*detail);
    if(distance(min,max)>=threshold)continue;
    if(!(maskLow||maskHigh))return false;
    for(let bit=0;bit<64;bit++)if(!((bit<32?maskLow:maskHigh)&(1<<(bit&31)))){
     stats.cells++;const min=[cell[0]+Math.floor(bit/16),cell[1]+Math.floor(bit/4)%4,cell[2]+bit%4].map(v=>v*detail),max=min.map(v=>v+detail);
     if(distance(min,max)<threshold)return false;
    }
   }
  }
  return true;
 }
 dispose(){if(this.dead)return;this.dead=true;this.abort.abort();for(const task of this.queue.splice(0))task.reject(new DOMException('Collision stream disposed.','AbortError'));this.resident.clear();this.pending.clear();this.failures.clear();this.failedAt.clear();this.bytes=0;}
}
