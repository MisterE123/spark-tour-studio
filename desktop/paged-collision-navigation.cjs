// Author-time walking preparation is kept off Electron's main thread. The
// viewer receives native Detour tiles and never rasterizes the complete tour.
const {workerData,parentPort}=require('node:worker_threads');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function run(){
 const {root,manifest}=workerData,{decodeCollisionTile,containsCollisionCell,collisionTileSurface,collisionAirTile,collisionAirIndex,validatePagedCollisionManifest}=await import('../shared/paged-collision.mjs'),{bakeNavigationSector,PAGED_NAVIGATION_FORMAT}=await import('../shared/paged-navigation.mjs');
 validatePagedCollisionManifest(manifest);const {DEFAULT_STEP_HEIGHT}=await import('../shared/walking.mjs'),stepHeight=workerData.stepHeight??DEFAULT_STEP_HEIGHT;if(!Number.isFinite(stepHeight)||stepHeight<0||stepHeight>1000000)throw Error('Invalid walking step height.');const air=collisionAirIndex(manifest);
 // Only authoring expands air certificates. The viewer reads the hierarchy
 // directly. Bound the expansion to the generator's original leaf budget and
 // synthesize full tiles without requesting deleted leaf files.
 let leaves=manifest.tiles.length;for(const node of manifest.airNodes||[]){const side=2**node.level;leaves+=side**3;if(!Number.isSafeInteger(leaves)||leaves>100000)throw Error('Collision walking preparation exceeds the tile budget.');}
 const sectors=new Map(),add=tile=>{const key=`${tile.coord[0]},${tile.coord[2]}`;if(!sectors.has(key))sectors.set(key,[]);sectors.get(key).push(tile);};
 for(const tile of manifest.tiles)add(tile);
 for(const node of manifest.airNodes||[]){const side=2**node.level;for(let x=0;x<side;x++)for(let y=0;y<side;y++)for(let z=0;z<side;z++){const coord=[node.coord[0]+x,node.coord[1]+y,node.coord[2]+z];add({key:coord.join(','),coord,bytes:48,air:true});}}
 const navigation={format:PAGED_NAVIGATION_FORMAT,stepHeight,tileSize:manifest.tileSize,origin:[0,manifest.bounds.min[1]-.5,0],tiles:[]},cache=new Map();let completed=0;
 await fs.mkdir(path.join(root,'nav'),{recursive:true});
 for(const key of sectors.keys()){
  const [x,z]=key.split(',').map(Number),neighbors=new Map(),wanted=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const entry of sectors.get(`${x+dx},${z+dz}`)||[])wanted.push(entry);
  // Compressed voxels stay bounded even for vertically layered source data.
  let bytes=0;for(const entry of wanted){bytes+=entry.bytes;if(bytes>64*1024*1024)throw Error('A walking sector is too large. Generate smaller collision tiles or coarser voxels.');let tile=cache.get(entry.key);if(!tile){if(entry.air)tile=collisionAirTile(entry.coord,manifest.tileCells);else{const input=await fs.readFile(path.join(root,entry.url));if(input.byteLength!==entry.bytes||crypto.createHash('sha256').update(input).digest('hex')!==entry.sha256)throw Error('Collision tile changed during walking preparation.');tile=decodeCollisionTile(input,{coord:entry.coord,tileCells:manifest.tileCells,expand:false});}}neighbors.set(entry.key,tile);}
  cache.clear();for(const [tileKey,tile]of neighbors)cache.set(tileKey,tile);
  const n=manifest.tileCells,neighbor=global=>{const coord=global.map(value=>Math.floor(value/n)),tile=neighbors.get(coord.join(','));return !!tile&&containsCollisionCell(tile,...global.map((value,axis)=>value-coord[axis]*n));},parts=[];let vertices=0,indices=0;
  for(const tile of neighbors.values()){if(tile.full&&air.interiorTile(tile.coord))continue;const part=collisionTileSurface(tile,manifest.detail,{allowedSpace:manifest.representation==='allowed-space',neighbor});vertices+=part.positions.length;indices+=part.indices.length;if(vertices>12_000_000||indices>18_000_000)throw Error('A walking sector is too detailed. Choose coarser collision voxels.');parts.push(part);}
  const data=await bakeNavigationSector(parts,{coord:[x,z],tileSize:manifest.tileSize,bounds:manifest.bounds,cellSize:Math.min(.1,manifest.detail),stepHeight});
  if(data?.byteLength){const url=`nav/${x}_${z}.bin`;await fs.writeFile(path.join(root,url),data,{flag:'wx'});navigation.tiles.push({key,coord:[x,z],url,bytes:data.byteLength,sha256:crypto.createHash('sha256').update(data).digest('hex'),bounds:{min:[x*manifest.tileSize,manifest.bounds.min[1],z*manifest.tileSize],max:[(x+1)*manifest.tileSize,manifest.bounds.max[1],(z+1)*manifest.tileSize]}});}
  parentPort.postMessage({type:'progress',completed:++completed,total:sectors.size});
 }
 parentPort.postMessage({type:'complete',navigation});
}
run().catch(error=>{parentPort.postMessage({type:'error',message:error?.stack||String(error)});});
