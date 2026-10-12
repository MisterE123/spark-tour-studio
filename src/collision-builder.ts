import type {CollisionRequest} from './collision-worker';
export interface CollisionStats {scanned:number;leaves:number;selected:number;ignored:number;footprint:number;voxels:number;triangles:number}
export interface CollisionResult {bytes:Uint8Array;stats:CollisionStats}
export interface CollisionProgress {phase:string;completed?:number;total?:number}
export function buildCollision(request:CollisionRequest,onProgress:(progress:CollisionProgress)=>void){
 const worker=new Worker(new URL('./collision-worker.ts',import.meta.url),{type:'module',name:'tour-collision-builder'});let settled=false,rejectJob:(error:Error)=>void;
 const promise=new Promise<CollisionResult>((resolve,reject)=>{rejectJob=reject;worker.onmessage=({data})=>{if(data.type==='progress'){onProgress(data);return;}settled=true;worker.terminate();if(data.type==='complete')resolve({bytes:data.bytes,stats:data.stats});else reject(Error(data.message||'Collision generation failed.'));};worker.onerror=event=>{settled=true;worker.terminate();reject(Error(event.message||'Collision worker failed.'));};worker.postMessage(request);});
 return {promise,cancel(){if(settled)return;settled=true;worker.terminate();rejectJob(Object.assign(Error('Collision generation cancelled.'),{name:'AbortError'}));}};
}
