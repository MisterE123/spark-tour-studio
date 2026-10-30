import * as THREE from 'three';
import type Rapier from '@dimforge/rapier3d-compat';
import {physics as RAPIER} from '../shared/physics.mjs';
import {CollisionStream,segmentBoxDistanceSquared} from '../shared/collision-stream.mjs';
import {collisionTileKey} from '../shared/paged-collision.mjs';
import {collisionPhysicsChunkConfig,localPhysicsChunks} from '../shared/collision-physics.mjs';
import {sceneMatrix} from '../shared/collision-selection.mjs';
import {raycastCollision} from '../shared/collision-ray.mjs';
import {CollisionOverview} from './collision-overview';

type Point={x:number;y:number;z:number};
type Chunk={key:string;coord:number[];cells:number;bounds:{min:number[];max:number[]}};
type Surface={key:string;positions:Float32Array;indices:Uint32Array;complete:boolean};
type Resident={mesh:THREE.Mesh;collider:Rapier.Collider;triangles:number};
type FocusWindow={point:THREE.Vector3;body?:THREE.Vector3;samples?:THREE.Vector3[]};
export type PhysicsLease={release():void};
const MAX_TRIANGLES=600000,MAX_CHUNKS=2048,BATCH=4;
const vector=(p:Point)=>new THREE.Vector3(p.x,p.y,p.z);

