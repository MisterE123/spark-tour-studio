import test from 'node:test';
import assert from 'node:assert/strict';
import {sogsDevice,SogsGpuError} from '../scripts/sogs-gpu-device.mjs';
import {reduceSogsLevel,sogsTargetCount} from '../scripts/sogs-reduction.mjs';

test('odd detail targets finish a halving generation without one-point full replanning',()=>{
 for(const count of [257,13_996_173]){
  const half=sogsTargetCount(count,.5),quarter=sogsTargetCount(count,.25);
  assert.equal(half,count-Math.floor(count/2));
  assert.equal(quarter,half-Math.floor(half/2));
  assert.ok(half>Math.floor(count*.5));
 }
 assert.equal(sogsTargetCount(13_996_173,.5),6_998_087);
 assert.equal(sogsTargetCount(13_996_173,.25),3_499_044);
 assert.equal(sogsTargetCount(257,.5),129);assert.equal(sogsTargetCount(257,.25),65);
 assert.equal(sogsTargetCount(2048,.5),1024);assert.equal(sogsTargetCount(1,.125),1);
});

function fixture(){
 const calls={dawn:0,adapter:0,native:0,engine:0,destroy:0,graphicsDestroy:0,submitted:0},globals={},messages=[];let lose;
 const native=new EventTarget();native.lost=new Promise(resolve=>lose=resolve);native.queue={onSubmittedWorkDone:async()=>{calls.submitted++;}};native.destroy=()=>{calls.destroy++;lose({reason:'destroyed'});};
 const adapter={features:new Set(['shader-f16','subgroups']),limits:{maxBufferSize:512*1024*1024,maxStorageBufferBindingSize:128*1024*1024},info:{vendor:'test-vendor',description:'Test discrete adapter'},requestDevice:async descriptor=>{calls.native++;calls.descriptor=descriptor;return native;}};
 const gpu={requestAdapter:async options=>{calls.adapter++;calls.adapterOptions=options;return adapter;}};
 class GraphicsDevice{constructor(canvas,options){calls.engine++;calls.canvas=canvas;calls.options=options;}initFromGpuDevice(found,device,owns){calls.owns=owns;this.wgpu=device;this.gpuAdapter=found;return this;}destroy(){calls.graphicsDestroy++;}}
 const options={globals,progress:message=>messages.push(message),loadDawn:async()=>{calls.dawn++;return {globals:{GPUBufferUsage:{}},create:()=>gpu};},loadEngine:async()=>({WebgpuGraphicsDevice:GraphicsDevice})};
 return {calls,globals,messages,native,adapter,gpu,options,lose:value=>lose(value)};
}

test('conversion owns one memoized high-performance WebGPU device and waits for submitted work',async()=>{
 const f=fixture(),device=sogsDevice(f.options),[a,b]=await Promise.all([device.prepare(),device.prepare()]);assert.equal(a,b);assert.equal(f.calls.dawn,1);assert.equal(f.calls.adapter,1);assert.equal(f.calls.native,1);assert.equal(f.calls.owns,false,'A batch must not enable renderer-style device recovery.');assert.equal(f.calls.adapterOptions.powerPreference,'high-performance');assert.deepEqual(f.calls.descriptor.requiredFeatures,['shader-f16','subgroups']);assert.equal(f.calls.descriptor.requiredLimits.maxBufferSize,f.adapter.limits.maxBufferSize);assert.equal(await device.createDevice(),a);assert.equal(await device.run(async()=>12345),12345);assert.equal(f.calls.submitted,1);assert.equal(device.backend,'webgpu');assert.equal(device.adapter.description,'Test discrete adapter');device.dispose();device.dispose();assert.equal(f.calls.destroy,1);assert.equal(f.calls.graphicsDestroy,1);assert.ok(!f.globals.window.navigator.gpu);await assert.rejects(device.createDevice(),/closed/);
});

test('CPU selection never imports Dawn or creates graphics objects',async()=>{
 const f=fixture(),device=sogsDevice({...f.options,compute:'cpu'});assert.equal(await device.prepare(),null);assert.equal(device.backend,'cpu');assert.equal(f.calls.dawn,0);assert.equal(f.calls.native,0);assert.equal(f.calls.engine,0);assert.equal(await device.run(async()=>17),17);device.dispose();
});

test('an unavailable adapter falls back only in Automatic mode and reports the reason',async()=>{
 for(const compute of ['auto','gpu']){const f=fixture();f.gpu.requestAdapter=async()=>null;const device=sogsDevice({...f.options,compute});if(compute==='auto'){assert.equal(await device.prepare(),null);assert.equal(device.backend,'cpu');assert.match(device.fallbackReason,/No WebGPU adapter/);assert.ok(f.messages.some(message=>message.includes('using CPU')));}else await assert.rejects(device.prepare(),error=>error instanceof SogsGpuError&&/required but is unavailable/.test(error.message));device.dispose();}
});

test('Automatic uses CPU for a software adapter while explicit WebGPU accurately labels that adapter',async()=>{
 for(const compute of ['auto','gpu']){const f=fixture();f.adapter.info.isFallbackAdapter=true;f.adapter.info.description='Software WARP adapter';const device=sogsDevice({...f.options,compute});await device.prepare();assert.equal(device.adapter.isFallbackAdapter,true);if(compute==='auto'){assert.equal(device.backend,'cpu');assert.equal(f.calls.native,0);assert.match(device.fallbackReason,/software WebGPU/);}else{assert.equal(device.backend,'webgpu');assert.ok(f.messages.some(message=>message.includes('WebGPU software adapter')));}device.dispose();}
});

