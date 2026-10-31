import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';
import {selectionTextureData} from '../../../shared/collision-selection.mjs';
import {radixSourceIssue} from '../../../shared/radix-source.mjs';
import {SplatAssetGroup,type SplatAssetMetadata,type SplatAssetOptions,type SplatAssetStats,type SplatBackend,type SplatBackendStats,type RadixBackendOptions,type RadixRenderSettings} from '../backend';
import {createRenderer,getGpuCaps,SplatRenderer,SplatCollection,WorkerPool,type AnySplatObject} from './vendor/radix.module.js';
import {openSogInput} from './sog/sog';
import {parseLod,defaultLodSettings,levelChains,type LodSettings} from './sog/lod';
import {SogLodStream} from './sog/lodStream';
import {decodeSogGpu} from './sog/gpuDecode';
import {sogObject,type SogArrays,type SogSelection} from './sog/sh';
import {Resident} from './sog/resident';
import {SurfaceProxy} from './surface-proxy';

const DEFAULTS:RadixRenderSettings={method:'ewa',sortBits:24,sortMode:'auto',autoSortDistance:.05,autoSortAngle:5,selectedSplatBudget:4_000_000,residentSplatBudget:16_000_000,lodBaseDistance:5,lodMultiplier:3,lodBehindPenalty:2,lodUnderfill:5,lodRangeMin:0,lodRangeMax:7,lodBudgetMode:'limit',lodUpdateDistance:.5,lodUpdateAngle:90,maxShDegree:3,minAlpha:.5/255,maxStdDev:Math.sqrt(8),minPixelRadius:0,maxPixelRadius:512,minContribution:0,blurAmount:.3,preBlurAmount:0,sortGuard:0,pixelRatio:1.5,xrResolutionScale:1};
const asError=(error:unknown)=>error instanceof Error?error:new Error(String(error));
const canceled=()=>new DOMException('Scene loading was canceled.','AbortError');
const finite=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?THREE.MathUtils.clamp(value,min,max):fallback;

class RadixAsset extends SplatAssetGroup {
 readonly bounds=new THREE.Box3();
 readonly stats:SplatAssetStats={phase:'loading',selected:0,shown:0,residentSplats:0,residentFiles:0,loading:0,failed:0,error:''};
 private completion!:Promise<SplatAssetMetadata>;
 private resolve!:(metadata:SplatAssetMetadata)=>void;
 private reject!:(error:unknown)=>void;
 private settled:'pending'|'ready'|'error'='pending';
 private published=false;
 private metadata?:SplatAssetMetadata;
 private readonly abort=new AbortController();
 private readonly unlink?:()=>void;
 private dead=false;
 private degree=3;
 private stream?:SogLodStream;
 private single?:{gpu:SogArrays;resident:Resident;object:AnySplatObject};
 private current=SplatCollection.EMPTY;
 private readonly proxy=new SurfaceProxy();
 private readonly selectionOwner:Resident;
 private readonly selection:SogSelection;
 private readonly lod: LodSettings;
 private lastScale=NaN;
 private ownSettings:RadixRenderSettings;
 private readonly worldScale=new THREE.Vector3();

