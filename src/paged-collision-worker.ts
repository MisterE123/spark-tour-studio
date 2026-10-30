import {Vector3} from 'three';
import {CollisionAuthoringSchema,sceneMatrix} from '../shared/collision-selection.mjs';
import {PAGED_COLLISION_FORMAT,collisionTileBounds,parseCollisionTileKey,encodeCollisionTile,collisionSha256,validatePagedCollisionManifest} from '../shared/paged-collision.mjs';
import {CollisionTileAccumulator,readStagedCollisionTile,compileNavigableDomain,navigableTileKeys,allowedCollisionCells,collisionFieldCells,CollisionBoundsSampler,quantizeCollisionCell} from '../shared/paged-collision-generator.mjs';
import {scanSplatLeaves} from './splat-leaves';
import type {CollisionRequest} from './collision-worker';
(globalThis as any).window=globalThis;
const progress=(phase:string,completed?:number,total?:number)=>postMessage({type:'progress',phase,completed,total});
let nextId=1;const pending=new Map<number,{resolve:(value:any)=>void;reject:(error:Error)=>void}>();
function callSink(method:string,...args:any[]):Promise<any>{return new Promise((resolve,reject)=>{const id=nextId++;pending.set(id,{resolve,reject});const transfer:Transferable[]=[];for(const value of args)if(value instanceof Uint32Array||value instanceof Uint8Array)transfer.push(value.buffer);(self as any).postMessage({type:'sink',id,method,args},transfer);});}
const sink={append:(key:string,cells:Uint32Array)=>callSink('append',key,cells),keys:()=>callSink('keys'),read:(key:string,offset:number,maxCells:number)=>callSink('read',key,offset,maxCells),writeTile:(entry:any,bytes:Uint8Array)=>callSink('writeTile',entry,bytes),finalize:(manifest:any)=>callSink('finalize',manifest)};
async function scanLeaves(request:CollisionRequest,visit:(x:number,y:number,z:number,opacity:number)=>Promise<void>|void){
 return scanSplatLeaves(request.url,visit,{progress});
}
export async function estimateCollisionBounds(request:CollisionRequest){
 const options=request.authoring.options,sampler=new CollisionBoundsSampler({detail:options.detail/request.transform.scale,minimumPadding:.25/request.transform.scale});await scanLeaves(request,(x,y,z,opacity)=>{if(!options.ignoreTransparent||opacity>=options.opacityCutoff)sampler.add(x,y,z);});return sampler.finish();
}
export async function generatePagedCollision(request:CollisionRequest){
 const authoring=CollisionAuthoringSchema.parse(request.authoring),{detail,pageSize}=authoring.options,tileCells=Math.round(pageSize/detail),tileSize=tileCells*detail;if(!Number.isFinite(pageSize)||pageSize<2||pageSize>64||tileCells<4||tileCells>256||tileCells%4||Math.abs(tileSize-pageSize)>1e-6)throw Error('Collision page size must use 4–256 cells per edge, in multiples of four.');const domain=compileNavigableDomain(authoring,request.transform),keys=navigableTileKeys(domain.bounds,tileSize),source=sceneMatrix(request.transform),point=new Vector3();
 let ignored=0,selected=0;const accumulator=new CollisionTileAccumulator({detail,tileCells,append:sink.append});
 const sourceStats=await scanLeaves(request,(x,y,z,opacity)=>{
  if(![x,y,z,opacity].every(Number.isFinite))return;if(authoring.options.ignoreTransparent&&opacity<authoring.options.opacityCutoff){ignored++;return;}
  point.set(x,y,z).applyMatrix4(source);const px=(quantizeCollisionCell(point.x,detail)+.5)*detail,py=(quantizeCollisionCell(point.y,detail)+.5)*detail,pz=(quantizeCollisionCell(point.z,detail)+.5)*detail;
  if(!domain.contains(px,py,pz))return;selected++;accumulator.add(point.x,point.y,point.z);if(accumulator.needsFlush)return accumulator.flush();
 });await accumulator.flush();const stagedKeys=new Set<string>(await sink.keys());
 const tiles:any[]=[],bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};let voxels=0,obstacleVoxels=0;
 for(let index=0;index<keys.length;index++){
  const key=keys[index];progress('Building navigable collision tiles…',index,keys.length);const coord=parseCollisionTileKey(key),obstacles=stagedKeys.has(key)?await readStagedCollisionTile(sink,key,tileCells):undefined;if(obstacles)obstacleVoxels+=obstacles.unique;
  const allowed=allowedCollisionCells(coord,tileCells,detail,domain.contains,obstacles?.field);if(!allowed.voxels)continue;
  const bytes=encodeCollisionTile({coord,tileCells,full:!!allowed.full,occupied:allowed.field?collisionFieldCells(allowed.field):[]}),tileBounds=collisionTileBounds(coord,tileSize),entry={key,coord,url:'tiles/'+coord.join('_')+'.scv',bytes:bytes.byteLength,sha256:await collisionSha256(bytes),bounds:tileBounds,voxels:allowed.voxels};
  for(let a=0;a<3;a++){bounds.min[a]=Math.min(bounds.min[a],tileBounds.min[a]);bounds.max[a]=Math.max(bounds.max[a],tileBounds.max[a]);}voxels+=allowed.voxels;await sink.writeTile(entry,bytes);tiles.push(entry);
 }
 if(!tiles.length)throw Error('No navigable cells remain. Enlarge the navigable regions or choose finer collision detail.');
 progress('Saving navigable collision…',keys.length,keys.length);const stats={...sourceStats,selected,ignored,footprint:0,voxels,triangles:0,obstacleVoxels,tiles:tiles.length,maxStagedCells:accumulator.maxBuffered},manifest={format:PAGED_COLLISION_FORMAT,version:1,representation:'allowed-space',detail,tileCells,tileSize,coordinateSystem:'generation',sourceTransform:request.transform,bounds,tiles,stats,generation:{scope:(authoring as any).scope||'selected',options:authoring.options,volumes:authoring.volumes,...((authoring as any).bounds?{bounds:(authoring as any).bounds}:{})}};
 validatePagedCollisionManifest(manifest);const ref=await sink.finalize(manifest);return {ref,stats};
}
self.onmessage=async event=>{
 const data=event.data;if(data.type==='sinkResult'){const job=pending.get(data.id);if(job){pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data.result);}return;}
 try{if(data.type==='detect'){const bounds=await estimateCollisionBounds(data.request);postMessage({type:'bounds',bounds});}else if(data.type==='start'){const result=await generatePagedCollision(data.request);postMessage({type:'complete',...result});}else throw Error('Invalid paged collision worker action.');}catch(error){postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}
};
