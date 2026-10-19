import test from 'node:test';
import assert from 'node:assert/strict';
import {collisionAirIndex,compactCollisionAirNodes,collisionAirTile,validatePagedCollisionManifest,collisionTileBounds,containsCollisionCell,decodeCollisionTile} from '../shared/paged-collision.mjs';

const identity={position:[0,0,0],rotation:[0,0,0],scale:1};
const manifest=overrides=>({format:'spark-tour-collision',version:1,representation:'allowed-space',detail:1,tileCells:4,tileSize:4,coordinateSystem:'generation',sourceTransform:identity,bounds:{min:[0,0,0],max:[16,16,16]},tiles:[],airNodes:[{coord:[0,0,0],level:2}],...overrides});
const cube=(min,size)=>Array.from({length:size**3},(_,i)=>[min[0]+Math.floor(i/(size*size)),min[1]+Math.floor(i/size)%size,min[2]+i%size]);
const entry=coord=>({coord,key:coord.join(','),url:'tiles/'+coord.join('_')+'.scv',bytes:60,sha256:'a'.repeat(64),bounds:collisionTileBounds(coord,4),voxels:1});

test('eight full-air siblings merge recursively without retaining leaf metadata',()=>{
 const coords=cube([0,0,0],16),nodes=compactCollisionAirNodes([...coords,...coords.slice(0,10)]);
 assert.deepEqual(nodes,[{coord:[0,0,0],level:4}]);
 const index=collisionAirIndex({airNodes:nodes});
 for(const coord of coords)assert.equal(index.hasTile(coord),true);
 assert.equal(index.hasTile([16,0,0]),false);
 assert.deepEqual(index.containingNode([1,2,3],[15,15,15]),nodes[0]);
 assert.equal(index.containingNode([1,2,3],[16,15,15]),undefined);
});

test('a mixed or absent leaf prevents merging across its exact region',()=>{
 const omitted=[1,2,3],nodes=compactCollisionAirNodes(cube([0,0,0],4).filter(p=>p.some((v,i)=>v!==omitted[i]))),index=collisionAirIndex({airNodes:nodes});
 assert.ok(nodes.length>1);assert.equal(index.hasTile(omitted),false);
 for(const coord of cube([0,0,0],4))assert.equal(index.hasTile(coord),coord.some((v,i)=>v!==omitted[i]));
 assert.equal(index.containingNode([0,0,0],[3,3,3]),undefined);
 assert.equal(validatePagedCollisionManifest(manifest({airNodes:nodes,tiles:[entry(omitted)]})).tiles.length,1);
});

test('air octrees retain negative tile coordinates and half-open boundary semantics',()=>{
 const nodes=compactCollisionAirNodes([...cube([-4,-4,-4],4),...cube([0,0,0],2)]),index=collisionAirIndex({airNodes:nodes});
 assert.deepEqual(nodes,[{coord:[-4,-4,-4],level:2},{coord:[0,0,0],level:1}]);
 assert.equal(index.nodeAt([-1,-1,-1]),nodes[0]);assert.equal(index.hasTile([-5,-1,-1]),false);
 assert.equal(index.nodeAt([0,0,0]),nodes[1]);assert.equal(index.hasTile([-1,0,0]),false);
 assert.equal(index.containingNode([-4,-4,-4],[-1,-1,-1]),nodes[0]);
 assert.equal(index.containingNode([-4,-4,-4],[0,-1,-1]),undefined);
});

test('a huge certified node remains one record and answers queries without expansion',()=>{
 const node={coord:[0,0,0],level:20},size=2**20,data=manifest({airNodes:[node],bounds:{min:[0,0,0],max:[size*4,size*4,size*4]}});
 assert.equal(validatePagedCollisionManifest(data),data);
 const index=collisionAirIndex(data);assert.equal(index.nodes.length,1);
 assert.equal(index.nodeAt([size-1,size-1,size-1]),node);
 assert.equal(index.containingNode([0,0,0],[size-1,size-1,size-1]),node);
 assert.equal(index.hasTile([size,0,0]),false);assert.equal(index.hasTile([-1,0,0]),false);
});

test('legacy manifests and empty air metadata retain their existing behavior',()=>{
 const data=manifest({tiles:[entry([0,0,0])],airNodes:undefined});assert.equal(validatePagedCollisionManifest(data),data);
 assert.deepEqual(collisionAirIndex({}).nodes,[]);assert.equal(collisionAirIndex({}).hasTile([0,0,0]),false);
 assert.deepEqual(compactCollisionAirNodes([]),[]);
 assert.throws(()=>validatePagedCollisionManifest(manifest({airNodes:[]})),/tile count/);
 assert.equal(validatePagedCollisionManifest({...data,airNodes:[]}).tiles.length,1);
});