/** Verified page caching is independent of the exact physics installed near visitors. */
export class PagedCollider {
 readonly group=new THREE.Group();readonly stream:CollisionStream;readonly overview:CollisionOverview;
 private worker=new Worker(new URL('./paged-physics.worker.ts',import.meta.url),{type:'module',name:'tour-collision-surfaces'});
 private surfaces=new Map<string,Resident>();private prepared=new Set<string>();private desired=new Map<string,Chunk>();private skipped=new Set<string>();
 private requests=new Map<number,{resolve:(surfaces:Surface[])=>void;reject:(error:Error)=>void}>();
 private workerPages=new Map<string,unknown>();private leases=new Map<number,FocusWindow>();private leaseSequence=0;
 private primary?:FocusWindow;private centers:THREE.Vector3[]=[];private primaryCenters:THREE.Vector3[]=[];private focusKey='';private planKey='';private revision=0;private sequence=0;private work?:Promise<void>;private buildAbort?:AbortController;
 private focusError?:Error;private coreSquared=1.5625;private config:{cells:number;size:number};private dead=false;private failure='';private lastUpdate=0;private updating?:Promise<void>;
 onError=(message:string)=>{};onChange=()=>{};
 constructor(readonly manifest:any,readonly url:string,readonly world:Rapier.World){
  this.config=collisionPhysicsChunkConfig(manifest.detail,manifest.tileCells);
  this.group.name='paged-collision';this.group.matrixAutoUpdate=false;this.group.matrix.copy(sceneMatrix(manifest.sourceTransform).invert());this.group.matrixWorldNeedsUpdate=true;
  this.overview=new CollisionOverview(manifest,this.group);
  this.stream=new CollisionStream(manifest,url,{onChange:(keys:string[])=>this.invalidate(keys)});
  // Movement also checks prepared local coverage; cached bytes alone never unlock a region.
  this.stream.available=()=>true;this.worker.postMessage({type:'init',airNodes:manifest.airNodes||[]});
  this.worker.onmessage=({data})=>{const request=this.requests.get(data.id);this.requests.delete(data.id);if(!request)return;if(data.error){this.workerPages.clear();request.reject(Error(data.error));}else request.resolve(data.results);};
  this.worker.onerror=event=>{this.workerPages.clear();for(const request of this.requests.values())request.reject(Error(event.message||'Collision surface worker failed.'));this.requests.clear();};
 }
 // This source frame has a manual matrix. Refresh it explicitly before queries,
 // including the first query before rendering and after parent alignment changes.
 private updateFrame(children=false){this.group.matrixWorldNeedsUpdate=true;this.group.updateWorldMatrix(true,children);}
 private scale(){this.updateFrame();return this.group.matrixWorld.getMaxScaleOnAxis();}
 toGeneration(point:Point){this.updateFrame();return vector(point).applyMatrix4(this.group.matrixWorld.clone().invert());}
 fromGeneration(point:Point){this.updateFrame();return vector(point).applyMatrix4(this.group.matrixWorld);}
 async raycast(ray:THREE.Ray,isCurrent=()=>true,{maxDistance=100,retryDelay=0,signal=undefined}:{maxDistance?:number;retryDelay?:number;signal?:AbortSignal}={}){
  const origin=this.toGeneration(ray.origin),direction=this.toGeneration(ray.origin.clone().add(ray.direction)).sub(origin),scale=direction.length();
  const hit=await raycastCollision(this.stream,origin.toArray(),direction.toArray(),{maxDistance:maxDistance*scale,retryDelay,signal,isCurrent:()=>!this.dead&&isCurrent()});
  return hit?{point:this.fromGeneration({x:hit.point[0],y:hit.point[1],z:hit.point[2]}),normal:new THREE.Vector3(...hit.normal).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(this.group.matrixWorld))}:null;
 }
 private owner(chunk:Chunk){return collisionTileKey(chunk.coord.map(value=>Math.floor(value*chunk.cells/this.manifest.tileCells)));}
 private pageKeys(chunk:Chunk){
  const n=this.manifest.tileCells,low=chunk.coord.map(value=>Math.floor((value*chunk.cells-1)/n)),high=chunk.coord.map(value=>Math.floor(((value+1)*chunk.cells)/n)),keys:string[]=[];
  for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++)keys.push(collisionTileKey([x,y,z]));return keys;
 }
 private ownerKnown(chunk:Chunk){const key=this.owner(chunk);return this.stream.entries.has(key)||this.stream.air.hasTile(key.split(',').map(Number));}
 private priority(chunk:Chunk){const center=chunk.bounds.min.map((value,i)=>(value+chunk.bounds.max[i])/2),distance=(p:THREE.Vector3)=>(center[0]-p.x)**2+(center[1]-p.y)**2*.45+(center[2]-p.z)**2,nearest=Math.min(...this.centers.map(distance)),primary=Math.min(...this.primaryCenters.map(distance));return primary<=this.coreSquared?nearest-1000000:nearest;}
 private plan(){
  if(this.dead)return;const scale=this.scale();this.coreSquared=(1.25/scale)**2;const inverse=this.group.matrixWorld.clone().invert().elements,windows=[...(this.primary?[this.primary]:[]),...this.leases.values()],centers:THREE.Vector3[]=[],targets:{center:THREE.Vector3;vertical:number;primary:boolean}[]=[];
  for(const window of windows){for(const sample of window.samples||[window.point]){const head=this.toGeneration(sample);centers.push(head);targets.push({center:head,vertical:2.7,primary:window===this.primary});}if(window.body){const body=this.toGeneration(window.body);centers.push(body);targets.push({center:body,vertical:1.05,primary:window===this.primary});}}
  if(!centers.length)return;const buckets=targets.map(({center,vertical})=>center.toArray().map(value=>Math.floor(value/(this.config.size*.5))).join(',')+':'+vertical).join(';');if(buckets===this.focusKey)return;this.focusKey=buckets;
  this.centers=centers;this.primaryCenters=targets.filter(target=>target.primary).map(target=>target.center);const next=new Map<string,Chunk>(),horizontal=Math.max(.7,Math.min(1.5,this.config.size*scale*1.5));
  for(const {center,vertical}of targets){const radii=[0,1,2].map(axis=>Math.abs(inverse[axis])*horizontal+Math.abs(inverse[axis+4])*vertical+Math.abs(inverse[axis+8])*horizontal);for(const chunk of this.nearChunks(center,radii))if(this.ownerKnown(chunk))next.set(chunk.key,chunk);}
  // Primary support is admitted first. Optional horizon/query blocks stay closed
  // when either cache or physics capacity is full; distant data never owns physics.
  const pages=new Set<string>(),sorted:Chunk[]=[];let bytes=0;
  for(const chunk of [...next.values()].sort((a,b)=>this.priority(a)-this.priority(b)||a.key.localeCompare(b.key))){const owner=this.owner(chunk),entry=this.stream.entries.get(owner);if(entry&&!pages.has(owner)){if(pages.size>=this.stream.maxTiles||bytes+entry.bytes>this.stream.maxBytes)continue;pages.add(owner);bytes+=entry.bytes;}sorted.push(chunk);if(sorted.length===MAX_CHUNKS)break;}
  const key=buckets+'|'+sorted.map(chunk=>chunk.key).sort().join(';');
  if(key===this.planKey)return;this.planKey=key;this.desired=new Map(sorted.map(chunk=>[chunk.key,chunk]));this.revision++;this.skipped.clear();
  let removed=false;for(const existing of [...this.prepared])if(!this.desired.has(existing)){this.prepared.delete(existing);this.remove(existing);removed=true;}
  for(const existing of [...this.surfaces.keys()])if(!this.desired.has(existing)){this.remove(existing);removed=true;}
  this.pinPages();this.buildAbort?.abort();this.stream.releaseUnpinned();if(removed)this.onChange();this.schedule();
 }
 private nearChunks(center:THREE.Vector3,radii:number[],depth=0):Chunk[]{const size=this.config.size,point=center.toArray(),count=point.reduce((total,value,i)=>total*(Math.floor((value+radii[i])/size)-Math.floor((value-radii[i])/size)+1),1);if(count<=4096)return localPhysicsChunks(center,radii,this.config) as Chunk[];if(depth>=6||count>65536)throw Error('The local collision scale exceeds its bounded physics window.');const axis=radii.indexOf(Math.max(...radii)),half=[...radii];half[axis]*=.5;const first=center.clone(),second=center.clone();first.setComponent(axis,first.getComponent(axis)-half[axis]);second.setComponent(axis,second.getComponent(axis)+half[axis]);return [...this.nearChunks(first,half,depth+1),...this.nearChunks(second,half,depth+1)];}
 private pinPages(){this.stream.pinned=new Set([...this.desired.values()].map(chunk=>this.owner(chunk)).filter(key=>this.stream.entries.has(key)));}
 /** Primary support pins update synchronously, including while queries load. */
 focus(point:Point,body?:Point){if(this.dead)return;this.primary={point:vector(point),body:body?vector(body):undefined};try{this.plan();this.focusError=undefined;}catch(error){this.focusKey='';this.focusError=error instanceof Error?error:Error(String(error));this.notice(error);}}
 /** Destination preparation preserves the visitor's current support. */
 async prepare(point:Point,_radius=4,{signal}:{signal?:AbortSignal}={}):Promise<PhysicsLease>{
  if(this.dead||signal?.aborted)throw new DOMException('Collision preparation cancelled.','AbortError');if(this.leases.size>=4)throw new DOMException('A newer navigation request is being prepared.','AbortError');const id=++this.leaseSequence;
  this.leases.set(id,{point:vector(point)});let released=false;const lease={release:()=>{if(released)return;released=true;this.leases.delete(id);try{this.plan();}catch(error){this.focusKey='';this.notice(error);}}};
  let cancelled:(()=>void)|undefined;
  try{this.plan();await new Promise<void>((resolve,reject)=>{cancelled=()=>{lease.release();reject(new DOMException('Collision preparation cancelled.','AbortError'));};signal?.addEventListener('abort',cancelled,{once:true});if(signal?.aborted)cancelled();else this.flush().then(resolve,reject);});if(this.dead||signal?.aborted)throw new DOMException('Collision preparation cancelled.','AbortError');return lease;}catch(error){lease.release();throw error;}finally{if(cancelled)signal?.removeEventListener('abort',cancelled);}
 }
 async ensure(point:Point,_radius=4){if(this.dead)throw new DOMException('Collision scene disposed.','AbortError');this.focus(point);if(this.focusError)throw this.focusError;this.schedule();await this.flush();return [...this.stream.pinned];}
 async routeParts(start:Point,end:Point,signal:AbortSignal){
  const a=vector(start),b=vector(end),distance=a.distanceTo(b);if(distance>16||this.dead||signal.aborted||this.leases.size>=4)throw new DOMException('Walking refinement cancelled.','AbortError');
  const id=++this.leaseSequence,count=Math.max(1,Math.ceil(distance/.75)),samples=Array.from({length:count+1},(_,i)=>a.clone().lerp(b,i/count).add(new THREE.Vector3(0,.9,0)));
  this.leases.set(id,{point:samples[0],samples});const release=()=>{this.leases.delete(id);try{if(!this.dead)this.plan();}catch(error){this.focusKey='';this.notice(error);}};signal.addEventListener('abort',release,{once:true});
  try{this.plan();await this.flush();if(this.dead||signal.aborted)throw new DOMException('Walking refinement cancelled.','AbortError');return this.navigationParts();}
  finally{signal.removeEventListener('abort',release);release();}
 }
 private invalidate(keys:string[]){if(this.dead)return;const changed=new Set(keys);for(const chunk of this.desired.values())if(this.pageKeys(chunk).some(key=>changed.has(key))){this.prepared.delete(chunk.key);this.skipped.delete(chunk.key);}this.schedule();}
 private notice(error:unknown){if(this.dead||(error as Error)?.name==='AbortError')return;const message=error instanceof Error?error.message:String(error);if(message!==this.failure){this.failure=message;this.onError(message);}}
 private pending(){return [...this.desired.keys()].some(key=>!this.prepared.has(key)&&!this.skipped.has(key));}
 private schedule(){if(this.work||this.dead)return;let failed=false;this.work=this.rebuild().catch(error=>{failed=true;throw error;}).finally(()=>{this.work=undefined;if(!failed&&!this.dead&&this.pending())this.schedule();});this.work.catch(error=>this.notice(error));}
 private async flush(){while(this.work)await this.work;}
 private async rebuild(){
  while(!this.dead){
   const revision=this.revision,entries=[...new Set([...this.desired.values()].map(chunk=>this.owner(chunk)))].flatMap(key=>{const entry=this.stream.entries.get(key);return entry?[entry]:[];});
   this.pinPages();const controller=new AbortController();this.buildAbort=controller;const loaded=await Promise.allSettled(entries.map(entry=>this.stream.load(entry,{retryDelay:3000,signal:controller.signal})));if(this.dead)return;if(revision!==this.revision)continue;const failed=loaded.find(result=>result.status==='rejected');if(failed?.status==='rejected')this.notice(failed.reason);else this.failure='';
   // A failed neighbor is solid, never a fatal scene error. Build the healthy
   // owners (including their closed boundary) and leave failed owners unprepared.
   // Arrival on a later retry invalidates skipped chunks and opens only verified
   // coverage. This also preserves the current floor during destination queries.
   const chunks=[...this.desired.values()].filter(chunk=>!this.prepared.has(chunk.key)&&!this.skipped.has(chunk.key)).sort((a,b)=>this.priority(a)-this.priority(b)).slice(0,BATCH);if(!chunks.length)return;
   const needed=[...new Set(chunks.flatMap(chunk=>this.pageKeys(chunk)))],snapshot=new Map(needed.map(key=>[key,this.stream.resident.get(key)]));
   const retained=[...new Set([...this.desired.values()].flatMap(chunk=>this.pageKeys(chunk)))],retain=retained.filter(key=>this.stream.resident.has(key)),tiles:{key:string;bytes:Uint8Array}[]=[];
   for(const key of needed){const data=snapshot.get(key);if(data&&this.workerPages.get(key)!==data){tiles.push({key,bytes:data.bytes});this.workerPages.set(key,data);}}
   for(const key of [...this.workerPages.keys()])if(!retain.includes(key))this.workerPages.delete(key);
   const id=++this.sequence,surfaces=await new Promise<Surface[]>((resolve,reject)=>{this.requests.set(id,{resolve,reject});try{this.worker.postMessage({id,chunks,tiles,retain,tileCells:this.manifest.tileCells,detail:this.manifest.detail});}catch(error){this.requests.delete(id);this.workerPages.clear();reject(error);}});if(this.dead)return;
   for(const surface of surfaces){const chunk=this.desired.get(surface.key);if(!chunk||this.pageKeys(chunk).some(key=>snapshot.get(key)!==this.stream.resident.get(key)))continue;
    if(!surface.complete){this.prepared.delete(chunk.key);this.skipped.add(chunk.key);this.remove(chunk.key);continue;}
    const triangles=surface.indices.length/3,old=this.surfaces.get(chunk.key)?.triangles||0;
    if(this.physicsTriangles-old+triangles>MAX_TRIANGLES){const farther=[...this.surfaces.keys()].filter(key=>this.desired.has(key)&&this.priority(this.desired.get(key)!)>this.priority(chunk)).sort((a,b)=>this.priority(this.desired.get(b)!)-this.priority(this.desired.get(a)!));for(const key of farther){this.prepared.delete(key);this.skipped.add(key);this.remove(key);if(this.physicsTriangles-old+triangles<=MAX_TRIANGLES)break;}}
    if(this.physicsTriangles-old+triangles>MAX_TRIANGLES){this.prepared.delete(chunk.key);this.skipped.add(chunk.key);this.remove(chunk.key);continue;}
    this.prepared.delete(chunk.key);this.remove(chunk.key);this.updateFrame();
    if(triangles){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(surface.positions,3));geometry.setIndex(new THREE.BufferAttribute(surface.indices,1));const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x77efd3,wireframe:true,transparent:true,opacity:.45}));mesh.name=chunk.key;this.group.add(mesh);
     const positions=new Float32Array(surface.positions.length),point=new THREE.Vector3();for(let i=0;i<positions.length;i+=3){point.fromArray(surface.positions,i).applyMatrix4(this.group.matrixWorld);point.toArray(positions,i);}const collider=this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions,surface.indices));this.surfaces.set(chunk.key,{mesh,collider,triangles});}
    this.prepared.add(chunk.key);
   }
   this.world.step();this.onChange();
  }
 }
 private remove(key:string){const old=this.surfaces.get(key);if(!old)return;this.world.removeCollider(old.collider,true);old.mesh.geometry.dispose();(old.mesh.material as THREE.Material).dispose();old.mesh.removeFromParent();this.surfaces.delete(key);}
 update(point:Point,time:number,body?:Point){this.focus(point,body);if(this.dead||this.updating||time-this.lastUpdate<250)return;this.lastUpdate=time;this.schedule();this.updating=this.flush().catch(error=>this.notice(error)).finally(()=>{this.updating=undefined;});}
 updateOverview(camera:THREE.PerspectiveCamera,height:number){this.overview.update(camera,height);}
 async realign(){this.prepared.clear();this.skipped.clear();this.planKey='';this.focusKey='';this.plan();await this.flush();}
 navigationParts(){this.updateFrame(true);return [...this.surfaces.values()].map(({mesh})=>{const input=mesh.geometry.getAttribute('position'),positions=new Float32Array(input.count*3),point=new THREE.Vector3();for(let i=0;i<input.count;i++){point.fromBufferAttribute(input,i).applyMatrix4(mesh.matrixWorld);point.toArray(positions,i*3);}return {positions,indices:new Uint32Array(mesh.geometry.index!.array)};});}
 private covered(a:THREE.Vector3,b:THREE.Vector3,radius:number,halfExtent=[0,0,0]){
  const start=a.toArray(),end=b.toArray(),size=this.config.size,n=this.manifest.tileCells,detail=this.manifest.detail,low=start.map((value,i)=>Math.floor((Math.min(value,end[i])-radius-halfExtent[i])/size)),high=start.map((value,i)=>Math.floor((Math.max(value,end[i])+radius+halfExtent[i])/size));
  const tileLow=start.map((value,i)=>Math.floor((Math.min(value,end[i])-radius-halfExtent[i])/(n*detail))),tileHigh=start.map((value,i)=>Math.floor((Math.max(value,end[i])+radius+halfExtent[i])/(n*detail)));if(this.stream.air.containingNode(tileLow,tileHigh))return true;
  if(low.reduce((count,value,i)=>count*(high[i]-value+1),1)>16384)return false;const threshold=radius*radius-Math.min(1e-10,radius*radius*1e-6);
  for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){const coord=[x,y,z],key=coord.join(',');if(this.prepared.has(key))continue;const min=coord.map((value,i)=>value*size-halfExtent[i]),max=coord.map((value,i)=>(value+1)*size+halfExtent[i]);if(radius===0||segmentBoxDistanceSquared(start,end,min,max)<threshold)return false;}return true;
 }
 allows(point:Point,halfHeight=0,radius=.19){const a=this.toGeneration({x:point.x,y:point.y-halfHeight,z:point.z}),b=this.toGeneration({x:point.x,y:point.y+halfHeight,z:point.z}),r=radius/this.scale();return this.covered(a,b,r)&&this.stream.allowsCapsule(a,b,r);}
 allowsMotion(from:Point,to:Point,radius=.19){const a=this.toGeneration(from),b=this.toGeneration(to),r=radius/this.scale();return this.covered(a,b,r)&&this.stream.allowsCapsule(a,b,r);}
 /** Head visibility uses known voxel evidence, independently of physics readiness. */
 probeHeadMotion(from:Point,to:Point,radius=.095){const a=this.toGeneration(from),b=this.toGeneration(to);return this.stream.probeCapsule(a,b,radius/this.scale());}
 allowsWalkingMotion(from:Point,to:Point,halfHeight=.6,radius=.24){const a=this.toGeneration(from),b=this.toGeneration(to),axis=this.toGeneration({x:from.x,y:from.y+halfHeight,z:from.z}).sub(a),half=axis.toArray().map(Math.abs),r=radius/this.scale();return this.covered(a,b,r,half)&&this.stream.allowsCapsule(a,b,r,half);}
 get ready(){return !this.dead&&this.prepared.size>0;}
 get physicsChunks(){return this.prepared.size;}
 get physicsTriangles(){return [...this.surfaces.values()].reduce((sum,surface)=>sum+surface.triangles,0);}
 get residentChunks(){return this.physicsChunks;}
 get residentTriangles(){return this.physicsTriangles;}
 get residentTiles(){return this.stream.resident.size;}
 get residentBytes(){return this.stream.bytes;}
 dispose(){if(this.dead)return;this.dead=true;this.buildAbort?.abort();this.overview.dispose();this.stream.dispose();this.worker.terminate();for(const request of this.requests.values())request.reject(new DOMException('Collision scene disposed.','AbortError'));this.requests.clear();this.leases.clear();this.prepared.clear();this.workerPages.clear();for(const key of [...this.surfaces.keys()])this.remove(key);this.group.removeFromParent();}
}
