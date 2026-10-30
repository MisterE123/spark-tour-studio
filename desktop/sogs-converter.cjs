const fs=require('node:fs/promises');
const {createReadStream,createWriteStream}=require('node:fs');
const {pipeline}=require('node:stream/promises');
const {spawn}=require('node:child_process');
const path=require('node:path');
const crypto=require('node:crypto');
const {contained}=require('./server.cjs');
const {sogFiles}=require('./sogs.cjs');
function conversionOptions(value={}){
 const method={quality:'adaptive',quick:'uniform'}[value.method]||value.method||'adaptive',maxSh=value.maxSh??3,levels=value.levels??5,chunkCount=value.chunkCount??128,chunkExtent=value.chunkExtent??8,iterations=value.iterations??10;
 if(!['adaptive','uniform'].includes(method)||!Number.isInteger(maxSh)||maxSh<0||maxSh>3||!Number.isInteger(levels)||levels<2||levels>8||!Number.isFinite(chunkCount)||chunkCount<16||chunkCount>2048||!Number.isFinite(chunkExtent)||chunkExtent<1||chunkExtent>1024||!Number.isInteger(iterations)||iterations<1||iterations>100)throw Error('Invalid SOG conversion settings.');
 return {method,maxSh,levels,chunkCount,chunkExtent,iterations};
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
  const config={...options,source:input,output:path.join(staging,'lod-meta.json'),ratios};await fs.writeFile(path.join(staging,'conversion.json'),JSON.stringify(config));log=await fs.open(path.join(staging,'conversion.log'),'w');
  let tail='',writes=Promise.resolve(),last=0;
  await new Promise((resolve,reject)=>{child=spawn(path.join(tools,'node.exe'),[path.join(tools,'convert.mjs'),path.join(staging,'conversion.json')],{cwd:staging,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});const output=data=>{const text=data.toString();tail=(tail+text).slice(-8192);writes=writes.then(()=>log.write(text));if(Date.now()-last>150){last=Date.now();progress(tail.trim().split(/[\r\n]+/).pop()?.slice(0,400)||'Building streamed SOG…');}};child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',reject);child.once('close',code=>{child=undefined;writes.then(()=>code===0?resolve():reject(Error(`SOG converter exited with code ${code}. ${tail.slice(-1200)}`)),reject);});});
  check();progress('Validating SOG detail levels and textures…');const graph=await sogFiles(config.output,{signal:abort.signal});if(graph.lodLevels<2)throw Error('The converter did not produce multiple detail levels.');
  await log.close();log=undefined;for(const name of await fs.readdir(staging))if(name.endsWith('.ply')||name==='conversion.json')await fs.unlink(path.join(staging,name));
  await fs.mkdir(path.dirname(destination),{recursive:true});check();await fs.rename(staging,destination);progress('Validated, streamable SOG scene ready.');return relative+'/lod-meta.json';
 }catch(error){await log?.close().catch(()=>{});try{await fs.mkdir(path.join(root,'conversion-logs'),{recursive:true});await fs.copyFile(path.join(staging,'conversion.log'),path.join(root,'conversion-logs',id+'.log'));}catch{}if(contained(root,staging)&&path.basename(staging)==='.sogs-conversion-'+id)await fs.rm(staging,{recursive:true,force:true});if(abort.signal.aborted)throw Error('PLY conversion cancelled. Original PLY is unchanged.');throw Error(`SOG conversion failed: ${error.message}. Logs are saved under conversion-logs.`);}})();
 return {promise,cancel};
}
module.exports={convertPlyToSogs,conversionOptions};
