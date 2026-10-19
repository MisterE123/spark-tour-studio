import {init,NavMesh,NavMeshParams,NavMeshQuery,UnsignedCharArray,VerticesArray,TrianglesArray,RecastChunkyTriMesh,RecastBuildContext,Raw,Detour,statusFailed,freeHeightfield,freeCompactHeightfield,freeContourSet,freePolyMesh,freePolyMeshDetail} from 'recast-navigation';
import {buildTiledNavMeshRcConfig,generateTileNavMeshData,tiledNavMeshGeneratorConfigDefaults} from 'recast-navigation/generators';
import {navigationClimb,surfaceNavigationPath} from './navigation.mjs';
import {DEFAULT_STEP_HEIGHT} from './walking.mjs';

export const PAGED_NAVIGATION_FORMAT='recast-0.43.1';
// Bake one x/z sector with its neighbour geometry as a halo. Every sector uses
// the same grid and vertical origin, so Detour can connect their border edges.
export async function bakeNavigationSector(parts,{coord,tileSize,bounds,cellSize=.1,stepHeight=DEFAULT_STEP_HEIGHT}){
 await init();
 if(!Number.isFinite(tileSize)||!Number.isFinite(cellSize)||tileSize<=0||tileSize>64)throw Error('Invalid walking tile size.');const size=Math.min(1024,Math.round(tileSize/Math.max(.05,Math.min(.1,cellSize))));if(size<8)throw Error('Invalid walking tile size.');cellSize=tileSize/size;
 const vertices=new VerticesArray(),triangles=new TrianglesArray(),chunky=new RecastChunkyTriMesh(),context=new RecastBuildContext();let config,data,intermediates;
 try{
  const positions=[],indices=[];let lowY=Infinity,highY=-Infinity;for(const part of parts){const offset=positions.length/3;for(let i=0;i<part.positions.length;i++){const value=part.positions[i];positions.push(value);if(i%3===1){lowY=Math.min(lowY,value);highY=Math.max(highY,value);}}for(const value of part.indices)indices.push(value+offset);}
  if(!positions.length)return;
  if(positions.length>12_000_000||indices.length>18_000_000)throw Error('Walking tile geometry is too detailed. Increase collision voxel size.');
  vertices.copy(positions);triangles.copy(indices);if(!chunky.init(vertices,triangles,indices.length/3,256))throw Error('Could not prepare walking tile.');
  // Recast stores span heights in 16 bits. A remote mountain or distant floor
  // must not shift this sector outside that range. Align each local envelope to
  // the common height grid so border heights still join between sectors.
  const baseY=bounds.min[1]-.5,ch=.05,minY=baseY+Math.floor((lowY-.5-baseY)/ch)*ch,maxY=baseY+Math.ceil((highY+3-baseY)/ch)*ch;
  if(!Number.isFinite(minY)||!Number.isFinite(maxY)||maxY-minY>3000)throw Error('This walking sector spans too many vertical levels. Limit collision coverage to a smaller vertical range.');
  ({config}=buildTiledNavMeshRcConfig({recastConfig:{...tiledNavMeshGeneratorConfigDefaults,cs:cellSize,ch:.05,tileSize:size,walkableSlopeAngle:45,walkableHeight:34,walkableClimb:navigationClimb(stepHeight),walkableRadius:Math.ceil(.25/cellSize),minRegionArea:2,mergeRegionArea:4},navMeshBounds:[[0,minY,0],[tileSize,maxY,tileSize]]}));
  const [x,z]=coord,result=generateTileNavMeshData(vertices,triangles,config,chunky,{x,y:z,bmin:[x*tileSize,minY,z*tileSize],bmax:[(x+1)*tileSize,maxY,(z+1)*tileSize]},{buildBvTree:true},true,context);intermediates=result.intermediates;
  // Recast 0.43 reports an empty polymesh as a Detour-data failure. Keep its
  // intermediates long enough to distinguish no walking surface from a genuine
  // generation failure; sparse air/obstacle sectors are valid collision data.
  if(!result.success){if(result.error==='Failed to create Detour navmesh data'&&intermediates.polyMesh?.npolys()===0)return;throw Error(result.error||'Could not prepare walking tile.');}data=result.data;const bytes=data?.toTypedArray().slice();return bytes?validateNavigationData(bytes,coord.join(',')):undefined;
 }finally{data?.destroy();if(intermediates){if(intermediates.heightfield)freeHeightfield(intermediates.heightfield);if(intermediates.compactHeightfield)freeCompactHeightfield(intermediates.compactHeightfield);if(intermediates.contourSet)freeContourSet(intermediates.contourSet);if(intermediates.polyMesh)freePolyMesh(intermediates.polyMesh);if(intermediates.polyMeshDetail)freePolyMeshDetail(intermediates.polyMeshDetail);}vertices.destroy();triangles.destroy();Raw.destroy(chunky.raw);Raw.destroy(context.raw);if(config)Raw.destroy(config);}
}

