import type {CollisionAuthoring,CollisionVolume,EditorBridge,Hosting,TourScene} from './model';
import {normalizeStepHeight} from '../shared/walking.mjs';
import {CollisionAuthoringSchema} from '../shared/collision-selection.mjs';
import {sceneUrl} from '../shared/project.mjs';
import {buildCollision,type CollisionProgress} from './collision-builder';
import {buildPagedCollision,detectCollisionBounds} from './paged-collision-builder';

type Context={root:string;scene:TourScene;hosting:Hosting;base:string};
type Environment={context:(id:string)=>Context|undefined;complete:(id:string,ref:string)=>Promise<void>;bounds:(id:string,bounds:CollisionVolume)=>void;status:(text:string)=>void};
export interface CollisionJobState {working:boolean;cancelling:boolean;cancellable:boolean;sceneId:string;sceneName:string;kind:'generate'|'estimate';progress:CollisionProgress|null;result:string;revision:number}
type Running={cancelled:boolean;worker?:{cancel():void};session?:string;pending:Set<Promise<unknown>>};
const cancelled=()=>Object.assign(Error('Collision generation cancelled.'),{name:'AbortError'});
const signature=(context:Context)=>JSON.stringify([context.root,context.scene.id,sceneUrl(context.scene,context.hosting,context.base),context.scene.transform,normalizeStepHeight(context.scene.walkStepHeight),CollisionAuthoringSchema.parse(context.scene.collisionAuthoring||{})]);

