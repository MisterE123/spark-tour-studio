// Pick the authoritative allowed-space boundary, rather than temporary physics
// seams at unloaded pages or approximate Gaussian centres. Only pages crossed
// by the ray are fetched; camera/body pins and the stream's budgets still apply.
/** @param {any} stream
 * @param {number[]} origin
 * @param {number[]} direction
 * @param {{maxDistance?:number,isCurrent?:()=>boolean,maxPages?:number,retryDelay?:number,signal?:AbortSignal}} options
 */
export async function raycastCollision(stream,origin,direction,{maxDistance=100,isCurrent=()=>true,maxPages=32,retryDelay=0,signal=undefined}={}){
 const length=Math.hypot(...direction);if(!length||![...origin,...direction,maxDistance].every(Number.isFinite)||maxDistance<=0)return null;
 const d=direction.map(value=>value/length),size=stream.manifest.detail,n=stream.manifest.tileCells;
 const cell=origin.map((value,i)=>Math.floor((value+d[i]*1e-7)/size)),step=d.map(Math.sign),delta=d.map(value=>value?size/Math.abs(value):Infinity);
 const next=d.map((value,i)=>value?((cell[i]+(value>0?1:0))*size-origin[i])/value:Infinity),pages=new Set();let distance=0,normal=[0,0,0],crossed=[],inside=false;
 for(let count=0;count<16384&&distance<=maxDistance;count++){
  if(signal?.aborted||!isCurrent())return null;
  const coord=cell.map(value=>Math.floor(value/n)),key=coord.join(',');
  if(!pages.has(key)){
   if(pages.size>=maxPages)return null;pages.add(key);
   const entry=stream.entries.get(key);if(entry)await stream.load(entry,{retryDelay,signal});
   if(signal?.aborted||!isCurrent())return null;
  }
  if(!stream.hasCell(cell)){
   if(!inside)return null;
   // An exact grid corner may cross a clear X seam and a solid floor at once.
   // Prefer the actual blocked face over the largest ray component; otherwise
   // a level floor can acquire a horizontal normal and reject valid teleports.
   if(crossed.length>1){const faces=crossed.filter(axis=>{const before=[...cell];before[axis]-=step[axis];return stream.hasCell(before);});if(faces.length){const axis=faces.reduce((best,axis)=>Math.abs(d[axis])>Math.abs(d[best])?axis:best);normal=[0,0,0];normal[axis]=-step[axis];}}
   return {point:origin.map((value,i)=>value+d[i]*distance),normal,distance};
  }
  inside=true;distance=Math.min(...next);if(!Number.isFinite(distance))return null;
  // Advance every tied axis so an exact edge/corner cannot loop or pick a
  // zero-width cell on the wrong side. Choose a deterministic entry normal.
  let axis=-1;crossed=[];for(let i=0;i<3;i++)if(next[i]<=distance+1e-8){crossed.push(i);cell[i]+=step[i];next[i]+=delta[i];if(axis<0||Math.abs(d[i])>Math.abs(d[axis]))axis=i;}
  normal=[0,0,0];normal[axis]=-step[axis];
 }
 return null;
}
