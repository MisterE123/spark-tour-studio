const fs=require('node:fs/promises'),path=require('node:path');
const {contained,privateStateFile}=require('./server.cjs');
const {sourcePath,radMeta}=require('./export.cjs');
const remote=ref=>/^https?:\/\//i.test(ref);
const ignored=name=>privateStateFile(name)||name.split(/[\\/]/).some(part=>part.startsWith('.')||['node_modules','collision-logs','conversion-logs'].includes(part))||/\.(exe|zip|ply|ckpt|safetensors|log|pem|key|pfx|p12)$/i.test(name);
function assetPath(root,name){if(!name||name.includes('\0')||name.includes('\\')||name.split('/').some(p=>p==='..'||p==='.git'))throw Error('Invalid tour asset path.');const target=path.resolve(root,name);if(!contained(root,target)||ignored(name))throw Error('Asset cannot be included in tour history: '+name);return target;}
async function safeParents(root,file){let current=file;while(contained(root,current)&&current!==root){try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Symbolic links cannot be used for versioned tour files.');}catch(error){if(error.code!=='ENOENT')throw error;}current=path.dirname(current);}}
async function collectTourFiles({projectRoot,project,hosting={},sources={},resolveHosting=false,omitSplats=false}){
 const {allReferences,splatReference}=await import('../shared/project.mjs');const root=path.resolve(projectRoot),files=new Map(),missing=[],remoteRefs=new Set(),prefixes=new Set();
 const radRefs=new Set(project.scenes.flatMap(s=>[resolveHosting?splatReference(hosting.sceneUrls?.[s.id]||s.source,hosting,!!hosting.sceneUrls?.[s.id]):s.source,s.background?.type==='splat'?(resolveHosting?splatReference(s.background.source,hosting):s.background.source):'']).filter(Boolean));
 const htmlRefs=new Set(project.pages.map(p=>p.html).filter(Boolean));
 const put=async(name,source)=>{assetPath(root,name);await safeParents(root,path.resolve(root,name));const stat=await fs.stat(source);if(!stat.isFile())throw Error('Asset is not a file: '+name);files.set(name,{path:name,source,bytes:stat.size});};
 const walk=async(dir,target)=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const name=path.posix.join(target,entry.name);if(ignored(name))continue;const from=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('Custom content contains a symbolic link: '+name);if(entry.isDirectory())await walk(from,name);else if(entry.isFile())await put(name,from);}};
 for(const ref of new Set(allReferences(project,resolveHosting?hosting:{}))){
  if(remote(ref)){remoteRefs.add(ref);continue;}if(omitSplats&&radRefs.has(ref))continue;
  const name=decodeURIComponent(new URL(ref,'https://tour.local/').pathname.slice(1));
  try{
   const source=sourcePath(ref,root,sources);await put(name,source);
   for(const prefix of Object.keys(sources))if(name.startsWith(prefix+'/'))prefixes.add(prefix);
   if(htmlRefs.has(ref))await walk(path.dirname(source),path.posix.dirname(name));
   if(radRefs.has(ref)){const meta=await radMeta(source);for(const chunk of meta.chunks){if(!chunk.filename)continue;if(remote(chunk.filename)||chunk.filename.includes('\\')||chunk.filename.startsWith('/'))throw Error('Invalid RAD companion path.');const from=path.resolve(path.dirname(source),chunk.filename);if(!contained(path.dirname(source),from))throw Error('RAD companion escapes its scene folder.');const to=path.posix.normalize(path.posix.join(path.posix.dirname(name),chunk.filename));await put(to,from);}}
  }catch(error){missing.push(name+': '+error.message);}
 }
 return {files:[...files.values()],missing,remoteCount:remoteRefs.size,prefixes:[...prefixes]};
}
async function viewerBytes(dist){
 const entries=new Set(['index.html']),manifest=JSON.parse(await fs.readFile(path.join(dist,'.vite/manifest.json'),'utf8')),visited=new Set();
 const visit=key=>{if(visited.has(key))return;visited.add(key);const entry=manifest[key];if(!entry)throw Error('Missing viewer build entry.');for(const file of [entry.file,...entry.css||[],...entry.assets||[]])entries.add(file);for(const dependency of [...entry.imports||[],...entry.dynamicImports||[]])visit(dependency);};visit('index.html');
 let total=0;for(const name of entries)total+=(await fs.stat(path.join(dist,name))).size;
 const walk=async dir=>{for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(entry.isFile())total+=(await fs.stat(file)).size;}};for(const folder of ['licenses','performance-spec'])try{await walk(path.join(dist,folder));}catch(error){if(error.code!=='ENOENT')throw error;}return total;
}
async function estimateWebsite(options){const {renderPage}=await import('../shared/project.mjs'),{usedContent}=await import('../shared/authoring.mjs');const inventory=await collectTourFiles({...options,resolveHosting:true}),pages=usedContent(options.project);const configBytes=Buffer.byteLength(JSON.stringify({...options.project,pages}))+Buffer.byteLength(JSON.stringify(options.hosting||{}))+pages.filter(p=>!p.html).reduce((sum,p)=>sum+Buffer.byteLength(renderPage(p)),0);const runtimeBytes=options.dist?await viewerBytes(options.dist):0;const bytes=inventory.files.reduce((sum,f)=>sum+f.bytes,configBytes+runtimeBytes);return {bytes,limit:1000000000,overPagesLimit:bytes>1000000000,files:inventory.files.length,remoteCount:inventory.remoteCount,missing:inventory.missing,oversizedFiles:inventory.files.filter(f=>f.bytes>104857600).map(({path,bytes})=>({path,bytes}))};}
module.exports={collectTourFiles,estimateWebsite,assetPath,safeParents,ignored};
