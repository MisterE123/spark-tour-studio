import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {CollisionStream} from '../shared/collision-stream.mjs';
import {collisionTileKey} from '../shared/paged-collision.mjs';
import {sceneMatrix} from '../shared/collision-selection.mjs';

type Surface={key:string;positions:Float32Array;indices:Uint32Array};
type Resident={mesh:THREE.Mesh;collider:RAPIER.Collider;triangles:number};

/** A bounded physics neighborhood. Missing allowed-space data is always solid. */
export class PagedCollider {
 readonly group=new THREE.Group();readonly stream:CollisionStream;
 private worker=new Worker(new URL('./paged-physics.worker.ts',import.meta.url),{type:'module',name:'tour-collision-surfaces'});
 private surfaces=new Map<string,Resident>();private prepared=new Set<string>();private dirty=new Set<string>();private work?:Promise<void>;private sequence=0;
 private requests=new Map<number,{resolve:(surfaces:Surface[])=>void;reject:(error:Error)=>void}>();
 private dead=false;private lastUpdate=0;private updating?:Promise<void>;private failure='';
 onError=(message:string)=>{};onChange=()=>{};
 constructor(readonly manifest:any,readonly url:string,readonly world:RAPIER.World){
  this.group.name='paged-collision';this.group.matrixAutoUpdate=false;this.group.matrix.copy(sceneMatrix(manifest.sourceTransform).invert());
  this.stream=new CollisionStream(manifest,url,{onChange:(keys:string[])=>this.invalidate(keys)});
  this.stream.available=(key:string)=>this.prepared.has(key);
  this.worker.onmessage=({data})=>{const request=this.requests.get(data.id);this.requests.delete(data.id);if(!request)return;if(data.error)request.reject(Error(data.error));else request.resolve(data.results);};
  this.worker.onerror=event=>{for(const request of this.requests.values())request.reject(Error(event.message||'Collision surface worker failed.'));this.requests.clear();};
 }
 private neighbors(key:string){const c=key.split(',').map(Number),out=[key];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const coord=[...c];coord[axis]+=sign;out.push(collisionTileKey(coord));}return out;}
 private invalidate(keys:string[]){if(this.dead)return;for(const key of keys){this.prepared.delete(key);for(const neighbor of this.neighbors(key))this.dirty.add(neighbor);}if(!this.work)this.work=this.rebuild().finally(()=>{this.work=undefined;});this.work.catch(error=>this.notice(error));}
 private notice(error:unknown){if(this.dead||(error as Error)?.name==='AbortError')return;const message=error instanceof Error?error.message:String(error);if(message!==this.failure){this.failure=message;this.onError(message);}}
 private async rebuild(){
  while(!this.dead&&this.dirty.size){
   const keys=[...this.dirty];this.dirty.clear();const needed=new Set(keys.flatMap(key=>this.neighbors(key))),snapshot=new Map([...needed].flatMap(key=>{const data=this.stream.resident.get(key);return data?[[key,data] as const]:[];})),tiles=[...snapshot].map(([key,data])=>({key,bytes:data.bytes}));
   const id=++this.sequence,surfaces=await new Promise<Surface[]>((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.worker.postMessage({id,keys,tiles,tileCells:this.manifest.tileCells,detail:this.manifest.detail});});
   if(this.dead)return;
   const oldTriangles=[...this.surfaces].reduce((sum,[key,value])=>sum+(keys.includes(key)?0:value.triangles),0),newTriangles=surfaces.reduce((sum,surface)=>sum+surface.indices.length/3,0);
   if(oldTriangles+newTriangles>600000)throw Error('Nearby collision surfaces exceed the detail budget. Generate coarser collision tiles.');
   this.group.updateWorldMatrix(true,false);const matrix=this.group.matrixWorld;
   // A failed publication must never leave readiness from the replaced mesh.
   for(const key of keys){this.prepared.delete(key);this.remove(key);}
   for(const surface of surfaces){
    if(!snapshot.has(surface.key)||snapshot.get(surface.key)!==this.stream.resident.get(surface.key)||!surface.indices.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(surface.positions,3));geometry.setIndex(new THREE.BufferAttribute(surface.indices,1));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x77efd3,wireframe:true,transparent:true,opacity:.45}));mesh.name=surface.key;this.group.add(mesh);
    const positions=new Float32Array(surface.positions.length),point=new THREE.Vector3();for(let i=0;i<positions.length;i+=3){point.fromArray(surface.positions,i).applyMatrix4(matrix);point.toArray(positions,i);}
    const collider=this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions,surface.indices));this.surfaces.set(surface.key,{mesh,collider,triangles:surface.indices.length/3});
   }
   for(const key of keys){if(snapshot.has(key)&&snapshot.get(key)===this.stream.resident.get(key))this.prepared.add(key);else this.prepared.delete(key);}this.world.step();this.onChange();
  }
 }
 private remove(key:string){const old=this.surfaces.get(key);if(!old)return;this.world.removeCollider(old.collider,true);old.mesh.geometry.dispose();(old.mesh.material as THREE.Material).dispose();old.mesh.removeFromParent();this.surfaces.delete(key);}
 private async flush(){while(this.work)await this.work;}
 toGeneration(point:{x:number;y:number;z:number}){this.group.updateWorldMatrix(true,false);return new THREE.Vector3(point.x,point.y,point.z).applyMatrix4(this.group.matrixWorld.clone().invert());}
 fromGeneration(point:{x:number;y:number;z:number}){this.group.updateWorldMatrix(true,false);return new THREE.Vector3(point.x,point.y,point.z).applyMatrix4(this.group.matrixWorld);}
 private scale(){this.group.updateWorldMatrix(true,false);return this.group.matrixWorld.getMaxScaleOnAxis();}
 async ensure(point:{x:number;y:number;z:number},radius=4){
  if(this.dead)throw new DOMException('Collision scene disposed.','AbortError');
  const location=this.toGeneration(point),extent=Math.min(radius/this.scale(),this.manifest.tileSize*1.05),keys=await this.stream.ensureNear(location,extent);const unprepared=keys.filter((key:string)=>!this.prepared.has(key));if(unprepared.length)this.invalidate(unprepared);await this.flush();
  this.stream.trim([...new Set([...keys,...this.stream.near(location,this.manifest.tileSize*.6).map((entry:any)=>entry.key)])]);await this.flush();
  this.failure='';return keys;
 }
 update(point:{x:number;y:number;z:number},time:number){
  if(this.dead||this.updating||time-this.lastUpdate<250)return;this.lastUpdate=time;
  this.updating=this.ensure(point,this.manifest.tileSize*this.scale()*1.05).then(()=>{}).catch(error=>this.notice(error)).finally(()=>{this.updating=undefined;});
 }
 /** Collider edits remesh existing residents without fetching or resetting the rig. */
 async realign(){this.prepared.clear();this.invalidate([...this.stream.resident.keys()]);await this.flush();}
 navigationParts(){this.group.updateWorldMatrix(true,true);return [...this.surfaces.values()].map(({mesh})=>{const input=mesh.geometry.getAttribute('position'),positions=new Float32Array(input.count*3),point=new THREE.Vector3();for(let i=0;i<input.count;i++){point.fromBufferAttribute(input,i).applyMatrix4(mesh.matrixWorld);point.toArray(positions,i*3);}return {positions,indices:new Uint32Array(mesh.geometry.index!.array)};});}
 allows(point:{x:number;y:number;z:number},halfHeight=0,radius=.19){
  const a=this.toGeneration({x:point.x,y:point.y-halfHeight,z:point.z}),b=this.toGeneration({x:point.x,y:point.y+halfHeight,z:point.z});return this.stream.allowsCapsule(a,b,radius/this.scale());
 }
 allowsMotion(from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},radius=.19){return this.stream.allowsCapsule(this.toGeneration(from),this.toGeneration(to),radius/this.scale());}
 get ready(){return !this.dead&&this.prepared.size>0;}
 get residentTiles(){return this.stream.resident.size;}
 get residentBytes(){return this.stream.bytes;}
 dispose(){if(this.dead)return;this.dead=true;this.stream.dispose();this.worker.terminate();for(const request of this.requests.values())request.reject(new DOMException('Collision scene disposed.','AbortError'));this.requests.clear();for(const key of [...this.surfaces.keys()])this.remove(key);this.group.removeFromParent();}
}
