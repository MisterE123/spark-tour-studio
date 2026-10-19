import type {CollisionRequest} from './collision-worker';
import type {CollisionProgress,CollisionStats} from './collision-builder';
import type {CollisionVolume} from './model';
export interface PagedCollisionSink {
 append(key:string,cells:Uint32Array):Promise<void>;
 keys():Promise<string[]>;
 read(key:string,offset:number,maxCells:number):Promise<{cells:Uint32Array;done:boolean}>;
 writeTile(entry:any,bytes:Uint8Array):Promise<void>;
 finalize(manifest:any):Promise<string>;
}
export interface PagedCollisionResult {ref:string;stats:CollisionStats}
export function detectCollisionBounds(request:CollisionRequest,onProgress:(progress:CollisionProgress)=>void){
 const worker=new Worker(new URL('./paged-collision-worker.ts',import.meta.url),{type:'module',name:'tour-collision-bounds'});let settled=false,rejectJob:(error:Error)=>void;
 const promise=new Promise<CollisionVolume>((resolve,reject)=>{rejectJob=reject;worker.onmessage=({data})=>{if(data.type==='progress'){onProgress(data);return;}settled=true;worker.terminate();if(data.type==='bounds')resolve(data.bounds);else reject(Error(data.message||'Scene bounds estimation failed.'));};worker.onerror=event=>{settled=true;worker.terminate();reject(Error(event.message||'Scene bounds worker failed.'));};worker.postMessage({type:'detect',request});});
 return {promise,cancel(){if(settled)return;settled=true;worker.terminate();rejectJob(Object.assign(Error('Scene bounds estimation cancelled.'),{name:'AbortError'}));}};
}
export function buildPagedCollision(request:CollisionRequest,onProgress:(progress:CollisionProgress)=>void,sink:PagedCollisionSink){
 const worker=new Worker(new URL('./paged-collision-worker.ts',import.meta.url),{type:'module',name:'tour-paged-collision-builder'});let settled=false,rejectJob:(error:Error)=>void;
 const promise=new Promise<PagedCollisionResult>((resolve,reject)=>{rejectJob=reject;worker.onmessage=async({data})=>{
  if(settled)return;
  if(data.type==='progress'){onProgress(data);return;}
  if(data.type==='sink'){
   try{let result:any;switch(data.method){case 'append':result=await sink.append(data.args[0],data.args[1]);break;case 'keys':result=await sink.keys();break;case 'read':result=await sink.read(data.args[0],data.args[1],data.args[2]);break;case 'writeTile':result=await sink.writeTile(data.args[0],data.args[1]);break;case 'finalize':result=await sink.finalize(data.args[0]);break;default:throw Error('Invalid collision persistence action.');}if(!settled){const transfer:Transferable[]=[];if(result?.cells instanceof Uint32Array)transfer.push(result.cells.buffer);worker.postMessage({type:'sinkResult',id:data.id,result},transfer);}}
   catch(error){if(!settled)worker.postMessage({type:'sinkResult',id:data.id,error:error instanceof Error?error.message:String(error)});}return;
  }
  settled=true;worker.terminate();if(data.type==='complete')resolve({ref:data.ref,stats:data.stats});else reject(Error(data.message||'Paged collision generation failed.'));
 };worker.onerror=event=>{settled=true;worker.terminate();reject(Error(event.message||'Paged collision worker failed.'));};worker.postMessage({type:'start',request});});
 return {promise,cancel(){if(settled)return;settled=true;worker.terminate();rejectJob(Object.assign(Error('Collision generation cancelled.'),{name:'AbortError'}));}};
}
