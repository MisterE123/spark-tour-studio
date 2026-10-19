// Exact local physics surfaces, independent of downloaded voxel-page size.
// The largest temporary field is a 32-cell block plus a one-cell halo.
import {collisionAirIndex} from './paged-collision.mjs';

const finite=value=>typeof value==='number'&&Number.isFinite(value);
const coord=value=>Array.isArray(value)&&value.length===3&&value.every(v=>Number.isSafeInteger(v)&&Math.abs(v)<=100000000000);
const point=value=>Array.isArray(value)?value:[value?.x,value?.y,value?.z];
const fail=message=>{throw Error('Invalid local collision physics: '+message);};
const validPage=(detail,tileCells)=>finite(detail)&&detail>=.01&&detail<=2&&Number.isInteger(tileCells)&&tileCells>=4&&tileCells<=256&&tileCells%4===0;

/** Approximately one metre per physics block, never more than 32 cells. */
export function chunkConfig(detail,tileCells){
 if(!validPage(detail,tileCells))fail('page resolution.');
 let cells=1,distance=Infinity;for(let n=1;n<=Math.min(32,tileCells);n++)if(tileCells%n===0){const error=Math.abs(n*detail-1);if(error<distance){cells=n;distance=error;}}
 return {cells,size:cells*detail};
}
export const collisionPhysicsChunkConfig=chunkConfig;

/** Descriptors cover an inclusive axis-aligned neighborhood in generation metres. */
export function localPhysicsChunks(position,radius,config){
 const p=point(position),r=typeof radius==='number'?[radius,radius,radius]:radius,{cells,size}=config||{};
 if(p.length!==3||!p.every(finite)||!Array.isArray(r)||r.length!==3||!r.every(v=>finite(v)&&v>=0)||!Number.isInteger(cells)||cells<1||cells>32||!finite(size)||size<=0)fail('chunk neighborhood.');
 const low=p.map((v,i)=>Math.floor((v-r[i])/size)),high=p.map((v,i)=>Math.floor((v+r[i])/size));if(!coord(low)||!coord(high)||low.reduce((count,v,i)=>count*(high[i]-v+1),1)>4096)fail('chunk neighborhood is too large.');
 const chunks=[];for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){const coord=[x,y,z],min=coord.map(v=>v*size),max=min.map(v=>v+size);chunks.push({key:coord.join(','),coord,cells,bounds:{min,max}});}
 const distance=chunk=>chunk.coord.reduce((sum,v,i)=>sum+((v+.5)*size-p[i])**2,0);return chunks.sort((a,b)=>distance(a)-distance(b)||a.coord[0]-b.coord[0]||a.coord[1]-b.coord[1]||a.coord[2]-b.coord[2]);
}

function cellQuery(tiles,n,air){
 const records=new Map();let lastCoord=[],lastRecord;
 const record=coord=>{const key=coord.join(',');if(records.has(key))return records.get(key);let result;if(air.hasTile(coord))result={full:true,known:true};else{const tile=tiles.get(key);if(tile){if(tile.tileCells!==n||!coord.every((v,i)=>v===tile.coord[i]))fail('tile identity.');result=tile.full?{full:true,known:true}:{known:true,view:tile.bytes?new DataView(tile.bytes.buffer,tile.bytes.byteOffset,tile.bytes.byteLength):undefined,occupied:tile.occupied?new Set(tile.occupied):undefined,bricks:new Map()};}else result={known:false};}records.set(key,result);return result;};
 const brick=(data,key)=>{let mask=data.bricks.get(key);if(!mask){let low=0,high=data.view.getUint32(24,true)-1;mask=[0,0];while(low<=high){const mid=(low+high)>>>1,offset=48+mid*12,value=data.view.getUint32(offset,true);if(value<key)low=mid+1;else if(value>key)high=mid-1;else{mask=[data.view.getUint32(offset+4,true),data.view.getUint32(offset+8,true)];break;}}data.bricks.set(key,mask);}return mask;};
 const at=(x,y,z)=>{const tx=Math.floor(x/n),ty=Math.floor(y/n),tz=Math.floor(z/n);if(lastCoord[0]!==tx||lastCoord[1]!==ty||lastCoord[2]!==tz){lastCoord=[tx,ty,tz];lastRecord=record(lastCoord);}const data=lastRecord;if(!data.known)return false;if(data.full)return true;const px=x-tx*n,py=y-ty*n,pz=z-tz*n;if(data.occupied)return data.occupied.has((px*n+py)*n+pz);const axis=n/4,key=(Math.floor(px/4)*axis+Math.floor(py/4))*axis+Math.floor(pz/4),mask=brick(data,key);
  const bit=((px%4)*4+py%4)*4+pz%4;return !!(mask[bit>>>5]&(1<<(bit&31)));
 };
 const fullBox=(low,high)=>{const min=low.map(v=>Math.floor(v/4)),max=high.map(v=>Math.floor(v/4)),axis=n/4;for(let x=min[0];x<=max[0];x++)for(let y=min[1];y<=max[1];y++)for(let z=min[2];z<=max[2];z++){const coord=[x,y,z].map(v=>Math.floor(v/axis)),data=record(coord);if(!data.known)return false;if(data.full)continue;if(data.occupied)return false;const local=[x,y,z].map((v,i)=>v-coord[i]*axis),mask=brick(data,(local[0]*axis+local[1])*axis+local[2]);if(mask[0]!==0xffffffff||mask[1]!==0xffffffff)return false;}return true;};
 return {at,record,fullBox};
}