 constructor(private readonly owner:RadixBackend,readonly url:string,private readonly options:SplatAssetOptions={}){
  super();this.name='radix-sog-asset';this.userData.surfacePicking='approximate-coarse-sog';
  this.degree=finite(options.maxSh??3,0,3,3);
  const texture=new THREE.DataTexture(new Float32Array(5*128*4),5,128,THREE.RGBAFormat,THREE.FloatType);
  texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  this.selectionOwner=new Resident(()=>texture.dispose());
  this.selection={texture,count:0,retain:()=>this.selectionOwner.hold()};
  this.ownSettings={...owner.settings};this.lod=defaultLodSettings(owner.node.sortMode==='cpu');
  if(options.signal){const abort=()=>this.dispose();options.signal.addEventListener('abort',abort,{once:true});this.unlink=()=>options.signal?.removeEventListener('abort',abort);}
  this.resetCompletion();
  if(options.signal?.aborted)this.dispose();else void this.load();
 }
 get initialized(){return this.completion;}
 get maxSh(){return this.degree;}
 set maxSh(value:number){this.setMaxSh(value);}
 setMaxSh(value:number){this.degree=finite(value,0,3,3);this.stream?.setDegree(Math.min(this.degree,this.ownSettings.maxShDegree));if(this.single)this.single.object.params={...this.single.object.params,maxShDegree:Math.min(this.degree,this.ownSettings.maxShDegree,this.single.gpu.degree)};}
 invalidateTransform(){this.lastScale=NaN;this.stream?.invalidate();}
 setSelection(volumes:unknown[]){
  if(this.dead)return;
  (this.selection.texture.image as unknown as {data:Float32Array}).data=selectionTextureData(volumes);
  this.selection.count=volumes.length;this.selection.texture.needsUpdate=true;
 }
 private resetCompletion(){this.settled='pending';this.completion=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});void this.completion.catch(()=>{});}
 private fail(error:unknown,fatal=false){
  if(this.dead||this.abort.signal.aborted)return;
  const failure=asError(error);this.stats.error=failure.message;this.stats.failed=Math.max(1,this.stats.failed);
  if(this.settled==='pending'&&(fatal||!this.stream||this.stream.baseFailed)){this.stats.phase='error';this.settled='error';this.reject(failure);}
  else if(this.settled==='ready')this.options.onError?.(failure);
 }
 private finish(){if(this.settled!=='pending'||!this.metadata||this.dead)return;this.settled='ready';this.stats.phase='ready';this.resolve(this.metadata);this.options.onProgress?.(1,'Scene ready');}
 private async load(){
  try{
   const parsed=new URL(this.url,location.href);
   const issue=radixSourceIssue(parsed.href);if(issue)throw new Error(issue);
   const opened=await openSogInput(parsed.href,{signal:this.abort.signal,onProgress:this.options.onProgress});
   this.abort.signal.throwIfAborted();
   if(opened.kind==='lod'){
    const tree=parseLod(opened.json,opened.url);this.bounds.set(new THREE.Vector3(...tree.min),new THREE.Vector3(...tree.max));
    this.metadata={format:'sog-lod',lod:true,splatCount:tree.levelTotals[0]||Math.max(...tree.levelTotals),levels:tree.levels,bounds:this.bounds};
    this.stream=new SogLodStream({renderer:this.owner.renderer,tree,camera:this.owner.head,matrixWorld:this.matrixWorld,settings:this.lod,degree:Math.min(this.degree,this.ownSettings.maxShDegree),signal:this.abort.signal,onError:error=>this.fail(error),selection:this.selection});
    this.stats.phase='streaming';this.applySettings(this.ownSettings);this.options.onProgress?.(0,'Loading initial LoD coverage');
   }else{
    const gpu=await decodeSogGpu(this.owner.renderer,opened.source,{onProgress:this.options.onProgress});
    if(this.dead||this.abort.signal.aborted){gpu.arrays.dispose();gpu.palette?.dispose();return;}
    const resident=new Resident(()=>{gpu.arrays.dispose();gpu.palette?.dispose();});
    const object=sogObject(gpu,{degree:Math.min(this.degree,this.ownSettings.maxShDegree),matrixWorld:this.matrixWorld,release:resident.hold(),selection:this.selection});
    this.single={gpu,resident,object};this.current=new SplatCollection([object]);
    const unlog=(value:number)=>Math.sign(value)*Math.expm1(Math.abs(value)),meta=opened.source.meta;
    this.bounds.set(new THREE.Vector3(...meta.means.mins.map(unlog)),new THREE.Vector3(...meta.means.maxs.map(unlog)));
    this.metadata={format:meta.version===1?'sogs':'sog',lod:false,splatCount:meta.count,levels:1,bounds:this.bounds};
    Object.assign(this.stats,{selected:meta.count,shown:meta.count,residentSplats:meta.count,residentFiles:1});this.finish();
   }
  }catch(error){if(!this.dead&&!this.abort.signal.aborted){this.stats.phase='error';this.settled='error';this.stats.error=asError(error).message;this.reject(error);}}
 }
 applySettings(settings:RadixRenderSettings){
  this.ownSettings={...settings};this.updateDistances();
  Object.assign(this.lod,{splatBudget:settings.selectedSplatBudget,residentBudget:settings.residentSplatBudget,multiplier:settings.lodMultiplier,behindPenalty:settings.lodBehindPenalty,underfillLimit:settings.lodUnderfill,rangeMin:settings.lodRangeMin,rangeMax:settings.lodRangeMax,budgetMode:settings.lodBudgetMode,updateAngle:settings.lodUpdateAngle});
  if(this.stream){
   const tree=this.stream.tree,rangeMax=Math.max(0,Math.min(this.lod.rangeMax,tree.levels-1)),rangeMin=Math.max(0,Math.min(this.lod.rangeMin,rangeMax));
   // Match selectLevels, including sparse-level fallback. This cached chain
   // calculation runs on metadata/settings changes, never per-frame per leaf.
   this.stats.selectionFloor=levelChains(tree,rangeMin,rangeMax).coarsest;
  }
  this.setMaxSh(this.degree);this.stream?.invalidate();
 }
 private updateDistances(){
  this.getWorldScale(this.worldScale);const scale=Math.max(1e-9,Math.abs(this.worldScale.x));
  if(scale!==this.lastScale){this.lastScale=scale;this.stream?.invalidate();}
  this.lod.baseDistance=this.ownSettings.lodBaseDistance/scale;this.lod.updateDistance=this.ownSettings.lodUpdateDistance/scale;
 }
 get collection(){return this.current;}
 notePublished(){this.published=true;}
 reportError(error:unknown){this.fail(error,true);}
 update(now:number){
  if(this.dead)return;
  this.updateWorldMatrix(true,false);this.updateDistances();
  if(this.stream){
   if(this.stream.update(now))this.current=this.stream.collection;
   const s=this.stream.stats;Object.assign(this.stats,{selected:s.selected,shown:s.shown,residentSplats:s.residentSplats,residentFiles:s.residentFiles,loading:s.loading,failed:s.failed});
   if(this.stream.baseReady)this.finish();
   const sources=this.stream.proxySources();for(const source of sources)this.proxy.offer(source.key,source.arrays,source.retain,sources.length);
  }else if(this.single)this.proxy.offer(this.url,this.single.gpu.arrays,()=>this.single!.resident.hold());
  if(this.settled==='ready')this.stats.phase=this.stats.loading?'streaming':'ready';
 }
 override raycast(raycaster:THREE.Raycaster,intersects:THREE.Intersection[]){this.proxy.intersect(raycaster,this,this.bounds,intersects);}
 retry(){
  if(this.dead)return;
  this.stats.error='';this.stats.failed=0;
  if(this.stream){if(this.settled==='error')this.resetCompletion();this.stats.phase='streaming';this.stream.retry();}
  else if(this.settled==='error'){this.resetCompletion();this.stats.phase='loading';void this.load();}
 }
 dispose(){
  if(this.dead)return;this.dead=true;this.abort.abort();this.unlink?.();
  if(this.settled==='pending')this.reject(canceled());
  this.stream?.dispose();if(this.single&&!this.published)this.single.object.release?.();this.single?.resident.drop();this.selectionOwner.drop();this.proxy.dispose();
  this.current=SplatCollection.EMPTY;this.stats.phase='disposed';this.stats.selectionFloor=undefined;this.removeFromParent();this.owner.forget(this);
 }
}

