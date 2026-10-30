// Editor-only subprocess. All conversion uses PlayCanvas's CPU implementation;
// the visitor renderer and the author's GPU are independent of this tool.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readFile,getInputFormat,processSource,createChunkDataPool,decimateSource,decimateSourceAdaptive,stackLods,selectLod,writeLodSource,writeSource,WorkerQueue,WebPCodec,logger} from '@playcanvas/splat-transform';
import {NodeFileSystem,NodeReadFileSystem} from './vendor/sogs-node-fs.ts';

WebPCodec.wasmUrl=new URL('./webp.wasm',import.meta.url).href;
WorkerQueue.workerUrl=new URL('./worker.mjs',import.meta.url).href;
WorkerQueue.maxWorkers=2;
let lastProgress=0;
const progress=text=>console.log(text);
logger.setRenderer({handle(event){if(event.kind==='scopeStart'||event.kind==='barStart')progress(event.name);else if(event.kind==='barTick'&&Date.now()-lastProgress>150){lastProgress=Date.now();progress(`${event.name} ${event.current} / ${event.total}`);}else if(event.kind==='message'&&['warn','error'].includes(event.level))progress(event.text);}});
const readFs=new NodeReadFileSystem(),writeFs=new NodeFileSystem();
let pool;const held=new Set();
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
 if(config.mode==='extract'){
  const sources=await readFile({filename:config.source,inputFormat:getInputFormat(config.source),fileSystem:readFs});
  if(sources.length!==1)throw Error('Choose one SOG scene.');const source=sources[0];held.add(source);pool=createChunkDataPool({chunkSize:source.meta.chunkSize,maxPooledBytes:128*1024*1024});
  progress('Extracting the original detail level in its original PLY coordinates…');
  await writeSource({filename:config.output,source:selectLod(source,0),pool,outputFormat:'ply',options:{}},writeFs);
 }else{
 if(!['adaptive','uniform'].includes(config.method)||!Number.isInteger(config.maxSh)||config.maxSh<0||config.maxSh>3||!Array.isArray(config.ratios)||!config.ratios.length||config.ratios.length>7||config.ratios.some((n,i,a)=>!Number.isFinite(n)||n<=0||n>=1||(i&&n>=a[i-1])))throw Error('Invalid SOG conversion settings.');
 const source=await open(config.source,config.maxSh),count=source.meta.numGaussians;
 progress(`Source: ${count.toLocaleString('en-US')} Gaussians; SH ${source.meta.shBands}`);
 const paths=[config.source],seen=new Set([count]);
 const memoryBudgetBytes=Math.min(4*1024**3,Math.floor(os.totalmem()*.4));
 for(const [index,ratio] of config.ratios.entries()){
  const targetCount=Math.max(1,Math.floor(count*ratio));if(seen.has(targetCount))continue;seen.add(targetCount);
  progress(`Building detail level ${index+1}: ${targetCount.toLocaleString('en-US')} Gaussians`);
  const input=await open(config.source,config.maxSh),method=config.method==='adaptive'?decimateSourceAdaptive:decimateSource;
  const reduced=await method(input,pool,{targetCount,memoryBudgetBytes,spill:{writeFs,readFs,scratchDir:path.dirname(config.output),remove:file=>fs.unlink(file)}});held.add(reduced);
  const filename=path.join(path.dirname(config.output),`level-${index+1}.ply`);
  await writeSource({filename,source:reduced,pool,outputFormat:'ply',options:{}},writeFs);await reduced.close();held.delete(reduced);held.delete(input);paths.push(filename);pool.trim(0);
 }
 const levels=[];for(const filename of paths)levels.push(await open(filename,config.maxSh));
 progress('Compressing and partitioning the streaming SOG scene…');
 await writeLodSource({filename:config.output,mainSource:stackLods(levels),envSource:null,iterations:config.iterations,chunkCount:config.chunkCount,chunkExtent:config.chunkExtent,chunkMin:8},writeFs);
 progress('Streamed SOG conversion complete.');
 }
}catch(error){console.error(error?.stack||String(error));process.exitCode=1;}
finally{for(const source of [...held].reverse())await Promise.resolve(source.close()).catch(()=>{});pool?.destroy();await WorkerQueue.destroy();}