export async function createPagedNavigation({tileSize,origin=[0,0,0]}){
 await init();const mesh=new NavMesh(),params=NavMeshParams.create({orig:{x:origin[0],y:origin[1],z:origin[2]},tileWidth:tileSize,tileHeight:tileSize,maxTiles:256,maxPolys:16384});
 try{if(!mesh.initTiled(params))throw Error('Could not open walking tiles.');}finally{Raw.destroy(params.raw);}
 const query=new NavMeshQuery(mesh,{maxNodes:16384}),resident=new Map();query.defaultQueryHalfExtents={x:.8,y:2,z:.8};let disposed=false;
 return {
  sync(tiles){if(disposed)throw Error('Walking tiles have closed.');for(const tile of tiles)validateNavigationData(tile.data,tile.key);const keep=new Set(tiles.map(tile=>tile.key));for(const [key,ref] of resident)if(!keep.has(key)){const removed=mesh.removeTile(ref);Raw.destroy(removed.raw);resident.delete(key);}for(const tile of tiles){if(resident.has(tile.key))continue;const data=new UnsignedCharArray();data.copy(tile.data);const result=mesh.addTile(data,Detour.DT_TILE_FREE_DATA,0);if(statusFailed(result.status)){data.destroy();throw Error('A walking tile could not be loaded.');}resident.set(tile.key,result.tileRef);}},
  path(start,end){if(disposed)throw Error('Walking tiles have closed.');return surfaceNavigationPath(query,start,end,{maxPathPolys:4096,maxStraightPathPoints:2048});},
  get residentCount(){return resident.size;},
  dispose(){if(disposed)return;disposed=true;resident.clear();query.destroy();mesh.destroy();}
 };
}

// A checksum detects interrupted downloads. Structural bounds are checked too,
// before passing bytes into Detour's native tile parser.
export function validateNavigationData(data,key){
 if(!(data instanceof Uint8Array)||data.byteLength<100||data.byteLength>32*1024*1024)throw Error('Invalid walking tile data.');const view=new DataView(data.buffer,data.byteOffset,data.byteLength),value=index=>view.getInt32(index*4,true);
 if(value(0)!==1145979222||value(1)!==7||`${value(2)},${value(3)}`!==key||value(4)!==0)throw Error('Invalid walking tile identity.');
 const counts=Array.from({length:9},(_,index)=>value(index+6));if(counts.some(count=>count<0||count>data.byteLength)||!counts[0]||!counts[1]||counts[0]>16384||counts[1]>65535||counts[8]>counts[0]||counts[3]>counts[0]||[...Array(10).keys()].some(index=>!Number.isFinite(view.getFloat32((index+15)*4,true))))throw Error('Invalid walking tile counts.');
 const [polys,vertices,links,details,detailVertices,detailTriangles,bvNodes,connections]=counts,align=value=>Math.ceil(value/4)*4,expected=100+align(vertices*12)+align(polys*32)+align(links*12)+align(details*12)+align(detailVertices*12)+align(detailTriangles*4)+align(bvNodes*16)+align(connections*36);if(expected!==data.byteLength)throw Error('Truncated walking tile data.');return data;
}
