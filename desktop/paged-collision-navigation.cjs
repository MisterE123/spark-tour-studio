// Author-time walking preparation is kept off Electron's main thread. The
// viewer receives native Detour tiles and never rasterizes the complete tour.
const {workerData,parentPort}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(){
 const {root,manifest}=workerData,{decodeCollisionTile,containsCollisionCell,collisionTileSurface}=await import('../shared/paged-collision.mjs'),{bakeNavigationSector,PAGED_NAVIGATION_FORMAT}=await import('../shared/paged-navigation.mjs');
 const sectors=new Map();for(const tile of manifest.tiles){const key=`${tile.coord[0]},${tile.coord[2]}`;if(!sectors.has(key))sectors.set(key,[]);sectors.get(key).push(tile);}
 const navigation={format:PAGED_NAVIGATION_FORMAT,tileSize:manifest.tileSize,origin:[0,manifest.bounds.min[1]-.5,0],tiles:[]},cache=new Map();let completed=0;
 await fs.mkdir(path.join(root,'nav'),{recursive:true});
 for(const key of sectors.keys()){
  const [x,z]=key.split(',').map(Number),neighbors=new Map(),wanted=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const entry of sectors.get(`${x+dx},${z+dz}`)||[])wanted.push(entry);
  // Compressed voxels stay bounded even for vertically layered source data.
  let bytes=0;for(const entry of wanted){bytes+=entry.bytes;if(bytes>64*1024*1024)throw Error('A walking sector is too large. Generate smaller collision tiles or coarser voxels.');let tile=cache.get(entry.key);if(!tile){const input=await fs.readFile(path.join(root,entry.url));if(input.byteLength!==entry.bytes||crypto.createHash('sha256').update(input).digest('hex')!==entry.sha256)throw Error('Collision tile changed during walking preparation.');tile=decodeCollisionTile(input,{coord:entry.coord,tileCells:manifest.tileCells,expand:false});}neighbors.set(entry.key,tile);}
  cache.clear();for(const [tileKey,tile]of neighbors)cache.set(tileKey,tile);
  const n=manifest.tileCells,neighbor=global=>{const coord=global.map(value=>Math.floor(value/n)),tile=neighbors.get(coord.join(','));return !!tile&&containsCollisionCell(tile,...global.map((value,axis)=>value-coord[axis]*n));},parts=[];let vertices=0,indices=0;
  for(const tile of neighbors.values()){const part=collisionTileSurface(tile,manifest.detail,{allowedSpace:manifest.representation==='allowed-space',neighbor});vertices+=part.positions.length;indices+=part.indices.length;if(vertices>12_000_000||indices>18_000_000)throw Error('A walking sector is too detailed. Choose coarser collision voxels.');parts.push(part);}
  const data=await bakeNavigationSector(parts,{coord:[x,z],tileSize:manifest.tileSize,bounds:manifest.bounds,cellSize:Math.min(.1,manifest.detail)});
  if(data?.byteLength){const url=`nav/${x}_${z}.bin`;await fs.writeFile(path.join(root,url),data,{flag:'wx'});navigation.tiles.push({key,coord:[x,z],url,bytes:data.byteLength,sha256:crypto.createHash('sha256').update(data).digest('hex'),bounds:{min:[x*manifest.tileSize,manifest.bounds.min[1],z*manifest.tileSize],max:[(x+1)*manifest.tileSize,manifest.bounds.max[1],(z+1)*manifest.tileSize]}});}
  parentPort.postMessage({type:'progress',completed:++completed,total:sectors.size});
 }
 parentPort.postMessage({type:'complete',navigation});
}
run().catch(error=>{parentPort.postMessage({type:'error',message:error?.stack||String(error)});});