/**
 * Emit only the boundary faces owned by free cells in this small block.
 * Verified neighboring air suppresses internal seams; unknown space is solid.
 * `complete` describes owned data, independently of halo availability.
 */
export function collisionChunkSurface(chunk,tiles,detail,tileCells,air=collisionAirIndex({})){
 const {coord:chunkCoord,cells:n,key}=chunk||{};if(!validPage(detail,tileCells)||!coord(chunkCoord)||!Number.isInteger(n)||n<1||n>32||tileCells%n||key!==undefined&&key!==chunkCoord.join(','))fail('chunk identity or resolution.');
 const origin=chunkCoord.map(v=>v*n),bounds={min:origin.map(v=>v*detail),max:origin.map(v=>(v+n)*detail)},query=cellQuery(tiles,tileCells,air),ownedCoord=origin.map(v=>Math.floor(v/tileCells)),owner=query.record(ownedCoord),empty=complete=>({positions:new Float32Array(),indices:new Uint32Array(),triangleCount:0,bounds,complete});
 if(!owner.known)return empty(false);
 // Complete uniform halo has no physical boundary. A mixed source page does
 // not prevent this test from exploiting certified neighbors on other pages.
 const haloLow=origin.map(v=>Math.floor((v-1)/tileCells)),haloHigh=origin.map(v=>Math.floor((v+n)/tileCells));let full=true;
 for(let x=haloLow[0];full&&x<=haloHigh[0];x++)for(let y=haloLow[1];full&&y<=haloHigh[1];y++)for(let z=haloLow[2];z<=haloHigh[2];z++)if(!query.record([x,y,z]).full){full=false;break;}
 if(full)return empty(true);
 // A mixed network page often contains wholly clear local blocks. Full brick
 // masks certify those blocks directly without visiting their individual cells.
 if(query.fullBox(origin.map(v=>v-1),origin.map(v=>v+n)))return empty(true);
 const width=n+2,field=new Uint8Array(width**3),at=(x,y,z)=>field[((x+1)*width+y+1)*width+z+1];let occupied=0;
 for(let x=-1;x<=n;x++)for(let y=-1;y<=n;y++)for(let z=-1;z<=n;z++){const allowed=query.at(origin[0]+x,origin[1]+y,origin[2]+z);field[((x+1)*width+y+1)*width+z+1]=allowed?1:0;if(allowed&&x>=0&&y>=0&&z>=0&&x<n&&y<n&&z<n)occupied++;}
 if(!occupied)return empty(true);
 const positions=[],indices=[],vertices=new Map(),vertex=p=>{const key=p.join(',');let id=vertices.get(key);if(id!==undefined)return id;id=positions.length/3;vertices.set(key,id);positions.push(...p.map((v,i)=>(v+origin[i])*detail));return id;};
 for(let axis=0;axis<3;axis++){
  const u=(axis+1)%3,v=(axis+2)%3,mask=new Int8Array(n*n),p=[0,0,0];
  for(let plane=0;plane<=n;plane++){
   mask.fill(0);for(let row=0;row<n;row++)for(let col=0;col<n;col++){p[axis]=plane-1;p[u]=col;p[v]=row;const before=at(...p);p[axis]=plane;const after=at(...p);mask[row*n+col]=before===after||plane===0&&!after||plane===n&&!before?0:before?1:-1;}
   for(let row=0;row<n;row++)for(let col=0;col<n;col++){
    const sign=mask[row*n+col];if(!sign)continue;let width=1,height=1;while(col+width<n&&mask[row*n+col+width]===sign)width++;outer:while(row+height<n){for(let k=0;k<width;k++)if(mask[(row+height)*n+col+k]!==sign)break outer;height++;}
    for(let y=0;y<height;y++)mask.fill(0,(row+y)*n+col,(row+y)*n+col+width);
    const corners=[[col,row],[col+width,row],[col+width,row+height],[col,row+height]].map(([x,y])=>{const p=[0,0,0];p[axis]=plane;p[u]=x;p[v]=y;return vertex(p);});if(sign<0)corners.reverse();
    // Normals point into navigable air, matching the existing Rapier surfaces.
    indices.push(corners[0],corners[2],corners[1],corners[0],corners[3],corners[2]);
   }
  }
 }
 return {positions:new Float32Array(positions),indices:new Uint32Array(indices),triangleCount:indices.length/3,bounds,complete:true};
}
