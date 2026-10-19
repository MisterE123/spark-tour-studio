const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {contained}=require('./server.cjs');
const DIRECTORY='.spark-tour-diagnostics',MAX_BYTES=256*1024,MAX_EVENTS=512,MAX_LOGS=20;
const owned=/^collision-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-f0-9-]{36}\.jsonl$/;
const active=new Set();
function clean(value,max=6000){if(typeof value!=='string'||value.length>65536)throw Error('Invalid collision diagnostic text.');return value.replace(/https?:\/\/[^\s<>"']+/gi,source=>{try{const url=new URL(source);url.username='';url.password='';url.search='';url.hash='';return url.href;}catch{return '[URL]';}}).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').slice(0,max);}
function reference(value){const text=clean(value,2048);if(/^https?:/i.test(text)){const url=new URL(text);url.username='';url.password='';url.search='';url.hash='';return url.href;}return text.split(/[?#]/,1)[0];}
function number(value){return typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e12;}
function summary(value){
 if(!value||typeof value!=='object'||!['paged','glb'].includes(value.format)||!['selected','entire'].includes(value.scope)||!number(value.volumeCount)||typeof value.hasBounds!=='boolean'||typeof value.sceneId!=='string'||value.sceneId.length>128)throw Error('Invalid collision diagnostic summary.');
 const options={},input=value.options||{};
 for(const key of ['detail','pageSize','smoothing','wallHeight','opacityCutoff'])if(input[key]!==undefined){if(!number(input[key]))throw Error('Invalid collision diagnostic option.');options[key]=input[key];}
 for(const key of ['extrudeUp','ignoreTransparent'])if(input[key]!==undefined){if(typeof input[key]!=='boolean')throw Error('Invalid collision diagnostic option.');options[key]=input[key];}
 if(input.surface!==undefined){if(!['smooth','blocky'].includes(input.surface))throw Error('Invalid collision diagnostic surface.');options.surface=input.surface;}
 return {sceneId:clean(value.sceneId,128),source:reference(value.source||''),format:value.format,scope:value.scope,volumeCount:value.volumeCount,hasBounds:value.hasBounds,options};
}
function entry(value){
 if(!value||typeof value!=='object'||!['phase','success','cancelled','error'].includes(value.type))throw Error('Invalid collision diagnostic event.');const out={type:value.type};
 if(value.phase!==undefined)out.phase=clean(value.phase,256);
 if(value.message!==undefined)out.message=clean(value.message);
 if(value.ref!==undefined)out.ref=reference(value.ref);
 for(const key of ['completed','total'])if(value[key]!==undefined){if(!number(value[key]))throw Error('Invalid collision diagnostic progress.');out[key]=value[key];}
 if(value.stats!==undefined){out.stats={};for(const key of ['selected','voxels','triangles'])if(value.stats[key]!==undefined){if(!number(value.stats[key]))throw Error('Invalid collision diagnostic statistic.');out.stats[key]=value.stats[key];}}
 return out;
}
async function prune(folder){const files=[];for(const name of await fs.readdir(folder)){if(!owned.test(name))continue;const file=path.join(folder,name),stat=await fs.lstat(file);if(stat.isFile()&&!active.has(file))files.push({file,time:stat.mtimeMs});}files.sort((a,b)=>b.time-a.time);for(const item of files.slice(MAX_LOGS)){if(!contained(folder,item.file)||!contained(folder,await fs.realpath(item.file)))throw Error('Diagnostic cleanup leaves its folder.');await fs.unlink(item.file);}}
class CollisionDiagnostics {
 static async create(root,input,version=''){
  if(active.size>=16)throw Error('Too many collision diagnostic jobs are active.');
  const data=summary(input),realRoot=await fs.realpath(root),folder=path.join(realRoot,DIRECTORY);try{await fs.mkdir(folder);}catch(error){if(error.code!=='EEXIST')throw error;}
  if(!(await fs.lstat(folder)).isDirectory()||!contained(realRoot,await fs.realpath(folder)))throw Error('Collision diagnostics folder leaves the project.');
  const log=new CollisionDiagnostics(),id=crypto.randomUUID(),filename='collision-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+id+'.jsonl';log.id=id;log.root=realRoot;log.folder=folder;log.file=path.join(folder,filename);log.relativePath=DIRECTORY+'/'+filename;log.bytes=0;log.events=0;log.closed=false;log.lastPhase=-Infinity;log.queue=Promise.resolve();
  const line=JSON.stringify({time:new Date().toISOString(),type:'start',version:clean(version,80),...data})+'\n';await fs.writeFile(log.file,line,{flag:'wx'});log.bytes=Buffer.byteLength(line);log.events=1;active.add(log.file);await prune(folder);return log;
 }
 append(value){const data=entry(value);const operation=this.queue.catch(()=>{}).then(async()=>{
  if(this.closed)return false;const terminal=data.type!=='phase',now=Date.now();if(!terminal&&(now-this.lastPhase<1000||this.events>=MAX_EVENTS-1||this.bytes>MAX_BYTES-40*1024))return false;
  const line=JSON.stringify({time:new Date().toISOString(),...data})+'\n',bytes=Buffer.byteLength(line);if(this.bytes+bytes>MAX_BYTES)throw Error('Collision diagnostic log reached its size limit.');
  if(!(await fs.lstat(this.file)).isFile()||!contained(this.root,await fs.realpath(this.folder))||!contained(this.folder,await fs.realpath(this.file)))throw Error('Collision diagnostic log leaves the project.');
  await fs.appendFile(this.file,line);this.bytes+=bytes;this.events++;if(terminal){this.closed=true;active.delete(this.file);await prune(this.folder);}else this.lastPhase=now;return true;
 });this.queue=operation;return operation;}
}
module.exports={CollisionDiagnostics,DIRECTORY,MAX_BYTES,MAX_EVENTS,MAX_LOGS};
