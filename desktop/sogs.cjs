const fs=require('node:fs/promises');
const path=require('node:path');
const {inflateRawSync}=require('node:zlib');
const {localReference}=require('./asset-paths.cjs');
const {contained,privateStateFile}=require('./server.cjs');
const {inspectSogMeta,inspectSogLod}=require('../shared/sog-metadata.mjs');
const {sogEntryType,splatEntryName}=require('../shared/splat-format.mjs');
const remote=source=>/^https?:\/\//i.test(source);
const MAX_JSON=16*1024*1024,MAX_FILES=100000;
const checkAbort=signal=>{if(signal?.aborted)throw Object.assign(Error('SOG import cancelled.'),{name:'AbortError'});};
const entryType=source=>sogEntryType(remote(source)?splatEntryName(source):path.basename(source).toLowerCase());
function kind(source){const entry=entryType(source);return entry==='lod'?'sog-lod':entry?'sog':undefined;}
function portableSogName(reference){const entry=sogEntryType(splatEntryName(reference));return {lod:'lod-meta.json',meta:'meta.json',archive:'asset.sog'}[entry];}
async function json(source,signal){
 checkAbort(signal);let bytes;
 if(remote(source)){const response=await fetch(source,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok||!response.body)throw Error('SOG metadata request failed: '+response.status);const parts=[];let size=0;try{for await(const part of response.body){size+=part.length;if(size>MAX_JSON)throw Error('SOG metadata exceeds 16 MiB.');parts.push(part);}}finally{if(!response.body.locked)await response.body.cancel().catch(()=>{});}bytes=Buffer.concat(parts);}
 else{const stat=await fs.stat(source);if(!stat.isFile()||stat.size>MAX_JSON)throw Error('SOG metadata exceeds 16 MiB or is not a file.');bytes=await fs.readFile(source);}
 checkAbort(signal);try{return JSON.parse(bytes.toString('utf8'));}catch(error){throw Error('Invalid SOG JSON: '+error.message);}
}
function textureNames(meta){
 const {count,files}=inspectSogMeta(meta);
 for(const name of files)if(!/\.webp$/i.test(localReference(name).path))throw Error('Invalid SOG texture: '+name);
 return {count,files};
}
async function companion(root,owner,reference){
 const parsed=localReference(reference);if(privateStateFile(parsed.path))throw Error('SOG references private editor files.');
 if(remote(owner))return {...parsed,source:new URL(parsed.reference,owner).href};
 const file=path.resolve(path.dirname(owner),parsed.path),sceneRoot=await fs.realpath(path.dirname(root));if(!contained(path.dirname(root),file))throw Error('SOG companion escapes its scene folder.');
 // A nested alias can change the URL-relative location of a chunk's textures.
 // Reject those aliases instead of exporting a graph with different paths.
 for(let current=file;current!==sceneRoot&&contained(sceneRoot,current);current=path.dirname(current))if((await fs.lstat(current)).isSymbolicLink())throw Error('SOG companions cannot be symbolic links.');
 const real=await fs.realpath(file);if(!contained(sceneRoot,real)||privateStateFile(real))throw Error('SOG companion escapes its scene folder or references private files.');return {...parsed,source:real};
}
// Validate without decoding WebP or buffering the large splat files. The returned
// graph is the single source of truth for imports, history and folder export.
async function sogFiles(source,{signal,verifyRemote=false}={}){
 checkAbort(signal);if(!remote(source)){if((await fs.lstat(source)).isSymbolicLink())throw Error('SOG entry files cannot be symbolic links.');source=await fs.realpath(source);}const entry=entryType(source);if(!entry)throw Error('Choose .sog, meta.json or lod-meta.json.');
 if(entry==='archive'){
  if(remote(source)){if(verifyRemote){const response=await fetch(source,{method:'HEAD',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok)throw Error('SOG request failed: '+response.status);}return {format:'sog',files:[{path:'',source}],count:undefined};}
  const archive=await archiveMeta(source),parsed=textureNames(archive.meta);for(const name of parsed.files){const entry=archive.names.get(archive.prefix+localReference(name).path);if(!entry||entry.size<12)throw Error('Missing SOG texture: '+name);}return {format:'sog',count:parsed.count,files:[{path:'',source}]};
 }
 const rootMeta=await json(source,signal),isLod=entry==='lod',lod=isLod?inspectSogLod(rootMeta):undefined,files=new Map([['',{path:'',source}]]),counts=new Map(),destinations=new Map();
 async function add(owner,reference){const item=await companion(source,owner,reference);let relative;
  if(remote(source)){const rootUrl=new URL('.',source),url=new URL(item.source);if(url.origin!==rootUrl.origin||!url.pathname.startsWith(rootUrl.pathname))throw Error('SOG companion escapes its scene URL.');relative=localReference(url.pathname.slice(rootUrl.pathname.length)+url.search+url.hash);}
  else relative=localReference(require('./asset-paths.cjs').assetReference(path.relative(path.dirname(source),item.source).replaceAll('\\','/')));
  const key=process.platform==='win32'?relative.path.toLowerCase():relative.path,request=remote(item.source)?new URL(item.source):null;if(request)request.hash='';const identity=request?.href||item.source,previous=destinations.get(key);if(previous&&previous!==identity)throw Error('SOG companions resolve to the same exported file: '+relative.path);destinations.set(key,identity);
  if(!files.has(relative.path)){if(files.size>=MAX_FILES)throw Error('Too many SOG companion files.');files.set(relative.path,{path:relative.path,source:item.source});if(!remote(item.source)){const stat=await fs.stat(item.source);if(!stat.isFile()||stat.size<1)throw Error('Missing or empty SOG companion: '+reference);}else if(verifyRemote&&!/\.json(?:[?#]|$)/i.test(reference)){const response=await fetch(item.source,{method:'HEAD',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok)throw Error('SOG texture request failed: '+response.status);}}
  checkAbort(signal);return item.source;
 }
 async function textures(owner,meta){const parsed=textureNames(meta);counts.set(owner,parsed.count);for(const reference of parsed.files)await add(owner,reference);return parsed.count;}
 if(isLod){
  const chunkCount=async name=>{checkAbort(signal);const owner=await add(source,name);return counts.get(owner)??await textures(owner,await json(owner,signal));};
  for(const [index,name] of rootMeta.filenames.entries())if(await chunkCount(name)<lod.required[index])throw Error('Streamed SOG range exceeds its chunk.');
  if(rootMeta.environment)await chunkCount(rootMeta.environment);
 }
 else await textures(source,rootMeta);
 return {format:isLod?'sog-lod':'sog',count:isLod?(rootMeta.counts?.[0]||undefined):counts.get(source),lodLevels:isLod?rootMeta.lodLevels:1,files:[...files.values()]};
}
async function archiveMeta(source){
 const handle=await fs.open(source,'r');
 try{
  const stat=await handle.stat(),tail=Buffer.alloc(Math.min(stat.size,65557));
  await handle.read(tail,0,tail.length,stat.size-tail.length);
  let end=-1;
  for(let i=tail.length-22;i>=0;i--){
   if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){end=i;break;}
  }
  if(end<0||tail.readUInt16LE(end+4)||tail.readUInt16LE(end+6))throw Error('Invalid SOG archive.');
  const entries=tail.readUInt16LE(end+10),length=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16);
  if(!entries||entries>8192||length>8*1024*1024||offset+length>stat.size)throw Error('Unsupported SOG archive directory.');
  const directory=Buffer.alloc(length);
  if((await handle.read(directory,0,length,offset)).bytesRead!==length)throw Error('Truncated SOG archive.');
  const names=new Map();let pos=0;
  for(let n=0;n<entries;n++){
   if(pos+46>length||directory.readUInt32LE(pos)!==0x02014b50)throw Error('Invalid SOG archive directory.');
   const nameLength=directory.readUInt16LE(pos+28),extra=directory.readUInt16LE(pos+30),comment=directory.readUInt16LE(pos+32);
   if(pos+46+nameLength+extra+comment>length)throw Error('Truncated SOG archive directory.');
   const name=directory.toString('utf8',pos+46,pos+46+nameLength);
   if(directory.readUInt16LE(pos+8)&1)throw Error('Encrypted SOG archives are unsupported.');
   if(!name.endsWith('/')){
    // ZIP entry names are literal filenames, while meta.json uses asset URLs.
    // Encoding before validation preserves literal # and % in archive names.
    require('./asset-paths.cjs').assetReference(name);
    if(privateStateFile(name)||names.has(name))throw Error('Unsafe or duplicate SOG archive entry.');
    const entry={method:directory.readUInt16LE(pos+10),compressed:directory.readUInt32LE(pos+20),size:directory.readUInt32LE(pos+24),offset:directory.readUInt32LE(pos+42)};
    if(![0,8].includes(entry.method)||entry.offset+30+entry.compressed>offset)throw Error('Unsupported or truncated SOG archive entry.');
    names.set(name,entry);
   }
   pos+=46+nameLength+extra+comment;
  }
  const name=[...names.keys()].filter(name=>name.split('/').at(-1)==='meta.json').sort((a,b)=>a.length-b.length)[0],entry=names.get(name);
  if(!entry||entry.size>MAX_JSON||entry.compressed>MAX_JSON)throw Error('SOG archive has no bounded meta.json.');
  const header=Buffer.alloc(30);
  if((await handle.read(header,0,30,entry.offset)).bytesRead!==30||header.readUInt32LE(0)!==0x04034b50)throw Error('Invalid SOG archive entry.');
  const data=Buffer.alloc(entry.compressed),start=entry.offset+30+header.readUInt16LE(26)+header.readUInt16LE(28);
  if(start+data.length>offset||(await handle.read(data,0,data.length,start)).bytesRead!==data.length)throw Error('Truncated SOG metadata.');
  const decoded=entry.method===0?data:inflateRawSync(data,{maxOutputLength:MAX_JSON});
  if(decoded.length!==entry.size)throw Error('Incomplete SOG metadata.');
  return {meta:JSON.parse(decoded.toString('utf8')),prefix:name.slice(0,-9),names};
 }finally{await handle.close();}
}
module.exports={sogFiles,sogKind:kind,textureNames,portableSogName};
