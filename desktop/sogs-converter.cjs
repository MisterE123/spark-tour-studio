const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const {contained}=require('./server.cjs');
const {sogFiles}=require('./sogs.cjs');
function conversionOptions(value={}){
 const method={quality:'adaptive',quick:'uniform'}[value.method]||value.method||'adaptive',compute=value.compute??'auto',maxSh=value.maxSh??3,levels=value.levels??5,chunkCount=value.chunkCount??128,chunkExtent=value.chunkExtent??8,iterations=value.iterations??10;
 if(!['adaptive','uniform'].includes(method)||!['auto','cpu','gpu'].includes(compute)||!Number.isInteger(maxSh)||maxSh<0||maxSh>3||!Number.isInteger(levels)||levels<2||levels>8||!Number.isFinite(chunkCount)||chunkCount<16||chunkCount>2048||!Number.isFinite(chunkExtent)||chunkExtent<1||chunkExtent>1024||!Number.isInteger(iterations)||iterations<1||iterations>100)throw Error('Invalid SOG conversion settings.');
 return {method,compute,maxSh,levels,chunkCount,chunkExtent,iterations};
}
function convertPlyToSogs({source,projectRoot,tools,progress=()=>{},...value}){
 const options=conversionOptions(value);if(path.extname(source).toLowerCase()!=='.ply')throw Error('Choose a Gaussian splat PLY file.');
 const id=crypto.randomUUID(),root=path.resolve(projectRoot),staging=path.join(root,'.sogs-conversion-'+id),relative='assets/sogs/'+id,destination=path.join(root,relative),abort=new AbortController();let child;
 const check=()=>{if(abort.signal.aborted)throw Error('PLY conversion cancelled.');};
 const cancel=()=>{abort.abort();child?.kill();};
 const promise=(async()=>{let log;try{
  await fs.access(path.join(tools,'node.exe'));await fs.access(path.join(tools,'convert.mjs'));await fs.mkdir(staging,{recursive:false});
  const input=path.join(staging,'source.ply');progress('Preparing PLY for SOG conversion…');try{await fs.link(source,input);}catch{check();await pipeline(createReadStream(source),createWriteStream(input,{flags:'wx'}),{signal:abort.signal});}check();
  const ratios=options.levels===5?[.5,.25,.1,.05]:Array.from({length:options.levels-1},(_,i)=>.5**(i+1));
  log=await fs.open(path.join(staging,'conversion.log'),'w');let config,attemptDir,gpuFallbackReason='';
  for(let attempt=0;attempt<2;attempt++){
   check();const compute=attempt?'cpu':options.compute;attemptDir=path.join(staging,'attempt-'+attempt);await fs.mkdir(attemptDir);
   config={...options,compute,requestedCompute:options.compute,gpuFallbackReason,source:input,output:path.join(attemptDir,'lod-meta.json'),ratios};await fs.writeFile(path.join(staging,'conversion.json'),JSON.stringify(config));
   await log.write('\n=== '+(compute==='cpu'?'CPU':compute==='gpu'?'Required WebGPU':'Automatic WebGPU-preferred')+' conversion attempt ===\n');
   let tail='',writes=Promise.resolve(),last=0;
   const exit=await new Promise((resolve,reject)=>{child=spawn(path.join(tools,'node.exe'),[path.join(tools,'convert.mjs'),path.join(staging,'conversion.json')],{cwd:staging,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});const output=data=>{const text=data.toString();tail=(tail+text).slice(-8192);writes=writes.then(()=>log.write(text));if(Date.now()-last>150){last=Date.now();progress(tail.trim().split(/[\r\n]+/).pop()?.slice(0,400)||'Building streamed SOG…');}};child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',reject);child.once('close',(code,signal)=>{child=undefined;writes.then(()=>resolve({code,signal}),reject);});});
   check();if(exit.code===0)break;
   const nativeCrash=Number.isInteger(exit.code)&&(exit.code<0||exit.code>=0x80000000);
   if(attempt===0&&options.compute==='auto'&&(exit.code===42||nativeCrash)){
    gpuFallbackReason=`WebGPU attempt exited with ${exit.signal||exit.code}: ${tail.slice(-1200)}`;await log.write('\nRestarting from the unchanged source on CPU. '+gpuFallbackReason+'\n');progress('WebGPU conversion failed; restarting cleanly from the original PLY on CPU…');await fs.rm(attemptDir,{recursive:true,force:true});continue;
   }
   throw Error(`SOG converter exited with code ${exit.signal||exit.code}. ${tail.slice(-1200)}`);
  }
  check();progress('Validating SOG detail levels and textures…');const graph=await sogFiles(config.output,{signal:abort.signal});if(graph.lodLevels<2)throw Error('The converter did not produce multiple detail levels.');
  let report;try{report=JSON.parse(await fs.readFile(path.join(attemptDir,'conversion-report.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  await log.close();log=undefined;await fs.copyFile(path.join(staging,'conversion.log'),path.join(attemptDir,'conversion.log'));for(const name of await fs.readdir(attemptDir))if(name.endsWith('.ply'))await fs.unlink(path.join(attemptDir,name));
  await fs.mkdir(path.dirname(destination),{recursive:true});check();await fs.rename(attemptDir,destination);await fs.rm(staging,{recursive:true,force:true});const methods=report?.levels?.filter(level=>level.method!=='original').map(level=>level.method)||[],method=[...new Set(methods)].join('/'),backend=report?.effective?.compute;progress('Validated, streamable SOG scene ready'+(backend?' · '+(backend==='webgpu'?'WebGPU':'CPU')+(method?' '+method:''):'')+'.');return relative+'/lod-meta.json';
 }catch(error){await log?.close().catch(()=>{});try{await fs.mkdir(path.join(root,'conversion-logs'),{recursive:true});await fs.copyFile(path.join(staging,'conversion.log'),path.join(root,'conversion-logs',id+'.log'));}catch{}if(contained(root,staging)&&path.basename(staging)==='.sogs-conversion-'+id)await fs.rm(staging,{recursive:true,force:true});if(abort.signal.aborted)throw Error('PLY conversion cancelled. Original PLY is unchanged.');throw Error(`SOG conversion failed: ${error.message}. Logs are saved under conversion-logs.`);}})();
 return {promise,cancel};
}
module.exports={convertPlyToSogs,conversionOptions};