test('malformed and overlapping air nodes fail before any leaves can be expanded',()=>{
 for(const airNodes of [null,{},[{coord:[0,0],level:0}],[{coord:[.5,0,0],level:0}],[{coord:[0,0,0],level:-1}],[{coord:[0,0,0],level:21}],[{coord:[1,0,0],level:1}],[{coord:[100000000,0,0],level:8}],[{coord:[0,0,0],level:2},{coord:[0,0,0],level:2}],[{coord:[0,0,0],level:2},{coord:[2,0,0],level:1}]])assert.throws(()=>collisionAirIndex({airNodes}),/Invalid paged collision/);
 assert.throws(()=>collisionAirIndex({airNodes:Array.from({length:100001},()=>({coord:[0,0,0],level:0}))}),/count/);
 assert.throws(()=>validatePagedCollisionManifest(manifest({bounds:{min:[0,0,0],max:[15.999,16,16]}})),/air node bounds/);
 assert.throws(()=>validatePagedCollisionManifest(manifest({tiles:[entry([1,1,1])]})),/overlaps certified air/);
 assert.throws(()=>compactCollisionAirNodes([[NaN,0,0]]),/tile coordinates/);
});

test('disjoint adjacent and separated air nodes do not accidentally certify their gaps',()=>{
 const nodes=[{coord:[-2,0,0],level:1},{coord:[0,0,0],level:1},{coord:[1000000,0,0],level:0}],index=collisionAirIndex({airNodes:nodes});
 assert.equal(index.hasTile([-1,1,1]),true);assert.equal(index.hasTile([0,1,1]),true);
 assert.equal(index.hasTile([2,1,1]),false);assert.equal(index.hasTile([500000,0,0]),false);
 assert.equal(index.hasTile([1000000,0,0]),true);assert.equal(index.containingNode([-1,0,0],[0,0,0]),undefined);
 for(const p of [[NaN,0,0],[Infinity,0,0],[.5,0,0],[0,0],undefined])assert.equal(index.nodeAt(p),undefined);
 assert.equal(index.containingNode([1,1,1],[0,0,0]),undefined);
});

test('synthetic air leaves are compact full-detail tiles without dense cell allocation',()=>{
 const tile=collisionAirTile([-2,10,3],256);assert.equal(tile.full,true);assert.equal(tile.bytes.byteLength,48);assert.equal(tile.occupied,undefined);assert.equal(tile.voxels,256**3);
 assert.deepEqual(tile.coord,[-2,10,3]);assert.equal(containsCollisionCell(tile,255,255,255),true);assert.equal(containsCollisionCell(tile,256,0,0),false);
 assert.equal(decodeCollisionTile(tile.bytes,{expand:false}).full,true);
});

test('interior tiles skip surfaces only when all six complete face neighbors are certified air',()=>{
 const index=collisionAirIndex({airNodes:[{coord:[0,0,0],level:20}]});
 assert.equal(index.interiorTile([1000,1000,1000]),true,'large parent proves the entire neighborhood without expansion');
 for(const coord of [[0,100,100],[100,0,100],[100,100,0],[2**20-1,100,100],[-1,100,100]])assert.equal(index.interiorTile(coord),false,'domain edges still need boundary surfaces');
 const nodes=compactCollisionAirNodes(cube([-2,-2,-2],4).filter(coord=>coord.some((v,i)=>v!==[0,0,1][i]))),withGap=collisionAirIndex({airNodes:nodes});
 assert.equal(withGap.interiorTile([0,0,0]),false,'a mixed or unknown face neighbor must preserve its cap');
 assert.equal(withGap.interiorTile([-1,-1,-1]),true,'different certified parents can jointly cover all six faces');
 assert.equal(withGap.interiorTile([0,0,1]),false,'the central tile itself must also be certified');
 const center=[10,20,30],cross=[center];for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const coord=[...center];coord[axis]+=sign;cross.push(coord);}
 assert.equal(collisionAirIndex({airNodes:compactCollisionAirNodes(cross)}).interiorTile(center),true,'diagonal neighbors are irrelevant to six boundary faces');
 for(const coord of [[NaN,0,0],[.5,0,0],undefined])assert.equal(index.interiorTile(coord),false);
});
