const fs=require('node:fs/promises');
const path=require('node:path');
const {inflateRawSync}=require('node:zlib');
const {localReference}=require('./asset-paths.cjs');
const {contained,privateStateFile}=require('./server.cjs');
const remote=source=>/^https?:\/\//i.test(source);
const MAX_JSON=16*1024*1024,MAX_FILES=100000;
const integer=(n,min=0)=>Number.isSafeInteger(n)&&n>=min;
const checkAbort=signal=>{if(signal?.aborted)throw Object.assign(Error('SOG import cancelled.'),{name:'AbortError'});};
function kind(source){let name;try{name=(remote(source)?decodeURIComponent(new URL(source).pathname):source).replaceAll('\\','/').split('/').at(-1).toLowerCase();}catch{return;}return name==='lod-meta.json'?'sog-lod':name==='meta.json'||name.endsWith('.sog')?'sog':undefined;}
async function json(source,signal){
 checkAbort(signal);let bytes;
 if(remote(source)){const response=await fetch(source,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok||!response.body)throw Error('SOG metadata request failed: '+response.status);const parts=[];let size=0;try{for await(const part of response.body){size+=part.length;if(size>MAX_JSON)throw Error('SOG metadata exceeds 16 MiB.');parts.push(part);}}finally{if(!response.body.locked)await response.body.cancel().catch(()=>{});}bytes=Buffer.concat(parts);}
 else{const stat=await fs.stat(source);if(!stat.isFile()||stat.size>MAX_JSON)throw Error('SOG metadata exceeds 16 MiB or is not a file.');bytes=await fs.readFile(source);}
 checkAbort(signal);try{return JSON.parse(bytes.toString('utf8'));}catch(error){throw Error('Invalid SOG JSON: '+error.message);}
}
function textureNames(meta){
 const count=meta?.version===2?meta.count:meta?.means?.shape?.[0];
 if(!meta||![undefined,1,2].includes(meta.version)||!integer(count,1)||count>268435456)throw Error('Invalid SOG metadata version or count.');
 if(!['mins','maxs'].every(key=>Array.isArray(meta.means?.[key])&&meta.means[key].length===3&&meta.means[key].every(Number.isFinite))||meta.means.mins.some((value,index)=>value>meta.means.maxs[index]))throw Error('Invalid SOG position bounds.');
 const fields=[['means',2],['scales',1],['quats',1],['sh0',1],...(meta.shN?[['shN',2]]:[])],files=[];
 for(const [field,length] of fields){const names=meta[field]?.files;if(!Array.isArray(names)||names.length!==length||names.some(name=>typeof name!=='string'||!name||!/\.webp$/i.test(localReference(name).path)))throw Error('Invalid SOG '+field+' textures.');files.push(...names);}
 // Older SOG v2 writers omitted bands; Radix infers them from the centroid
 // texture width. Preserve that supported path while validating explicit caps.
 if(meta.shN&&meta.version===2&&meta.shN.bands!==undefined&&(!integer(meta.shN.bands,1)||meta.shN.bands>3))throw Error('Invalid SOG harmonic degree.');
 return {count,files:[...new Set(files)]};
}
function lodReferences(meta){
 if(!meta||![undefined,1].includes(meta.version)||!integer(meta.lodLevels,1)||meta.lodLevels>32||!Array.isArray(meta.filenames)||!meta.filenames.length||meta.filenames.length>MAX_FILES||meta.filenames.some(name=>typeof name!=='string'||!name))throw Error('Invalid Streamed SOG manifest.');
 const stack=[meta.tree],ranges=[];let nodes=0;
 while(stack.length){const node=stack.pop();if(++nodes>200000||!node||!node.bound||!['min','max'].every(key=>Array.isArray(node.bound[key])&&node.bound[key].length===3&&node.bound[key].every(Number.isFinite))||node.bound.min.some((n,i)=>n>node.bound.max[i]))throw Error('Invalid Streamed SOG bounds.');
  if(node.children){if(node.lods||!Array.isArray(node.children)||node.children.length!==2)throw Error('Invalid Streamed SOG tree.');stack.push(...node.children);}
  else{if(!node.lods||typeof node.lods!=='object'||!Object.keys(node.lods).length)throw Error('Invalid Streamed SOG leaf.');for(const [level,range] of Object.entries(node.lods)){if(!/^\d+$/.test(level)||Number(level)>=meta.lodLevels||!integer(range?.file)||range.file>=meta.filenames.length||!integer(range.offset)||!integer(range.count,1)||!Number.isSafeInteger(range.offset+range.count))throw Error('Invalid Streamed SOG leaf range.');ranges.push(range);}}
 }
 if(meta.environment!=null&&(typeof meta.environment!=='string'||!meta.environment))throw Error('Invalid Streamed SOG environment.');
 if(meta.counts!==undefined&&(!Array.isArray(meta.counts)||meta.counts.length!==meta.lodLevels||meta.counts.some(n=>!integer(n))||!meta.counts[0]))throw Error('Invalid Streamed SOG detail counts.');
 return {files:[...new Set([...meta.filenames,...(meta.environment?[meta.environment]:[])])],ranges};
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
 checkAbort(signal);if(!remote(source)){if((await fs.lstat(source)).isSymbolicLink())throw Error('SOG entry files cannot be symbolic links.');source=await fs.realpath(source);}if(!kind(source))throw Error('Choose .sog, meta.json or lod-meta.json.');
 if(/\.sog$/i.test(remote(source)?new URL(source).pathname:source)){
  if(remote(source)){if(verifyRemote){const response=await fetch(source,{method:'HEAD',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok)throw Error('SOG request failed: '+response.status);}return {format:'sog',files:[{path:'',source}],count:undefined};}
  const archive=await archiveMeta(source),parsed=textureNames(archive.meta);for(const name of parsed.files){const entry=archive.names.get(archive.prefix+localReference(name).path);if(!entry||entry.size<12)throw Error('Missing SOG texture: '+name);}return {format:'sog',count:parsed.count,files:[{path:'',source}]};
 }
 const rootMeta=await json(source,signal),isLod=kind(source)==='sog-lod',lod=isLod?lodReferences(rootMeta):undefined,files=new Map([['',{path:'',source}]]),counts=new Map(),destinations=new Map();
 async function add(owner,reference){const item=await companion(source,owner,reference);let relative;
  if(remote(source)){const rootUrl=new URL('.',source),url=new URL(item.source);if(url.origin!==rootUrl.origin||!url.pathname.startsWith(rootUrl.pathname))throw Error('SOG companion escapes its scene URL.');relative=localReference(url.pathname.slice(rootUrl.pathname.length)+url.search+url.hash);}
  else relative=localReference(require('./asset-paths.cjs').assetReference(path.relative(path.dirname(source),item.source).replaceAll('\\','/')));
  const key=process.platform==='win32'?relative.path.toLowerCase():relative.path,request=remote(item.source)?new URL(item.source):null;if(request)request.hash='';const identity=request?.href||item.source,previous=destinations.get(key);if(previous&&previous!==identity)throw Error('SOG companions resolve to the same exported file: '+relative.path);destinations.set(key,identity);
  if(!files.has(relative.path)){if(files.size>=MAX_FILES)throw Error('Too many SOG companion files.');files.set(relative.path,{path:relative.path,source:item.source});if(!remote(item.source)){const stat=await fs.stat(item.source);if(!stat.isFile()||stat.size<1)throw Error('Missing or empty SOG companion: '+reference);}else if(verifyRemote&&!/\.json(?:[?#]|$)/i.test(reference)){const response=await fetch(item.source,{method:'HEAD',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)});if(!response.ok)throw Error('SOG texture request failed: '+response.status);}}
  checkAbort(signal);return item.source;
 }
 async function textures(owner,meta){const parsed=textureNames(meta);counts.set(owner,parsed.count);for(const reference of parsed.files)await add(owner,reference);return parsed.count;}
 if(isLod){for(const name of lod.files){checkAbort(signal);const owner=await add(source,name);await textures(owner,await json(owner,signal));}for(const range of lod.ranges){const owner=remote(source)?new URL(metaName(rootMeta,range),source).href:(await companion(source,source,metaName(rootMeta,range))).source;if(range.offset+range.count>counts.get(owner))throw Error('Streamed SOG range exceeds its chunk.');}}
 else await textures(source,rootMeta);
 return {format:isLod?'sog-lod':'sog',count:isLod?(rootMeta.counts?.[0]||undefined):counts.get(source),lodLevels:isLod?rootMeta.lodLevels:1,files:[...files.values()]};
}
function metaName(meta,range){return meta.filenames[range.file];}
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
module.exports={sogFiles,sogKind:kind,textureNames,lodReferences};