// Owned by the editor, rather than an inspector panel that can be closed or replaced.
export class CollisionJob {
 private environment?:Environment;private running?:Running;private listeners=new Set<()=>void>();
 private state:CollisionJobState={working:false,cancelling:false,cancellable:false,sceneId:'',sceneName:'',kind:'generate',progress:null,result:'',revision:0};
 configure(environment:Environment){this.environment=environment;}
 getSnapshot=()=>this.state;
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 private update(patch:Partial<CollisionJobState>){this.state={...this.state,...patch,revision:this.state.revision+1};for(const listener of this.listeners)listener();}
 private status(text:string){this.environment?.status(text);}
 cancel=()=>{const running=this.running;if(!running||!this.state.cancellable||running.cancelled)return;running.cancelled=true;this.update({cancelling:true,cancellable:false,progress:{phase:'Cancelling collision generation…'}});this.status('Cancelling collision generation…');running.worker?.cancel();if(running.session)void window.studio?.abortPagedCollision(running.session).catch(()=>{});};
 dispose(){this.cancel();this.listeners.clear();}
 start=(sceneId:string,kind:'generate'|'estimate'='generate')=>{if(this.running)return;const context=this.environment?.context(sceneId),studio=window.studio;if(!context||!studio)return;const running:Running={cancelled:false,pending:new Set()};this.running=running;this.update({working:true,cancelling:false,cancellable:true,sceneId,sceneName:context.scene.name,kind,progress:{phase:kind==='estimate'?'Estimating scene bounds…':'Starting collision generation…'},result:''});void this.execute(running,context,studio,kind).catch(error=>{if(this.running!==running)return;this.running=undefined;const result=error instanceof Error?error.message:String(error);this.update({working:false,cancelling:false,cancellable:false,progress:null,result});this.status(result);});};
 private async execute(running:Running,context:Context,studio:EditorBridge,kind:'generate'|'estimate'){
  const authoring=CollisionAuthoringSchema.parse(context.scene.collisionAuthoring||{}) as CollisionAuthoring,request={url:sceneUrl(context.scene,context.hosting,context.base),transform:structuredClone(context.scene.transform),authoring,engineUrl:new URL('editor-engine/',document.baseURI).href},expected=signature(context);
  let diagnostics:{id:string;path:string}|undefined,savedRef='',lastLog=-Infinity,terminal:{type:'success'|'cancelled'|'error';message?:string;ref?:string;stats?:{selected:number;voxels:number;triangles:number}}|undefined,result='';
  const check=()=>{if(running.cancelled)throw cancelled();const current=this.environment?.context(context.scene.id);if(!current||signature(current)!==expected)throw Error('Scene changed during generation. Generate again from the current settings.');};
  const report=(progress:CollisionProgress)=>{if(running.cancelled)return;this.update({progress});this.status(progress.total?`${progress.phase} · ${progress.completed} / ${progress.total}`:progress.phase);if(diagnostics&&performance.now()-lastLog>=1000){lastLog=performance.now();void studio.appendCollisionDiagnostics(diagnostics.id,{type:'phase',phase:progress.phase,completed:progress.completed,total:progress.total}).catch(()=>{});}};
  const off=studio.onProgress(text=>{if(text.startsWith('Preparing walking tiles'))report({phase:text});});
  const persist=<T,>(fn:()=>Promise<T>)=>{const promise=fn();running.pending.add(promise);void promise.then(()=>running.pending.delete(promise),()=>running.pending.delete(promise));return promise;};
  try{
   if(kind==='estimate'){const worker=detectCollisionBounds(request,report);running.worker=worker;const bounds=await worker.promise;check();this.update({cancellable:false});this.environment!.bounds(context.scene.id,bounds);result='Scene bounds estimated. Review the box before generating collision.';}
   else{
    try{diagnostics=await studio.beginCollisionDiagnostics({sceneId:context.scene.id,source:request.url,format:authoring.format||'paged',scope:authoring.scope||'selected',volumeCount:authoring.volumes.length,hasBounds:!!authoring.bounds,options:authoring.options});}catch{}
    check();let ref:string,stats:{selected:number;voxels:number;triangles:number};
    if(authoring.format==='glb'){const worker=buildCollision(request,report);running.worker=worker;const generated=await worker.promise;check();report({phase:'Saving collision mesh…'});ref=await studio.saveCollisionGlb(generated.bytes);stats=generated.stats;}
    else{const id=running.session=await studio.beginPagedCollision();check();const worker=buildPagedCollision(request,report,{append:(key,cells)=>persist(()=>studio.appendPagedCollision(id,key,cells)),keys:()=>persist(()=>studio.pagedCollisionKeys(id)),read:(key,offset,maxCells)=>persist(()=>studio.readPagedCollision(id,key,offset,maxCells)),writeTile:(entry,bytes)=>persist(()=>studio.writePagedCollisionTile(id,entry,bytes)),finalize:manifest=>persist(()=>studio.finalizePagedCollision(id,manifest,normalizeStepHeight(context.scene.walkStepHeight)))});running.worker=worker;const generated=await worker.promise;ref=generated.ref;stats=generated.stats;}
    savedRef=ref;check();this.update({cancellable:false});report({phase:'Activating generated collision…'});await this.environment!.complete(context.scene.id,ref);terminal={type:'success',ref,stats};result=authoring.format==='glb'?`${stats.selected.toLocaleString()} splats · ${stats.triangles.toLocaleString()} triangles`:`${stats.selected.toLocaleString()} splats · ${stats.voxels.toLocaleString()} cells`;
   }
  }catch(error){const message=error instanceof Error?error.message:String(error);terminal={type:running.cancelled||error instanceof Error&&error.name==='AbortError'?'cancelled':'error',message,ref:savedRef||undefined};result=message;}
  finally{
   // Worker cancellation rejects promptly; persistence and navigation baking still need to drain.
   if(running.session)await studio.abortPagedCollision(running.session).catch(()=>{});await Promise.allSettled([...running.pending]);if(running.session)await studio.abortPagedCollision(running.session).catch(()=>{});off();
   if(diagnostics&&terminal){let logged=false;try{await studio.appendCollisionDiagnostics(diagnostics.id,terminal);logged=true;}catch{}if(terminal.type!=='success')result+=(logged?' Diagnostic log: ':' Diagnostic log could not be updated: ')+diagnostics.path;}
   if(this.running===running){this.running=undefined;this.update({working:false,cancelling:false,cancellable:false,progress:null,result});this.status(terminal?.type==='success'?'Collision ready · '+result:result);}
  }
 }
}
