// Spark Tour sparse collision v1. Independently authored, MIT licensed.
// Tile positions use a meter-scaled generation grid. Applying the inverse
// sourceTransform restores the scene-local alignment used by generated GLBs.
export const PAGED_COLLISION_FORMAT='spark-tour-collision';
export const COLLISION_TILE_HEADER_BYTES=48;
export const MAX_COLLISION_TILE_BYTES=16*1024*1024;
const MAGIC=0x31564353,MAX_TILES=100000,MAX_CELL_COORD=100000000;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const vec=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
const integer=value=>Number.isSafeInteger(value);
const fail=message=>{throw Error('Invalid paged collision: '+message);};
export function collisionTileKey(coord){if(!Array.isArray(coord)||coord.length!==3||!coord.every(v=>integer(v)&&Math.abs(v)<=MAX_CELL_COORD))fail('tile coordinates.');return coord.join(',');}
export function parseCollisionTileKey(key){if(typeof key!=='string'||!/^(-?\d+),(-?\d+),(-?\d+)$/.test(key))fail('tile key.');const coord=key.split(',').map(Number);if(collisionTileKey(coord)!==key)fail('noncanonical tile key.');return coord;}
export function collisionTileBounds(coord,tileSize){return {min:coord.map(v=>v*tileSize),max:coord.map(v=>(v+1)*tileSize)};}
function safeRef(value){return typeof value==='string'&&value.length>0&&value.length<1024&&!/[\\%?#\u0000-\u001f]/.test(value)&&!value.startsWith('/')&&!/^[a-z][a-z\d+.-]*:/i.test(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..');}
function checkBounds(value){return value&&vec(value.min)&&vec(value.max)&&value.min.every((v,i)=>v<=value.max[i]);}
export function validatePagedCollisionManifest(value){
 if(!value||value.format!==PAGED_COLLISION_FORMAT||value.version!==1||value.representation!=='allowed-space')fail('unsupported format, version or representation.');
 const {detail,tileCells,tileSize,sourceTransform}=value;
 if(!finite(detail)||detail<.01||detail>2||!integer(tileCells)||tileCells<4||tileCells>256||tileCells%4||!finite(tileSize)||Math.abs(tileSize-detail*tileCells)>1e-6)fail('tile resolution.');
 if(value.coordinateSystem!=='generation'||!sourceTransform||!vec(sourceTransform.position)||!vec(sourceTransform.rotation)||!finite(sourceTransform.scale)||sourceTransform.scale<=0)fail('source transform.');
 if(!checkBounds(value.bounds)||!Array.isArray(value.tiles)||value.tiles.length===0||value.tiles.length>MAX_TILES)fail('bounds or tile count.');
 const keys=new Set(),urls=new Set();let totalBytes=0;
 for(const entry of value.tiles){
  if(!entry||collisionTileKey(entry.coord)!==entry.key||keys.has(entry.key)||!safeRef(entry.url)||urls.has(entry.url))fail('duplicate tile or unsafe URL.');
  keys.add(entry.key);urls.add(entry.url);
  if(!integer(entry.bytes)||entry.bytes<COLLISION_TILE_HEADER_BYTES||entry.bytes>MAX_COLLISION_TILE_BYTES||typeof entry.sha256!=='string'||!/^[a-f\d]{64}$/.test(entry.sha256)||!integer(entry.voxels)||entry.voxels<1||entry.voxels>tileCells**3)fail('tile size, hash or occupancy.');
  const expected=collisionTileBounds(entry.coord,tileSize);
  if(!checkBounds(entry.bounds)||expected.min.some((v,i)=>Math.abs(v-entry.bounds.min[i])>1e-5||Math.abs(expected.max[i]-entry.bounds.max[i])>1e-5)||entry.bounds.min.some((v,i)=>v<value.bounds.min[i]-1e-5||entry.bounds.max[i]>value.bounds.max[i]+1e-5))fail('tile bounds.');
  totalBytes+=entry.bytes;if(!Number.isSafeInteger(totalBytes))fail('total size.');
 }
 // Navigation metadata is optional. Never allow its files to escape the asset folder.
 if(value.navigation){const nav=value.navigation;if(nav.format!=='recast-0.43.1'||!Array.isArray(nav.tiles)||nav.tiles.length>MAX_TILES||!vec(nav.origin)||Math.abs(nav.origin[0])>1e-6||Math.abs(nav.origin[2])>1e-6||Math.abs(nav.origin[1]-(value.bounds.min[1]-.5))>1e-6||!finite(nav.tileSize)||Math.abs(nav.tileSize-tileSize)>1e-6)fail('navigation header.');const seen=new Set();for(const entry of nav.tiles){if(!entry||!Array.isArray(entry.coord)||entry.coord.length!==2||!entry.coord.every(v=>integer(v)&&Math.abs(v)<=MAX_CELL_COORD)||entry.coord.join(',')!==entry.key||seen.has(entry.key)||!safeRef(entry.url)||urls.has(entry.url)||!integer(entry.bytes)||entry.bytes<1||entry.bytes>32*1024*1024||typeof entry.sha256!=='string'||!/^[a-f\d]{64}$/.test(entry.sha256)||!checkBounds(entry.bounds))fail('navigation tile.');if(Math.abs(entry.bounds.min[0]-entry.coord[0]*tileSize)>1e-5||Math.abs(entry.bounds.max[0]-(entry.coord[0]+1)*tileSize)>1e-5||Math.abs(entry.bounds.min[2]-entry.coord[1]*tileSize)>1e-5||Math.abs(entry.bounds.max[2]-(entry.coord[1]+1)*tileSize)>1e-5||entry.bounds.min[1]<value.bounds.min[1]-1e-5||entry.bounds.max[1]>value.bounds.max[1]+1e-5)fail('navigation bounds.');seen.add(entry.key);urls.add(entry.url);}}
 return value;
}
export function isPagedCollision(source){return typeof source==='string'&&/\.collision\.json(?:[?#].*)?$/i.test(source);}
export function collisionCellId(x,y,z,tileCells){return (x*tileCells+y)*tileCells+z;}
export function collisionCellPosition(id,tileCells){return [Math.floor(id/(tileCells*tileCells)),Math.floor(id/tileCells)%tileCells,id%tileCells];}
export function encodeCollisionTile({coord,tileCells,occupied,full:knownFull=false}){
 collisionTileKey(coord);if(!integer(tileCells)||tileCells<4||tileCells>256||tileCells%4)fail('tile cells.');
 const bricks=new Map(),brickAxis=tileCells/4;let voxels=knownFull?tileCells**3:0;
 if(!knownFull)for(const id of occupied){if(!integer(id)||id<0||id>=tileCells**3)fail('cell index.');const [x,y,z]=collisionCellPosition(id,tileCells),brick=(Math.floor(x/4)*brickAxis+Math.floor(y/4))*brickAxis+Math.floor(z/4),bit=((x%4)*4+y%4)*4+z%4;let mask=bricks.get(brick);if(!mask){mask=[0,0];bricks.set(brick,mask);}const word=bit>>>5,flag=1<<(bit&31);if(!(mask[word]&flag)){mask[word]=(mask[word]|flag)>>>0;voxels++;}}
 if(!voxels)fail('empty tile.');
 const full=voxels===tileCells**3,keys=full?[]:[...bricks.keys()].sort((a,b)=>a-b),bytes=new Uint8Array(COLLISION_TILE_HEADER_BYTES+keys.length*12),view=new DataView(bytes.buffer);
 view.setUint32(0,MAGIC,true);view.setUint16(4,1,true);view.setUint16(6,COLLISION_TILE_HEADER_BYTES,true);view.setUint16(8,tileCells,true);view.setUint16(10,4,true);coord.forEach((v,i)=>view.setInt32(12+i*4,v,true));view.setUint32(24,keys.length,true);view.setUint32(28,voxels,true);view.setUint32(32,full?1:0,true);
 keys.forEach((key,i)=>{const offset=COLLISION_TILE_HEADER_BYTES+i*12;view.setUint32(offset,key,true);view.setUint32(offset+4,bricks.get(key)[0],true);view.setUint32(offset+8,bricks.get(key)[1],true);});
 return bytes;
}
export function decodeCollisionTile(input,expected={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.byteLength<COLLISION_TILE_HEADER_BYTES||bytes.byteLength>MAX_COLLISION_TILE_BYTES)fail('truncated or oversized tile.');const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(view.getUint32(0,true)!==MAGIC||view.getUint16(4,true)!==1||view.getUint16(6,true)!==COLLISION_TILE_HEADER_BYTES||view.getUint16(10,true)!==4)fail('tile header.');
 const tileCells=view.getUint16(8,true),coord=[0,1,2].map(i=>view.getInt32(12+i*4,true)),brickCount=view.getUint32(24,true),voxels=view.getUint32(28,true),mode=view.getUint32(32,true);collisionTileKey(coord);
 if(tileCells<4||tileCells>256||tileCells%4||mode>1||mode===0&&brickCount<1||mode===1&&(brickCount!==0||voxels!==tileCells**3)||brickCount>(tileCells/4)**3||bytes.length!==COLLISION_TILE_HEADER_BYTES+brickCount*12||voxels<1||voxels>tileCells**3||expected.tileCells!==undefined&&expected.tileCells!==tileCells||expected.coord&&expected.coord.some((v,i)=>v!==coord[i]))fail('tile dimensions or identity.');
 for(let i=36;i<COLLISION_TILE_HEADER_BYTES;i++)if(bytes[i]!==0)fail('reserved tile header.');
 if(mode===1)return {coord,tileCells,occupied:expected.expand===false?undefined:Uint32Array.from({length:voxels},(_,i)=>i),voxels,bytes,full:true};
 const occupied=expected.expand===false?undefined:new Uint32Array(voxels),brickAxis=tileCells/4;let count=0,previous=-1;
 for(let index=0;index<brickCount;index++){const offset=COLLISION_TILE_HEADER_BYTES+index*12,key=view.getUint32(offset,true),low=view.getUint32(offset+4,true),high=view.getUint32(offset+8,true);if(key<=previous||key>=brickAxis**3||!(low||high))fail('brick index.');previous=key;const bx=Math.floor(key/(brickAxis*brickAxis))*4,by=Math.floor(key/brickAxis)%brickAxis*4,bz=key%brickAxis*4;
  for(let bit=0;bit<64;bit++)if((bit<32?low:high)&(1<<(bit&31))){if(count>=voxels)fail('occupancy count.');if(occupied)occupied[count]=collisionCellId(bx+Math.floor(bit/16),by+Math.floor(bit/4)%4,bz+bit%4,tileCells);count++;}
 }
 if(count!==voxels)fail('occupancy count.');return {coord,tileCells,occupied,voxels,bytes};
}
export async function collisionSha256(bytes){const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');}
export async function verifyCollisionTile(bytes,entry,tileCells,options={}){if(bytes.byteLength!==entry.bytes||await collisionSha256(bytes)!==entry.sha256)throw Error('Collision tile checksum does not match.');const result=decodeCollisionTile(bytes,{...options,coord:entry.coord,tileCells});if(result.voxels!==entry.voxels)fail('manifest occupancy count.');return result;}
export function containsCollisionCell(tile,x,y,z){
 const n=tile.tileCells;if(![x,y,z].every(integer)||x<0||y<0||z<0||x>=n||y>=n||z>=n)return false;
 if(tile.full)return true;if(tile.bytes){const view=new DataView(tile.bytes.buffer,tile.bytes.byteOffset,tile.bytes.byteLength),axis=n/4,key=(Math.floor(x/4)*axis+Math.floor(y/4))*axis+Math.floor(z/4),bit=((x%4)*4+y%4)*4+z%4;if(view.getUint32(32,true)===1)return true;let low=0,high=view.getUint32(24,true)-1;while(low<=high){const mid=(low+high)>>>1,offset=COLLISION_TILE_HEADER_BYTES+mid*12,value=view.getUint32(offset,true);if(value<key)low=mid+1;else if(value>key)high=mid-1;else return !!(view.getUint32(offset+4+(bit>>>5)*4,true)&(1<<(bit&31)));}return false;}
 return Array.from(tile.occupied).includes(collisionCellId(x,y,z,n));
}
export function* occupiedCollisionCells(tile){
 if(tile.occupied){yield* tile.occupied;return;}
 const {bytes,tileCells:n}=tile,view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),axis=n/4,count=view.getUint32(24,true);if(view.getUint32(32,true)===1){for(let i=0;i<n**3;i++)yield i;return;}
 for(let i=0;i<count;i++){const offset=COLLISION_TILE_HEADER_BYTES+i*12,key=view.getUint32(offset,true),x=Math.floor(key/(axis*axis))*4,y=Math.floor(key/axis)%axis*4,z=key%axis*4;for(let bit=0;bit<64;bit++)if(view.getUint32(offset+4+(bit>>>5)*4,true)&(1<<(bit&31)))yield collisionCellId(x+Math.floor(bit/16),y+Math.floor(bit/4)%4,z+bit%4,n);}
}
/** @param {any} tile @param {number} detail @param {{allowedSpace?:boolean,allowed?:boolean,neighbor?:(globalCell:number[])=>boolean}} options */
export function collisionTileSurface(tile,detail,{allowedSpace=false,allowed=allowedSpace,neighbor}={}){
 const {tileCells:n,coord}=tile;if(!finite(detail)||detail<=0)fail('surface detail.');const full=tile.full||tile.bytes&&new DataView(tile.bytes.buffer,tile.bytes.byteOffset,tile.bytes.byteLength).getUint32(32,true)===1,field=full?undefined:new Uint8Array(n**3),low=full?[0,0,0]:[n,n,n],high=full?[n-1,n-1,n-1]:[-1,-1,-1];if(!full)for(const id of occupiedCollisionCells(tile)){field[id]=1;const p=collisionCellPosition(id,n);for(let a=0;a<3;a++){low[a]=Math.min(low[a],p[a]);high[a]=Math.max(high[a],p[a]);}}
 const positions=[],indices=[],vertices=new Map(),at=(p)=>p.some(v=>v<0||v>=n)?neighbor?.(p.map((v,a)=>coord[a]*n+v))?1:0:full?1:field[collisionCellId(...p,n)];
 const vertex=p=>{const key=p.join(',');let id=vertices.get(key);if(id!==undefined)return id;id=positions.length/3;vertices.set(key,id);for(let axis=0;axis<3;axis++)positions.push((coord[axis]*n+p[axis])*detail);return id;};
 // Greedy coplanar quads reduce Recast/Rapier construction cost. Each tile is
 // independently closed, so a missing neighbor never exposes a hole in solids.
 for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3,mask=new Int8Array(n*n),p=[0,0,0];for(let plane=low[axis];plane<=high[axis]+1;plane+=full?n:1){
  mask.fill(0);for(let row=low[v];row<=high[v];row++)for(let col=low[u];col<=high[u];col++){p[axis]=plane-1;p[u]=col;p[v]=row;const before=at(p);p[axis]=plane;const after=at(p);mask[row*n+col]=before===after||plane===0&&!after||plane===n&&!before?0:before?1:-1;}
  for(let row=low[v];row<=high[v];row++)for(let col=low[u];col<=high[u];col++){const sign=mask[row*n+col];if(!sign)continue;let width=1,height=1;while(col+width<n&&mask[row*n+col+width]===sign)width++;outer:while(row+height<n){for(let k=0;k<width;k++)if(mask[(row+height)*n+col+k]!==sign)break outer;height++;}for(let dy=0;dy<height;dy++)mask.fill(0,(row+dy)*n+col,(row+dy)*n+col+width);const corners=[[col,row],[col+width,row],[col+width,row+height],[col,row+height]].map(([x,y])=>{const point=[0,0,0];point[axis]=plane;point[u]=x;point[v]=y;return vertex(point);});if(sign<0)corners.reverse();indices.push(corners[0],corners[1],corners[2],corners[0],corners[2],corners[3]);if(indices.length>12000000)throw Error('Collision tile surface is too complex. Choose coarser detail.');}
 }}if(allowed)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
