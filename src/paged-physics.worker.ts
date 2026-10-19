import {decodeCollisionTile,collisionAirIndex,parseCollisionTileKey} from '../shared/paged-collision.mjs';
import {collisionChunkSurface} from '../shared/collision-physics.mjs';
let air=collisionAirIndex({airNodes:[]});const tiles=new Map<string,ReturnType<typeof decodeCollisionTile>>();
self.onmessage=({data})=>{try{
 if(data.type==='init'){air=collisionAirIndex({airNodes:data.airNodes||[]});tiles.clear();return;}
 // The main thread sends changed verified bytes only. Retain just this bounded
 // neighborhood; the worker never owns an unbounded duplicate of the tour.
 if(Array.isArray(data.retain)){const retained=new Set<string>(data.retain);for(const key of tiles.keys())if(!retained.has(key))tiles.delete(key);for(const tile of data.tiles as {key:string;bytes:Uint8Array}[]){if(!retained.has(tile.key))throw Error('Unexpected collision page outside the physics neighborhood.');tiles.set(tile.key,decodeCollisionTile(tile.bytes,{coord:parseCollisionTileKey(tile.key),tileCells:data.tileCells,expand:false}));}}
 else{tiles.clear();for(const tile of data.tiles as {key:string;bytes:Uint8Array}[])tiles.set(tile.key,decodeCollisionTile(tile.bytes,{coord:parseCollisionTileKey(tile.key),tileCells:data.tileCells,expand:false}));}
 if([...tiles.values()].reduce((sum,tile)=>sum+tile.bytes.byteLength,0)>48*1024*1024)throw Error('Local collision page cache exceeds its memory budget.');
 const results=data.chunks.map((chunk:{key:string;coord:number[];cells:number})=>({key:chunk.key,...collisionChunkSurface(chunk,tiles,data.detail,data.tileCells,air)}));
 self.postMessage({id:data.id,results},results.flatMap((result:{positions:Float32Array;indices:Uint32Array})=>[result.positions.buffer,result.indices.buffer]));
 }catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}};
