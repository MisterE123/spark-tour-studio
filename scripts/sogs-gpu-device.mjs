// SPDX-License-Identifier: MIT
// Copyright (c) 2011-2026 PlayCanvas Ltd. (upstream permission notice retained).
// Node device setup adapted from @playcanvas/splat-transform 3.10.3,
// src/cli/node-device.ts in the pinned package's dist/cli.mjs.map. Package
// revision and archive integrity are retained in sogs-tools/dependencies.json.
// Original source SHA-256: c3d15459606d16b292a5f3a59fca63f09d7d256cbd11d4edfdc06d2795318b7e.
// Local changes: host-owned device, memoized initialization, CPU fallback and
// batch failure monitoring. Unlike an interactive renderer, a conversion owns
// one device and must fail rather than recreate it after a lost/invalid result.
export class SogsGpuError extends Error{constructor(message){super(message);this.name='SogsGpuError';}}

const description=error=>error instanceof Error?error.message:String(error);
const optionalFeatures=['shader-f16','subgroups','float32-filterable','float32-blendable','bgra8unorm-storage'];

export function sogsDevice({compute='auto',progress=()=>{},loadDawn=()=>import('webgpu'),loadEngine=()=>import('playcanvas'),globals=globalThis,initializationTimeoutMs=20000}={}){
 let graphics,native,gpu,preparing,closed=false,failure,fail,uncaptured,phase='pending',info=null,reason='',initializing=true;
 const failed=new Promise((_,reject)=>{fail=error=>{if(closed||failure)return;failure=error instanceof SogsGpuError?error:new SogsGpuError(description(error));reject(failure);};});void failed.catch(()=>{});
 const assertHealthy=()=>{if(closed)throw new SogsGpuError('WebGPU conversion device is closed.');if(failure)throw failure;};
 const destroy=()=>{native?.removeEventListener?.('uncapturederror',uncaptured);try{graphics?.destroy();}catch{}try{native?.destroy();}catch{}if(gpu&&globals.window?.navigator?.gpu===gpu)delete globals.window.navigator.gpu;graphics=undefined;native=undefined;gpu=undefined;};
 const prepare=()=>preparing??=(async()=>{
  if(compute==='cpu'){phase='cpu';reason='CPU conversion was selected.';initializing=false;progress(reason);return null;}
  progress('Preparing WebGPU conversion…');phase='initializing';let timer;
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('WebGPU adapter initialization timed out.')),initializationTimeoutMs);});
  const work=(async()=>{
   const [dawn,{WebgpuGraphicsDevice}]=await Promise.all([loadDawn(),loadEngine()]);if(!initializing||closed)return null;
   Object.assign(globals,dawn.globals);gpu=dawn.create([]);
   globals.window={navigator:{userAgent:'node.js',gpu}};
   globals.document={createElement:type=>type==='canvas'?{width:1024,height:512,getContext:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:1024,height:512,right:1024,bottom:512})}:undefined};
   const adapter=await gpu.requestAdapter({powerPreference:'high-performance'});if(!initializing||closed)return null;if(!adapter)throw Error('No WebGPU adapter is available.');
   info={vendor:adapter.info?.vendor||'',architecture:adapter.info?.architecture||'',device:adapter.info?.device||'',description:adapter.info?.description||'',isFallbackAdapter:!!(adapter.info?.isFallbackAdapter??adapter.isFallbackAdapter??false)};
   if(compute==='auto'&&info.isFallbackAdapter)throw Error('Only a software WebGPU adapter is available.');
   const requiredLimits={};for(const name in adapter.limits)if(!['minSubgroupSize','maxSubgroupSize'].includes(name))requiredLimits[name]=adapter.limits[name];
   native=await adapter.requestDevice({requiredFeatures:optionalFeatures.filter(name=>adapter.features?.has(name)),requiredLimits,defaultQueue:{label:'SOGS conversion'}});if(!initializing||closed){destroy();return null;}
   uncaptured=event=>fail(new SogsGpuError('WebGPU '+(event?.error?.constructor?.name||'error')+': '+description(event?.error?.message||event?.error||'unknown error')));
   native.addEventListener?.('uncapturederror',uncaptured);native.lost?.then(value=>{if(value?.reason!=='destroyed')fail(new SogsGpuError('WebGPU device lost: '+(value?.reason||'unknown')+'; '+(value?.message||'no message')));});
   graphics=new WebgpuGraphicsDevice(globals.document.createElement('canvas'),{antialias:false,depth:false,stencil:false,powerPreference:'high-performance'});
   // Host-owned device: PlayCanvas must not recover/recreate halfway through a
   // batch and quietly publish incomplete or zero-filled output.
   await graphics.initFromGpuDevice(adapter,native,false);assertHealthy();
   return graphics;
  })();
  try{const device=await Promise.race([work,timeout]);initializing=false;if(closed)return null;if(!device)throw Error('WebGPU adapter initialization did not complete.');phase='webgpu';progress('Using WebGPU'+(info.isFallbackAdapter?' software adapter':'')+' for conversion'+(info.description||info.device?' · '+(info.description||info.device):'')+'.');return device;}
  catch(error){initializing=false;reason=description(error);destroy();if(compute==='gpu'){phase='failed';throw new SogsGpuError('WebGPU conversion was required but is unavailable: '+reason);}phase='cpu';failure=undefined;progress('WebGPU unavailable; using CPU conversion. '+reason);return null;}
  finally{clearTimeout(timer);}
 })();
 const run=async work=>{
  assertHealthy();if(phase!=='webgpu')return work();
  try{const result=await Promise.race([Promise.resolve().then(work),failed]);assertHealthy();if(native?.queue?.onSubmittedWorkDone)await Promise.race([native.queue.onSubmittedWorkDone(),failed]);assertHealthy();return result;}
  catch(error){if(failure)throw failure;if(/(?:WebGPU|\bGPU\b|mapAsync|device lost|out.of.memory|buffer.+mapping|shader.+(?:compil|error))/i.test(description(error)))throw new SogsGpuError(description(error));throw error;}
 };
 return {prepare,run,assertHealthy,createDevice:async()=>{assertHealthy();if(phase!=='webgpu'||!graphics)throw new SogsGpuError('WebGPU conversion device is unavailable.');return graphics;},get backend(){return phase;},get adapter(){return info;},get fallbackReason(){return reason;},dispose(){if(closed)return;closed=true;initializing=false;destroy();phase='closed';}};
}