test('missing native bindings remain an explicit Automatic CPU fallback rather than a falsely labeled GPU run',async()=>{
 const device=sogsDevice({loadDawn:async()=>{throw Error('Native Dawn package unavailable');},loadEngine:async()=>({})});assert.equal(await device.prepare(),null);assert.equal(device.backend,'cpu');assert.match(device.fallbackReason,/Native Dawn package unavailable/);device.dispose();
});

test('partial initialization failure destroys native state before a CPU fallback',async()=>{
 const f=fixture();f.options.loadEngine=async()=>({WebgpuGraphicsDevice:class{initFromGpuDevice(){throw Error('Graphics initialization failed');}destroy(){f.calls.graphicsDestroy++;}}});const device=sogsDevice(f.options);assert.equal(await device.prepare(),null);assert.equal(device.backend,'cpu');assert.match(device.fallbackReason,/Graphics initialization failed/);assert.equal(f.calls.destroy,1);assert.equal(f.calls.graphicsDestroy,1);assert.ok(!f.globals.window.navigator.gpu);device.dispose();
});

test('timed-out initialization chooses CPU and cleans up a device that resolves late',async()=>{
 const f=fixture();let resolveNative;f.adapter.requestDevice=()=>new Promise(resolve=>resolveNative=resolve);const device=sogsDevice({...f.options,initializationTimeoutMs:10});assert.equal(await device.prepare(),null);assert.equal(device.backend,'cpu');assert.match(device.fallbackReason,/timed out/);resolveNative(f.native);await new Promise(resolve=>setTimeout(resolve,0));assert.equal(f.calls.destroy,1);assert.ok(!f.globals.window.navigator.gpu);device.dispose();
});

test('uncaptured validation and OOM abort pending GPU work instead of accepting zero-filled results',async()=>{
 for(const type of ['GPUValidationError','GPUOutOfMemoryError']){const f=fixture(),device=sogsDevice(f.options);await device.prepare();const work=device.run(()=>new Promise(()=>{})),event=new Event('uncapturederror');Object.defineProperty(event,'error',{value:{constructor:{name:type},message:'Invalid bind group'}});f.native.dispatchEvent(event);await assert.rejects(work,error=>error instanceof SogsGpuError&&error.message.includes(type));assert.throws(device.assertHealthy,/Invalid bind group/);device.dispose();}
});

test('lost GPU aborts the batch and intentional destruction is not a conversion failure',async()=>{
 const f=fixture(),device=sogsDevice(f.options);await device.prepare();const work=device.run(()=>new Promise(()=>{}));f.lose({reason:'unknown',message:'Adapter reset'});await assert.rejects(work,/device lost.*Adapter reset/);device.dispose();
 const clean=fixture(),normal=sogsDevice(clean.options);await normal.prepare();normal.dispose();await Promise.resolve();assert.equal(normal.backend,'closed');
});

test('CPU multi-block adaptive capability failure reopens the original and truthfully switches to uniform',async()=>{
 let opened=0,closed=0,adaptive=0,uniform=0;const progress=[],options={targetCount:7_000_000,memoryBudgetBytes:4*1024**3,maxSh:3};
 const params={method:'adaptive',open:async()=>({id:++opened,close:async()=>{closed++;}}),adaptive:async()=>{adaptive++;throw Error('multi-block adaptive decimation requires WebGPU (14,018,921 splats, 2,097,152-splat cores); provide a device, or use --decimate');},uniform:async(input,pool,actual)=>{uniform++;assert.equal(actual,options);assert.equal(input.id,2);return {meta:{numGaussians:options.targetCount}};},pool:{},options,device:{backend:'cpu',run:work=>work()},progress:message=>progress.push(message)};
 const result=await reduceSogsLevel(params);assert.equal(result.method,'uniform');assert.match(result.fallback,/requires WebGPU/);assert.equal(result.source.meta.numGaussians,7_000_000);assert.equal(opened,2);assert.equal(closed,1);assert.equal(adaptive,1);assert.equal(uniform,1);assert.match(progress[0],/uniform CPU/);
});

test('small CPU adaptive input keeps adaptive quality and ordinary input failures are never hidden',async()=>{
 const source={meta:{numGaussians:64}},device={backend:'cpu',run:work=>work()};let uniform=0;const parameters={method:'adaptive',open:async()=>({close:async()=>{}}),adaptive:async()=>source,uniform:async()=>{uniform++;},pool:{},options:{targetCount:64},device};assert.equal((await reduceSogsLevel(parameters)).method,'adaptive');assert.equal(uniform,0);await assert.rejects(reduceSogsLevel({...parameters,adaptive:async()=>{throw Error('Missing Gaussian rotation');}}),/Missing Gaussian rotation/);assert.equal(uniform,0);
});

test('GPU adaptive capability failure is surfaced for clean subprocess retry, never mixed with CPU output',async()=>{
 let uniform=0;await assert.rejects(reduceSogsLevel({method:'adaptive',open:async()=>({close:async()=>{}}),adaptive:async()=>{throw Error('multi-block adaptive decimation requires a WebGPU block working set that fits the adapter limits (core 5, halo 5)');},uniform:async()=>{uniform++;},pool:{},options:{targetCount:5},device:{backend:'webgpu',run:work=>work()}}),/adapter limits/);assert.equal(uniform,0);
});
