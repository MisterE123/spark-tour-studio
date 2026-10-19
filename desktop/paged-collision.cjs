const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {contained}=require('./server.cjs');
const remote=ref=>/^https?:\/\//i.test(ref);
const MAX_MANIFEST=32*1024*1024,MAX_BATCH=262144,MAX_TILE=16*1024*1024;
const api=()=>import('../shared/paged-collision.mjs');
function keyParts(key){if(typeof key!=='string'||!/^(-?\d+),(-?\d+),(-?\d+)$/.test(key))throw Error('Invalid collision tile key.');const coord=key.split(',').map(Number);if(coord.some(n=>!Number.isSafeInteger(n)||Math.abs(n)>100000000)||coord.join(',')!==key)throw Error('Invalid collision tile key.');return coord;}
function relativeAsset(value){if(typeof value!=='string'||!value||value.length>1024||value.includes('\\')||value.includes('\0')||/[?#:]/.test(value)||value.startsWith('/'))throw Error('Invalid collision companion path.');let decoded;try{decoded=decodeURIComponent(value);}catch{throw Error('Invalid collision companion encoding.');}if(decoded!==value||decoded.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.')))throw Error('Collision companion path leaves its folder.');return value;}
async function safeFolder(root,folder){const realRoot=await fs.realpath(root);await fs.mkdir(folder,{recursive:true});const realFolder=await fs.realpath(folder);if(!contained(realRoot,realFolder))throw Error('Collision output folder leaves the project.');return realFolder;}
function entries(manifest){return [...manifest.tiles,...manifest.navigation?.tiles||[]];}
async function readManifest(source){let text;if(remote(source)){const response=await fetch(source,{signal:AbortSignal.timeout(60000)});if(!response.ok||!response.body)throw Error('Collision manifest request failed: '+response.status);const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.byteLength;if(size>MAX_MANIFEST)throw Error('Collision manifest is too large.');chunks.push(chunk);}text=Buffer.concat(chunks).toString('utf8');}else{if((await fs.stat(source)).size>MAX_MANIFEST)throw Error('Collision manifest is too large.');text=await fs.readFile(source,'utf8');}let manifest;try{manifest=JSON.parse(text);}catch{throw Error('Malformed collision manifest.');}(await api()).validatePagedCollisionManifest(manifest);for(const entry of entries(manifest))relativeAsset(entry.url);return manifest;}
async function validateBytes(bytes,entry,tileCells){if(typeof entry.sha256!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256)||crypto.createHash('sha256').update(bytes).digest('hex')!==entry.sha256)throw Error('Collision companion checksum mismatch: '+entry.url);if(entry.voxels!==undefined){const tile=(await api()).decodeCollisionTile(bytes,{coord:entry.coord,tileCells,expand:false});if(tile.voxels!==entry.voxels)throw Error('Collision companion occupancy mismatch: '+entry.url);return tile;}else (await import('../shared/paged-navigation.mjs')).validateNavigationData(new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),entry.key);}
async function verifyFile(file,entry,tileCells){const stat=await fs.stat(file);if(!stat.isFile()||stat.size!==entry.bytes||stat.size>32*1024*1024)throw Error('Collision companion size mismatch: '+entry.url);return validateBytes(await fs.readFile(file),entry,tileCells);}
async function verifyRemoteFile(url,entry,tileCells){const response=await fetch(url,{signal:AbortSignal.timeout(600000)});if(!response.ok||!response.body)throw Error('Collision companion request failed: '+response.status);let bytes=0;const chunks=[];for await(const chunk of response.body){bytes+=chunk.byteLength;if(bytes>entry.bytes||bytes>32*1024*1024)throw Error('Collision companion size mismatch: '+entry.url);chunks.push(chunk);}if(bytes!==entry.bytes)throw Error('Collision companion checksum mismatch: '+entry.url);await validateBytes(Buffer.concat(chunks),entry,tileCells);}
async function validateLocalManifest(source){const manifest=await readManifest(source),folder=await fs.realpath(path.dirname(source));for(const entry of entries(manifest)){const file=path.resolve(folder,relativeAsset(entry.url)),real=await fs.realpath(file);if(!contained(folder,real))throw Error('Collision companion leaves its folder.');await verifyFile(real,entry,manifest.tileCells);}return manifest;}
class PagedCollisionWriter {
 static async create(projectRoot){const writer=new PagedCollisionWriter();writer.root=await fs.realpath(projectRoot);writer.id=crypto.randomUUID();const parent=await safeFolder(writer.root,path.join(writer.root,'colliders'));writer.stage=path.join(parent,'.'+writer.id+'.staging');writer.target=path.join(parent,writer.id);await fs.mkdir(writer.stage);await fs.mkdir(path.join(writer.stage,'.spool'));writer.tiles=new Map();writer.pending=new Set();writer.closed=false;writer.cancelled=false;writer.committed=false;writer.renamed=false;writer.finalizing=false;return writer;}
 assertOpen(){if(this.closed)throw Error(this.cancelled?'Collision generation cancelled; this session has finished.':'Collision generation has already finished.');}
 operation(fn,finalize=false){
  let prior;try{this.assertOpen();if(this.finalizing)throw Error('Collision generation is already finalizing.');if(finalize){this.finalizing=true;prior=[...this.pending];}}catch(error){return Promise.reject(error);}
  const operation=(async()=>{if(prior){const outcomes=await Promise.allSettled(prior);this.assertOpen();const failed=outcomes.find(result=>result.status==='rejected');if(failed)throw failed.reason;}return fn();})();
  this.pending.add(operation);const settled=()=>{this.pending.delete(operation);if(finalize)this.finalizing=false;};operation.then(settled,settled);return operation;
 }
 bucket(key){keyParts(key);return path.join(this.stage,'.spool',key.replaceAll(',','_')+'.raw');}
 append(key,cells){return this.operation(async()=>{this.assertOpen();if(!(cells instanceof Uint32Array)||!cells.length||cells.length>MAX_BATCH)throw Error('Invalid collision point batch.');const bytes=Buffer.from(cells.buffer,cells.byteOffset,cells.byteLength);await fs.appendFile(this.bucket(key),bytes);});}
 keys(){return this.operation(async()=>{this.assertOpen();return (await fs.readdir(path.join(this.stage,'.spool'))).filter(n=>n.endsWith('.raw')).map(n=>n.slice(0,-4).replaceAll('_',','));});}
 read(key,offset=0,maxCells=262144){return this.operation(async()=>{this.assertOpen();if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(maxCells)||maxCells<1||maxCells>MAX_BATCH)throw Error('Invalid collision read range.');const file=await fs.open(this.bucket(key),'r');try{const size=(await file.stat()).size;if(size%4)throw Error('Incomplete collision point batch.');const data=Buffer.alloc(Math.min(maxCells*4,Math.max(0,size-offset*4))),{bytesRead}=await file.read(data,0,data.length,offset*4),cells=new Uint32Array(bytesRead/4);Buffer.from(cells.buffer).set(data.subarray(0,bytesRead));return {cells,done:offset*4+bytesRead>=size};}finally{await file.close();}});}
 writeTile(entry,bytes){return this.operation(async()=>{this.assertOpen();const coord=keyParts(entry?.key),url='tiles/'+coord.join('_')+'.scv';if(entry.url!==url||JSON.stringify(entry.coord)!==JSON.stringify(coord)||!(bytes instanceof Uint8Array)||!bytes.length||bytes.byteLength>MAX_TILE||entry.bytes!==bytes.byteLength)throw Error('Invalid collision tile output.');if(this.tiles.has(entry.key))throw Error('Duplicate collision tile output.');const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength),hash=crypto.createHash('sha256').update(data).digest('hex');if(entry.sha256!==hash)throw Error('Collision tile checksum mismatch.');const tile=(await api()).decodeCollisionTile(bytes,{coord,expand:false});if(tile.voxels!==entry.voxels)throw Error('Collision tile occupancy mismatch.');const target=path.join(this.stage,url);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,data,{flag:'wx'});this.tiles.set(entry.key,structuredClone(entry));});}
 stopNavigation(){if(this.navStop)return this.navStop;const worker=this.navWorker;if(!worker)return Promise.resolve();const stopped=this.navStop=Promise.resolve(worker.terminate());stopped.then(()=>{if(this.navWorker===worker)this.navWorker=undefined;},()=>{});return stopped;}
 async navigation(manifest,progress=()=>{}){this.assertOpen();const {Worker}=require('node:worker_threads');return new Promise((resolve,reject)=>{const worker=new Worker(require.resolve('./paged-collision-navigation.cjs'),{workerData:{root:this.stage,manifest}});this.navWorker=worker;this.navStop=undefined;let settled=false;const finish=(error,value)=>{if(settled)return;settled=true;this.stopNavigation().then(()=>error?reject(error):resolve(value),reject);};worker.on('message',message=>{if(message.type==='progress')progress(message);else if(message.type==='complete')finish(null,message.navigation);else if(message.type==='error')finish(Error(message.message||'Navigation preparation failed.'));});worker.on('error',error=>finish(error));worker.on('exit',code=>{if(!settled)finish(Error(this.closed?'Collision generation cancelled.':'Navigation preparation stopped: '+code));});});}
 finalize(manifest,options={}){return this.operation(()=>this.finalizeOutput(manifest,options),true);}
 async finalizeOutput(manifest,{prepareNavigation,progress}={}){
  this.assertOpen();const codec=await api();codec.validatePagedCollisionManifest(manifest);
  // A summary certifies full-resolution, wholly navigable air. Derive it only
  // from verified output bytes; a caller may never supply its own certificate.
  if(manifest.airNodes?.length)throw Error('Collision air summaries must be derived from verified generated tiles.');
  if(manifest.tiles.length!==this.tiles.size)throw Error('Collision output is incomplete.');
  const stage=await fs.realpath(this.stage),full=[],mixed=[],retired=[];
  const stagedFile=async entry=>{const file=path.resolve(stage,relativeAsset(entry.url)),real=await fs.realpath(file);if(!contained(stage,file)||!contained(stage,real)||!(await fs.lstat(file)).isFile())throw Error('Collision output leaves its staging folder.');return file;};
  for(const entry of manifest.tiles){
   this.assertOpen();if(JSON.stringify(entry)!==JSON.stringify(this.tiles.get(entry.key)))throw Error('Collision manifest does not match generated tiles.');
   const file=await stagedFile(entry),tile=await verifyFile(file,entry,manifest.tileCells);
   if(tile.full){full.push(entry.coord);retired.push(file);}else mixed.push(entry);
  }
  this.assertOpen();
  if(full.length)manifest={...manifest,tiles:mixed,airNodes:codec.compactCollisionAirNodes(full)};
  codec.validatePagedCollisionManifest(manifest);const certified=JSON.stringify({...manifest,navigation:undefined});
  if(prepareNavigation)manifest=await prepareNavigation(this.stage,manifest);else manifest={...manifest,navigation:await this.navigation(manifest,progress)};
  this.assertOpen();codec.validatePagedCollisionManifest(manifest);if(JSON.stringify({...manifest,navigation:undefined})!==certified)throw Error('Walking preparation changed verified collision data.');
  for(const entry of entries(manifest)){this.assertOpen();await verifyFile(await stagedFile(entry),entry,manifest.tileCells);}
  // Keep verified originals until navigation and companion validation succeed.
  // Delete exact contained files only, never a computed recursive tile folder.
  for(const file of retired){this.assertOpen();if(!contained(stage,file)||!contained(stage,await fs.realpath(file)))throw Error('Collision output leaves its staging folder.');await fs.unlink(file);}
  await fs.rm(path.join(this.stage,'.spool'),{recursive:true,force:true});this.assertOpen();
  const text=JSON.stringify(manifest);if(Buffer.byteLength(text)>MAX_MANIFEST)throw Error('Collision manifest is too large.');await fs.writeFile(path.join(this.stage,'scene.collision.json'),text,{flag:'wx'});this.assertOpen();await fs.rename(this.stage,this.target);this.renamed=true;this.assertOpen();this.committed=true;this.closed=true;return 'colliders/'+this.id+'/scene.collision.json';
 }
 abort(){
  if(this.abortPromise)return this.abortPromise;if(this.committed)return Promise.resolve();this.cancelled=true;this.closed=true;
  // Every caller shares the complete cleanup, including native worker shutdown
  // and already-admitted reads/writes. Nothing may recreate a removed stage.
  return this.abortPromise=(async()=>{
   await this.stopNavigation();await Promise.allSettled([...this.pending]);
   const remove=async(folder,name)=>{const resolved=path.resolve(folder);if(!contained(this.root,resolved)||path.basename(resolved)!==name)throw Error('Invalid collision cleanup folder.');let real;try{real=await fs.realpath(resolved);}catch(error){if(error.code==='ENOENT')return;throw error;}if(!contained(this.root,real))throw Error('Collision cleanup folder leaves the project.');await fs.rm(resolved,{recursive:true,force:true});};
   await remove(this.stage,'.'+this.id+'.staging');
   // Cancellation during rename wins until the successful commit is observed
   // synchronously. Roll back only this job's unique, unpublished directory.
   if(this.renamed&&!this.committed)await remove(this.target,this.id);
  })();
 }
}
module.exports={PagedCollisionWriter,readManifest,validateLocalManifest,verifyFile,verifyRemoteFile,relativeAsset,entries,MAX_MANIFEST};