export class RadixBackend implements SplatBackend {
 readonly stats:SplatBackendStats;
 readonly node:SplatRenderer;
 readonly head=new THREE.PerspectiveCamera();
 settings:RadixRenderSettings={...DEFAULTS};
 private readonly assets=new Set<RadixAsset>();
 private readonly sortPool:WorkerPool;
 private dead=false;
 private members=new Set<RadixAsset>();
 private presented=new Set<RadixAsset>();
 private composed:AnySplatObject[]=[];
 private beforeDrawCalls=0;
 private completedDraw=0;
 private markedDraw=0;
 private drawnCollection=SplatCollection.EMPTY;
 private countRead=false;
 private countedAt=-Infinity;
 private readonly physicalView=new THREE.ArrayCamera();
 private readonly eyePosition=new THREE.Vector3();
 private readonly midpoint=new THREE.Vector3();
 constructor(readonly renderer:WebGPURenderer,settings:Partial<RadixRenderSettings>={}){
  const backend=getGpuCaps(renderer).backend;
  this.stats={backend,selected:0,shown:0,visible:0,residentSplats:0,loading:0,failed:0,frames:0};
  this.sortPool=new WorkerPool({size:Math.max(1,Math.min(4,navigator.hardwareConcurrency||2))});
  this.node=new SplatRenderer({renderer,sortWorker:this.sortPool,autoSort:{distance:.05,angle:THREE.MathUtils.degToRad(5)}});
  this.node.name='radix-tour-splats';this.node.view=this.node.viewFor('tour-head');this.node.renderOrder=-1;
  const prepare=this.node.onBeforeRender.bind(this.node);
  this.node.onBeforeRender=(renderer,scene,camera)=>{prepare(renderer,scene,this.physicalCamera(camera));this.beforeDrawCalls=this.renderer.info.render.drawCalls;};
  this.node.onAfterRender=()=>{
   // Three calls onAfterRender even while an asynchronous pipeline is still
   // compiling. Only a real backend draw advances the render-call counter.
   if(this.node.geometry.instanceCount>0&&this.renderer.info.render.drawCalls>this.beforeDrawCalls){this.completedDraw++;this.drawnCollection=this.node.sortMode==='gpu'?this.node.collection:this.node.view?.order?.collection??SplatCollection.EMPTY;}
  };
  this.head.matrixAutoUpdate=false;this.physicalView.matrixAutoUpdate=false;this.physicalView.matrixWorldAutoUpdate=false;this.applySettings(settings);
 }
 createAsset(url:string,options:SplatAssetOptions={}){if(this.dead)throw new Error('The splat renderer is closed.');options.signal?.throwIfAborted();const asset=new RadixAsset(this,url,options);this.assets.add(asset);return asset;}
 forget(asset:RadixAsset){this.assets.delete(asset);this.presented.delete(asset);this.refreshSelectionFloor();}
 private attached(asset:RadixAsset){let root:THREE.Object3D=asset;for(;;){if(!root.visible)return false;if(!root.parent)break;root=root.parent;}let scene:THREE.Object3D=this.node;while(scene.parent)scene=scene.parent;return asset.parent!==null&&root===scene;}
 private refreshSelectionFloor(){
  let floor:number|undefined;
  for(const asset of this.assets)if(this.attached(asset)&&asset.stats.selectionFloor!==undefined)floor=floor===undefined?asset.stats.selectionFloor:Math.min(floor,asset.stats.selectionFloor);
  this.stats.selectionFloor=floor;
 }
 private physicalCamera(camera:THREE.Camera):THREE.Camera{
  const array=camera as THREE.ArrayCamera;
  if(!array.isArrayCamera||array.cameras.length<2)return camera;
  // Three's union-frustum camera sits behind the eyes. Radix defines this
  // matrix as the physical head for LoD, projection and the shared sort.
  // Use a persistent private camera; never alter tracked eyes or Three's rig.
  this.midpoint.set(0,0,0);for(const eye of array.cameras)this.midpoint.add(this.eyePosition.setFromMatrixPosition(eye.matrixWorld));this.midpoint.multiplyScalar(1/array.cameras.length);
  const view=this.physicalView;view.cameras=array.cameras;view.matrixWorld.copy(array.matrixWorld).setPosition(this.midpoint);view.matrix.copy(view.matrixWorld);view.matrixWorldInverse.copy(view.matrixWorld).invert();view.projectionMatrix.copy(array.projectionMatrix);view.projectionMatrixInverse.copy(array.projectionMatrixInverse);view.coordinateSystem=array.coordinateSystem;view.layers.mask=array.layers.mask;
  return view;
 }
 update(camera:THREE.Camera,time=performance.now()){
  if(this.dead)return;
  camera=this.renderer.xr.isPresenting?this.renderer.xr.getCamera():camera;
  camera.updateMatrixWorld();camera=this.physicalCamera(camera);this.head.matrix.copy(camera.matrixWorld);this.head.matrixWorld.copy(camera.matrixWorld);this.head.matrixWorldInverse.copy(camera.matrixWorld).invert();
  const view=camera as THREE.ArrayCamera,eye=view.isArrayCamera?view.cameras[0]:camera;
  this.head.fov=THREE.MathUtils.radToDeg(2*Math.atan(1/Math.max(1e-9,Math.abs(eye?.projectionMatrix.elements[5]||1))));
  this.head.aspect=Math.abs((eye?.projectionMatrix.elements[5]||1)/(eye?.projectionMatrix.elements[0]||1));
  const applied=this.node.sortMode==='gpu'||this.node.collection.count===0||this.node.view?.order?.collection===this.node.collection;
  const objects:AnySplatObject[]=[],members=new Set<RadixAsset>();
  Object.assign(this.stats,{selected:0,shown:0,residentSplats:0,loading:0,failed:0,selectionFloor:undefined});
  for(const asset of this.assets){
   if(!this.attached(asset))continue;
   if(applied)try{asset.update(time);}catch(error){asset.reportError(error);}
   objects.push(...asset.collection.objects.map(entry=>entry.object));if(asset.collection.count)members.add(asset);
   this.stats.selected+=asset.stats.selected;this.stats.shown+=asset.stats.shown;this.stats.residentSplats+=asset.stats.residentSplats;this.stats.loading+=asset.stats.loading;this.stats.failed+=asset.stats.failed;
   if(asset.stats.selectionFloor!==undefined)this.stats.selectionFloor=this.stats.selectionFloor===undefined?asset.stats.selectionFloor:Math.min(this.stats.selectionFloor,asset.stats.selectionFloor);
  }
  if(objects.length!==this.composed.length||objects.some((object,i)=>object!==this.composed[i])){this.composed=objects;this.node.collection=objects.length?new SplatCollection(objects):SplatCollection.EMPTY;this.members=members;for(const asset of members)asset.notePublished();this.presented.clear();}
 }
 markRendered(){
  if(this.dead)return;this.stats.frames++;
  if(this.completedDraw>this.markedDraw&&this.drawnCollection===this.node.collection)for(const member of this.members)if(member.stats.shown>0)this.presented.add(member);
  this.markedDraw=this.completedDraw;
  if(this.node.sortMode==='cpu')this.stats.visible=this.node.view?.order?.visible??0;
  else if(this.completedDraw>0&&!this.countRead&&performance.now()-this.countedAt>1000){
   const collection=this.node.collection;this.countRead=true;this.countedAt=performance.now();
   void this.node.readSortedCount().then(count=>{if(!this.dead&&this.node.collection===collection)this.stats.visible=count;}).catch(()=>{}).finally(()=>{this.countRead=false;});
  }
 }
 hasPresented(asset:SplatAssetGroup){return this.presented.has(asset as RadixAsset)&&asset.stats.phase!=='error'&&asset.stats.phase!=='disposed';}
 applySettings(values:Partial<RadixRenderSettings>){
  if(this.dead)return;
  this.settings={...this.settings,...values};const s=this.settings;
  s.selectedSplatBudget=Math.round(finite(s.selectedSplatBudget,1,32_000_000,DEFAULTS.selectedSplatBudget));s.residentSplatBudget=Math.round(finite(s.residentSplatBudget,1000,64_000_000,DEFAULTS.residentSplatBudget));
  this.node.method=s.method;this.node.sortBits=s.sortBits;this.node.sortMode=s.sortMode==='cpu'?'cpu':this.stats.backend==='webgpu'?'gpu':'cpu';
  this.node.autoSort={distance:s.autoSortDistance,angle:THREE.MathUtils.degToRad(s.autoSortAngle)};
  Object.assign(this.node.params,{minAlpha:s.minAlpha,maxStdDev:s.maxStdDev});
  Object.assign(this.node.objectParams,{minPixelRadius:s.minPixelRadius,maxPixelRadius:s.maxPixelRadius,minContribution:s.minContribution,blurAmount:s.blurAmount,preBlurAmount:s.preBlurAmount,sortGuard:s.sortGuard,maxShDegree:s.maxShDegree});
  if(!this.renderer.xr.isPresenting)this.renderer.setPixelRatio(Math.min(devicePixelRatio,s.pixelRatio));
  for(const asset of this.assets)asset.applySettings(s);
  this.refreshSelectionFloor();
 }
 dispose(){if(this.dead)return;this.dead=true;this.renderer.setAnimationLoop(null);for(const asset of [...this.assets])asset.dispose();this.node.dispose();this.node.removeFromParent();this.sortPool.dispose();this.members.clear();this.presented.clear();this.composed=[];this.renderer.dispose();this.renderer.domElement.remove();}
}

