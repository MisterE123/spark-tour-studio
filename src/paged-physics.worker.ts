import {decodeCollisionTile,collisionTileSurface,containsCollisionCell,collisionTileKey} from '../shared/paged-collision.mjs';
self.onmessage=({data})=>{try{
 const tiles=new Map<string,ReturnType<typeof decodeCollisionTile>>(data.tiles.map((tile:{key:string;bytes:Uint8Array})=>[tile.key,decodeCollisionTile(tile.bytes,{expand:false})])),n=data.tileCells;
 const neighbor=(cell:number[])=>{const coord=cell.map(v=>Math.floor(v/n)),tile=tiles.get(collisionTileKey(coord));return !!tile&&containsCollisionCell(tile,...cell.map((v,i)=>v-coord[i]*n));};
 const results=data.keys.filter((key:string)=>tiles.has(key)).map((key:string)=>({key,...collisionTileSurface(tiles.get(key)!,data.detail,{allowed:true,neighbor})}));
 self.postMessage({id:data.id,results},results.flatMap((result:{positions:Float32Array;indices:Uint32Array})=>[result.positions.buffer,result.indices.buffer]));
 }catch(error){self.postMessage({id:data.id,error:error instanceof Error?error.message:String(error)});}};
