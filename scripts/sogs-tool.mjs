// Editor-only subprocess. A separate Dawn/PlayCanvas WebGPU device accelerates
// conversion when available; CPU fallback does not change the visitor backend.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readFile,getInputFormat,processSource,createChunkDataPool,decimateSource,decimateSourceAdaptive,stackLods,selectLod,writeLodSource,writeSource,WorkerQueue,WebPCodec,logger} from '@playcanvas/splat-transform';
import {NodeFileSystem,NodeReadFileSystem} from './vendor/sogs-node-fs.ts';
import {sogsDevice,SogsGpuError} from './sogs-gpu-device.mjs';
import {reduceSogsLevel,cpuAdaptiveUnavailable,sogsTargetCount} from './sogs-reduction.mjs';

WebPCodec.wasmUrl=new URL('./webp.wasm',import.meta.url).href;
WorkerQueue.workerUrl=new URL('./worker.mjs',import.meta.url).href;
WorkerQueue.maxWorkers=2;
let lastProgress=0;
const progress=text=>console.log(text);
logger.setRenderer({handle(event){if(event.kind==='scopeStart'||event.kind==='barStart')progress(event.name);else if(event.kind==='barTick'&&Date.now()-lastProgress>150){lastProgress=Date.now();progress(`${event.name} ${event.current} / ${event.total}`);}else if(event.kind==='message'&&['warn','error'].includes(event.level))progress(event.text);}});
const readFs=new NodeReadFileSystem(),writeFs=new NodeFileSystem();
let pool,device;const held=new Set();
async function open(filename,maxSh){
 const sources=await readFile({filename,inputFormat:'ply',fileSystem:readFs});
 if(sources.length!==1)throw Error('Choose one Gaussian splat PLY.');
 let source=sources[0];held.add(source);
 pool??=createChunkDataPool({chunkSize:source.meta.chunkSize,maxPooledBytes:128*1024*1024});
 source=await processSource(source,[{kind:'filterNaN'},{kind:'filterBands',value:maxSh}],pool);held.add(source);
 if(!source.meta.numGaussians||!['position','geometric','color'].every(layer=>source.meta.availableLayers.has(layer)))throw Error('The PLY does not contain Gaussian splat data.');
 return source;
}
try{
 const config=JSON.parse(await fs.readFile(process.argv[2],'utf8'));
 if(config.mode==='probe'){
  device=sogsDevice({compute:config.compute||'auto',progress});const graphics=await device.prepare(),report={backend:device.backend,adapter:device.adapter,fallbackReason:device.fallbackReason,computeResult:null};
  if(graphics){const gpu=graphics.wgpu,buffer=gpu.createBuffer({size:4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC}),readback=gpu.createBuffer({size:4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});try{await device.run(async()=>{const module=gpu.createShaderModule({code:'@group(0) @binding(0) var<storage,read_write> value: array<u32>; @compute @workgroup_size(1) fn main() { value[0] = 12345u; }'}),pipeline=gpu.createComputePipeline({layout:'auto',compute:{module,entryPoint:'main'}}),encoder=gpu.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,gpu.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer}}]}));pass.dispatchWorkgroups(1);pass.end();encoder.copyBufferToBuffer(buffer,0,readback,0,4);gpu.queue.submit([encoder.finish()]);await readback.mapAsync(GPUMapMode.READ);report.computeResult=new Uint32Array(readback.getMappedRange())[0];readback.unmap();if(report.computeResult!==12345)throw new SogsGpuError('WebGPU conversion probe returned invalid data.');});}finally{buffer.destroy();readback.destroy();}}
  await fs.writeFile(config.output,JSON.stringify(report,null,2)+'\n');progress('Conversion device probe complete.');
 }else if(config.mode==='extract'){
  const sources=await readFile({filename:config.source,inputFormat:getInputFormat(config.source),fileSystem:readFs});
  if(sources.length!==1)throw Error('Choose one SOG scene.');const source=sources[0];held.add(source);pool=createChunkDataPool({chunkSize:source.meta.chunkSize,maxPooledBytes:128*1024*1024});
  progress('Extracting the original detail level in its original PLY coordinates…');
  await writeSource({filename:config.output,source:selectLod(source,0),pool,outputFormat:'ply',options:{}},writeFs);
 }else{
 if(!['adaptive','uniform'].includes(config.method)||!['auto','cpu','gpu'].includes(config.compute||'auto')||!Number.isInteger(config.maxSh)||config.maxSh<0||config.maxSh>3||!Array.isArray(config.ratios)||!config.ratios.length||config.ratios.length>7||config.ratios.some((n,i,a)=>!Number.isFinite(n)||n<=0||n>=1||(i&&n>=a[i-1])))throw Error('Invalid SOG conversion settings.');
 const source=await open(config.source,config.maxSh),count=source.meta.numGaussians;
 progress(`Source: ${count.toLocaleString('en-US')} Gaussians; SH ${source.meta.shBands}`);
 device=sogsDevice({compute:config.compute||'auto',progress});const graphics=await device.prepare(),createDevice=graphics?device.createDevice:undefined;
 const report={version:1,converter:'PlayCanvas splat-transform 3.10.3',sourceCount:count,requested:{compute:config.requestedCompute||config.compute||'auto',method:config.method,maxSh:config.maxSh},effective:{compute:device.backend,maxSh:source.meta.shBands},adapter:device.adapter,fallbacks:[],levels:[{level:0,count,method:'original'}]};
 if(config.gpuFallbackReason)report.fallbacks.push({stage:'gpu-attempt',from:'webgpu',to:'cpu',reason:config.gpuFallbackReason});
 if(device.fallbackReason&&config.compute!=='cpu')report.fallbacks.push({stage:'initialization',from:'webgpu',to:'cpu',reason:device.fallbackReason});
 const paths=[config.source],seen=new Set([count]);
 const memoryBudgetBytes=Math.min(4*1024**3,Math.floor(os.totalmem()*.4));
 let effectiveMethod=config.method;
 for(const [index,ratio] of config.ratios.entries()){
  const targetCount=sogsTargetCount(count,ratio);if(seen.has(targetCount))continue;seen.add(targetCount);
  progress(`Building detail level ${index+1}: ${targetCount.toLocaleString('en-US')} Gaussians`);
  let reduction;
  try{reduction=await reduceSogsLevel({method:effectiveMethod,open:()=>open(config.source,config.maxSh),adaptive:decimateSourceAdaptive,uniform:decimateSource,pool,device,progress,options:{targetCount,memoryBudgetBytes,createDevice,spill:{writeFs,readFs,scratchDir:path.dirname(config.output),remove:file=>fs.unlink(file)}}});}
  catch(error){if(device.backend==='webgpu'&&cpuAdaptiveUnavailable(error))throw new SogsGpuError(error.message);throw error;}
  const reduced=reduction.source;effectiveMethod=reduction.method;held.add(reduced);
  if(reduction.fallback)report.fallbacks.push({stage:'detail-'+(index+1),from:'adaptive',to:'uniform',reason:reduction.fallback});
  if(reduced.meta.numGaussians!==targetCount)throw Error('The converter did not reach the requested detail count.');
  report.levels.push({level:paths.length,count:reduced.meta.numGaussians,method:effectiveMethod});
  const filename=path.join(path.dirname(config.output),`level-${index+1}.ply`);
  await device.run(()=>writeSource({filename,source:reduced,pool,outputFormat:'ply',options:{}},writeFs));await reduced.close();held.delete(reduced);paths.push(filename);pool.trim(0);
 }
 const levels=[];for(const filename of paths)levels.push(await open(filename,config.maxSh));
 progress('Compressing and partitioning the streaming SOG scene…');
 await device.run(()=>writeLodSource({filename:config.output,mainSource:stackLods(levels),envSource:null,iterations:config.iterations,chunkCount:config.chunkCount,chunkExtent:config.chunkExtent,chunkMin:8,createDevice},writeFs));device.assertHealthy();
 await fs.writeFile(path.join(path.dirname(config.output),'conversion-report.json'),JSON.stringify(report,null,2)+'\n');
 progress('Streamed SOG conversion complete · '+(device.backend==='webgpu'?'WebGPU':'CPU')+' '+effectiveMethod+' reduction.');
 }
}catch(error){console.error(error?.stack||String(error));process.exitCode=error instanceof SogsGpuError?42:1;}
finally{for(const source of [...held].reverse())await Promise.resolve(source.close()).catch(()=>{});pool?.destroy();await WorkerQueue.destroy();device?.dispose();}
