const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {contained}=require('./server.cjs');
async function plyCount(file){const handle=await fs.open(file,'r');try{const data=Buffer.alloc(1024*1024);const {bytesRead}=await handle.read(data,0,data.length,0);const header=data.subarray(0,bytesRead).toString('latin1').split('end_header')[0];const match=/element vertex (\d+)/.exec(header);if(!match)throw Error('PLY vertex count is missing.');return Number(match[1]);}finally{await handle.close();}}
function generateCollision({source,projectRoot,executable,cli,voxelSize=.15,scale=1,maxGaussians=2000000,progress=()=>{}}){
 if(path.extname(source).toLowerCase()!=='.ply')throw Error('Choose the matching Gaussian splat PLY.');
 if(!Number.isFinite(voxelSize)||voxelSize<.03||voxelSize>1||!Number.isFinite(scale)||scale<=0||scale>10000)throw Error('Invalid collision resolution or scene scale.');
 if(!Number.isInteger(maxGaussians)||maxGaussians<64||maxGaussians>8000000)throw Error('Invalid collision input budget.');
 const id=crypto.randomUUID(),root=path.resolve(projectRoot),relative='assets/collisions/'+id,dir=path.join(root,relative);let child,cancelled=false;
 const check=()=>{if(cancelled)throw Error('Collision generation cancelled.');};
 const promise=(async()=>{let log;try{
  await fs.mkdir(dir,{recursive:true});check();log=await fs.open(path.join(dir,'generation.log'),'w');
  progress('Checking collision input…');let tail='',firstError='',writes=Promise.resolve(),last=0;
  const run=async args=>{check();tail='';firstError='';await new Promise((resolve,reject)=>{
   // Undo splat-transform's automatic PLY axis flip to match Spark's raw PLY coordinates.
   child=spawn(executable,[cli,...args],{windowsHide:true,shell:false,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},stdio:['ignore','pipe','pipe']});
   const output=data=>{const text=data.toString();tail=(tail+text).slice(-6000);writes=writes.then(()=>log.write(text));if(!firstError&&/WebGPU error:|validation:|out of memory/i.test(tail)){firstError=tail.slice(Math.max(0,tail.search(/WebGPU error:|validation:|out of memory/i)),undefined).slice(0,1600);child?.kill();}if(Date.now()-last>200){last=Date.now();progress(tail.trim().split(/[\r\n]+/).pop()?.slice(0,350)||'Generating collision mesh…');}};
   child.stdout.on('data',output);child.stderr.on('data',output);child.once('error',reject);child.once('close',code=>{child=undefined;writes.then(()=>code===0&&!firstError?resolve():reject(Error(firstError||'splat-transform exited with code '+code+'. '+tail.slice(-1000))),reject);});
  });check();};
  const count=await plyCount(source);await log.write(`Input: ${count} splats; collision budget: ${maxGaussians}; original preserved.\n`);let input=source;
  if(count>maxGaussians){progress(`Preparing collision-only detail (${count.toLocaleString()} → ${maxGaussians.toLocaleString()} splats)…`);input=path.join(dir,'collision-input.ply');await run([source,'--filter-harmonics','0','--filter-nan','--decimate',String(maxGaussians),'--scratch-dir',path.join(dir,'scratch'),input]);if(await plyCount(input)>maxGaussians)throw Error('Collision preparation exceeded the selected input budget.');}
  progress('Generating collision surface…');await run([input,'--filter-harmonics','0','--filter-nan','--rotate','0,0,180',path.join(dir,'scene.voxel.json'),'--voxel-size',String(voxelSize/scale),'--voxel-opacity','0.1','--collision-mesh','smooth']);
  const file=await fs.open(path.join(dir,'scene.collision.glb'),'r');try{const header=Buffer.alloc(20);await file.read(header,0,20,0);const size=(await file.stat()).size;if(header.readUInt32LE(0)!==0x46546c67||header.readUInt32LE(4)!==2||header.readUInt32LE(8)!==size||header.readUInt32LE(12)>16*1024*1024)throw Error('Generated collider is invalid.');const json=Buffer.alloc(header.readUInt32LE(12));await file.read(json,0,json.length,20);const gltf=JSON.parse(json.toString());if(!gltf.meshes?.some(m=>m.primitives?.some(p=>gltf.accessors?.[p.attributes?.POSITION]?.count>0)))throw Error('No collision surface was generated. Try a finer resolution.');}finally{await file.close();}
  await log.close();log=undefined;if(input!==source)await fs.unlink(input);const scratch=path.join(dir,'scratch');if(contained(root,scratch))await fs.rm(scratch,{recursive:true,force:true});progress('Collision mesh ready. Check its wireframe alignment and walking start.');return relative+'/scene.collision.glb';
 }catch(e){await log?.close().catch(()=>{});try{await fs.mkdir(path.join(root,'collision-logs'),{recursive:true});await fs.copyFile(path.join(dir,'generation.log'),path.join(root,'collision-logs',id+'.log'));}catch{}if(contained(root,dir)&&path.basename(dir)===id)await fs.rm(dir,{recursive:true,force:true});throw Error(cancelled?'Collision generation cancelled.':e.message+' See collision-logs for details.');}})();
 return {promise,cancel(){cancelled=true;child?.kill();}};
}
module.exports={generateCollision,plyCount};
