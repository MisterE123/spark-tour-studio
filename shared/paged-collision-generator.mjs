import {collisionTileKey,collisionCellId} from './paged-collision.mjs';
import {sceneMatrix,volumeMatrix} from './collision-selection.mjs';
// Original leaf centers are float32. A nominal grid point such as -.2 may be
// decoded as -.20000000298; floor alone puts it in the preceding voxel. Snap
// only within its float32 uncertainty, capped at 1% of a voxel so large world
// coordinates cannot introduce a broad positional bias.
export function quantizeCollisionCell(value,detail){
 if(!Number.isFinite(value)||!Number.isFinite(detail)||detail<=0)throw Error('Invalid collision coordinate or resolution.');
 const scaled=value/detail,nearest=Math.round(scaled),tolerance=Math.min(.01,Math.max(1e-6,Math.abs(scaled)*2**-23*1.1));return Math.floor(Math.abs(scaled-nearest)<=tolerance?nearest:scaled);
}
// An out-of-core staging buffer. Every flush is awaited before decoding the
// next RAD page; disk writes cannot pile up faster than the destination sink.
export class CollisionTileAccumulator {
 constructor({detail,tileCells,append,maxBufferedCells=262144}){if(!Number.isFinite(detail)||detail<=0||!Number.isInteger(tileCells)||tileCells<4||tileCells>256||tileCells%4||typeof append!=='function'||!Number.isInteger(maxBufferedCells)||maxBufferedCells<1||maxBufferedCells>1048576)throw Error('Invalid collision staging configuration.');this.detail=detail;this.tileCells=tileCells;this.append=append;this.maxBufferedCells=maxBufferedCells;this.pending=new Map();this.buffered=0;this.accepted=0;this.maxBuffered=0;}
 add(x,y,z){if(![x,y,z].every(Number.isFinite))return false;const cell=[x,y,z].map(v=>quantizeCollisionCell(v,this.detail));if(cell.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>100000000))throw Error('Collision coordinates are outside the supported range.');const coord=cell.map(v=>Math.floor(v/this.tileCells)),local=cell.map((v,a)=>v-coord[a]*this.tileCells),key=collisionTileKey(coord);let batch=this.pending.get(key);if(!batch){batch=[];this.pending.set(key,batch);}batch.push(collisionCellId(...local,this.tileCells));this.buffered++;this.accepted++;this.maxBuffered=Math.max(this.maxBuffered,this.buffered);return true;}
 get needsFlush(){return this.buffered>=this.maxBufferedCells;}
 async flush(){for(const [key,batch]of this.pending){await this.append(key,Uint32Array.from(batch));this.pending.delete(key);this.buffered-=batch.length;}}
}
export async function readStagedCollisionTile(sink,key,tileCells){
 const field=new Uint8Array(tileCells**3);let offset=0,unique=0;
 for(;;){const {cells,done}=await sink.read(key,offset,262144);if(!(cells instanceof Uint32Array)||cells.length>262144||!done&&!cells.length)throw Error('Invalid collision staging response.');for(const cell of cells){if(cell>=field.length)throw Error('Collision staging contains an invalid cell.');if(!field[cell]){field[cell]=1;unique++;}}offset+=cells.length;if(done)break;}
 return {field,unique};
}
export function compileNavigableDomain(authoring,transform){
 const volumes=authoring.scope==='entire'?[authoring.bounds].filter(Boolean):authoring.volumes;if(!volumes?.some(v=>v.operation==='add'))throw Error(authoring.scope==='entire'?'Set the whole-scene bounds before generating collision.':'Add a ball or box navigable area first.');
 const source=sceneMatrix(transform),height=authoring.options.extrudeUp?authoring.options.wallHeight:0,bounds=[];
 const compiled=volumes.map(volume=>{const matrix=source.clone().multiply(volumeMatrix(volume)),inverse=matrix.clone().invert().elements;
  const radius=volume.type==='ball'?1:.5,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],m=matrix.elements;for(const x of [-radius,radius])for(const y of [-radius,radius])for(const z of [-radius,radius]){const p=[m[0]*x+m[4]*y+m[8]*z+m[12],m[1]*x+m[5]*y+m[9]*z+m[13],m[2]*x+m[6]*y+m[10]*z+m[14]];for(let a=0;a<3;a++){min[a]=Math.min(min[a],p[a]);max[a]=Math.max(max[a],p[a]);}}max[1]+=height;if(volume.operation==='add')bounds.push({min,max});
  return {inverse,min,max,ball:volume.type==='ball',add:volume.operation==='add'};
 });
 const test=(entry,x,y,z)=>{const {inverse:m,min,max,ball}=entry;if(x<min[0]-1e-7||y<min[1]-1e-7||z<min[2]-1e-7||x>max[0]+1e-7||y>max[1]+1e-7||z>max[2]+1e-7)return false;const a=m[0]*x+m[4]*y+m[8]*z+m[12],b=m[1]*x+m[5]*y+m[9]*z+m[13],c=m[2]*x+m[6]*y+m[10]*z+m[14],dx=m[4],dy=m[5],dz=m[6];
  if(ball){const length=dx*dx+dy*dy+dz*dz,t=height?Math.max(0,Math.min(height,(a*dx+b*dy+c*dz)/length)):0;return (a-dx*t)**2+(b-dy*t)**2+(c-dz*t)**2<=1+1e-7;}
  let low=0,high=height;for(const [p,d]of [[a,dx],[b,dy],[c,dz]]){if(Math.abs(d)<1e-15){if(Math.abs(p)>.5+1e-7)return false;}else{const t1=(p-.5)/d,t2=(p+.5)/d;low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));}}return low<=high+1e-7;
 };
 const contains=(x,y,z)=>{let selected=false;for(const entry of compiled)if(test(entry,x,y,z))selected=entry.add;return selected;};
 // A convex additive shape containing all eight corners contains the full
 // tile. Stop at any later exclusion whose bounds could touch this tile.
 contains.coversBox=(min,max)=>{for(let index=compiled.length-1;index>=0;index--){const entry=compiled[index];if(entry.max.some((v,a)=>v<min[a])||entry.min.some((v,a)=>v>max[a]))continue;if(!entry.add)return false;let all=true;for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]])if(!test(entry,x,y,z))all=false;if(all)return true;}return false;};
 return {contains,bounds};
}
export function navigableTileKeys(bounds,tileSize,maxTiles=100000){
 const keys=new Set();for(const box of bounds){const low=box.min.map(v=>Math.floor(v/tileSize)),high=box.max.map(v=>Math.ceil(v/tileSize)-1);if(low.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>100000000)||high.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>100000000))throw Error('Navigable bounds are outside the supported range.');if(high.reduce((n,v,a)=>n*Math.max(0,v-low[a]+1),1)>maxTiles)throw Error('Navigable area exceeds 100,000 collision tiles. Reduce the bounds.');for(let x=low[0];x<=high[0];x++)for(let y=low[1];y<=high[1];y++)for(let z=low[2];z<=high[2];z++){keys.add(collisionTileKey([x,y,z]));if(keys.size>maxTiles)throw Error('Navigable areas exceed 100,000 collision tiles. Reduce the bounds.');}}
 return [...keys].sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));
}
export function allowedCollisionCells(coord,tileCells,detail,contains,obstacles){
 if(!obstacles&&contains.coversBox?.(coord.map(v=>v*tileCells*detail),coord.map(v=>(v+1)*tileCells*detail)))return {field:undefined,voxels:tileCells**3,full:true};
 const field=new Uint8Array(tileCells**3);let voxels=0;for(let x=0;x<tileCells;x++){const px=(coord[0]*tileCells+x+.5)*detail;for(let y=0;y<tileCells;y++){const py=(coord[1]*tileCells+y+.5)*detail;for(let z=0;z<tileCells;z++){const id=collisionCellId(x,y,z,tileCells);if(!obstacles?.[id]&&contains(px,py,(coord[2]*tileCells+z+.5)*detail)){field[id]=1;voxels++;}}}}
 return {field,voxels};
}
export function* collisionFieldCells(field){for(let i=0;i<field.length;i++)if(field[i])yield i;}
export class CollisionBoundsSampler{
 constructor({capacity=8192,detail=.1,minimumPadding=.25}={}){if(!Number.isInteger(capacity)||capacity<1||capacity>65536||!Number.isFinite(detail)||detail<=0||!Number.isFinite(minimumPadding)||minimumPadding<0)throw Error('Invalid scene-bounds sampling settings.');this.capacity=capacity;this.detail=detail;this.minimumPadding=minimumPadding;this.points=[];this.count=0;this.random=0x1a4f3c9d;}
 add(x,y,z){if(![x,y,z].every(Number.isFinite)||Math.max(Math.abs(x),Math.abs(y),Math.abs(z))>100000000)return;this.count++;if(this.points.length<this.capacity){this.points.push([x,y,z]);return;}this.random=(Math.imul(this.random,1664525)+1013904223)>>>0;const index=Math.floor(this.random/4294967296*this.count);if(index<this.capacity)this.points[index]=[x,y,z];}
 finish(){
  if(!this.points.length)throw Error('No finite splat positions remain for estimating scene bounds.');
  const padding=Math.max(this.minimumPadding,this.detail*2),min=[],max=[];let points=this.points;
  // Fractional tail trimming alone cannot remove one extreme point from a
  // small capture. First reject isolated distances far beyond the main cloud.
  // A generous fence preserves long ordinary structures and thin extensions;
  // the resulting box is still an editable proposal, never automatic coverage.
  if(points.length>=3){const center=[0,1,2].map(axis=>points.map(p=>p[axis]).sort((a,b)=>a-b)[Math.floor((points.length-1)/2)]),distances=points.map(p=>Math.hypot(p[0]-center[0],p[1]-center[1],p[2]-center[2])),ordered=[...distances].sort((a,b)=>a-b),q1=ordered[Math.floor((ordered.length-1)*.25)],q3=ordered[Math.floor((ordered.length-1)*.75)],fence=Math.max(q3*16,q3+(q3-q1)*16,padding*32),inliers=points.filter((_p,index)=>distances[index]<=fence);if(inliers.length>=2)points=inliers;}
  for(let a=0;a<3;a++){const values=points.map(p=>p[a]).sort((x,y)=>x-y),low=values[Math.floor((values.length-1)*.005)],high=values[Math.ceil((values.length-1)*.995)];min[a]=low-padding;max[a]=high+padding;}
  return {id:'scene-bounds',type:'box',operation:'add',position:min.map((v,a)=>(v+max[a])/2),rotation:[0,0,0],size:max.map((v,a)=>Math.max(this.detail,v-min[a]))};
 }
}