export async function createRadixBackend(options:RadixBackendOptions={}):Promise<RadixBackend>{
 let backend=options.backend??'auto';
 if(backend==='auto'&&options.xr!==false&&typeof navigator!=='undefined'&&navigator.xr&&!('XRGPUBinding' in globalThis)){
  try{if(await navigator.xr.isSessionSupported('immersive-vr'))backend='webgpu-gl';}catch{/* Desktop WebGPU remains available if XR capability cannot be queried. */}
 }
 const renderer=await createRenderer({backend,canvas:options.canvas,xr:options.xr??true,multiview:options.multiview??true,directCanvas:options.directCanvas??false,antialias:false});
 // Three currently omits the requested eye-buffer scale from this binding.
 const xr=renderer.xr as unknown as {getWebGPUBinding?:()=>{createProjectionLayer:(init?:Record<string,unknown>)=>unknown}|null;getFramebufferScaleFactor:()=>number};
 if(xr.getWebGPUBinding){const get=xr.getWebGPUBinding.bind(xr),patched=new WeakSet<object>();xr.getWebGPUBinding=()=>{const binding=get();if(binding&&!patched.has(binding)){const create=binding.createProjectionLayer.bind(binding);binding.createProjectionLayer=init=>create({...init,scaleFactor:xr.getFramebufferScaleFactor()});patched.add(binding);}return binding;};}
 try{return new RadixBackend(renderer,options.settings);}catch(error){renderer.dispose();renderer.domElement.remove();throw error;}
}
