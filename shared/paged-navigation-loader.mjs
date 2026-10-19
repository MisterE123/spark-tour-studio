const keyOf=(x,z)=>`${x},${z}`;
const abort=()=>new DOMException('Walking route cancelled.','AbortError');
const push=(heap,item)=>{heap.push(item);let i=heap.length-1;while(i){const parent=(i-1)>>>1;if(heap[parent].score<=item.score)break;heap[i]=heap[parent];i=parent;}heap[i]=item;};
const pop=heap=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;};
// Only the small manifest is needed to choose a corridor. Failed requests never
// enter this LRU, and route changes abort fetches before they can populate it.
export class PagedNavigationLoader {
 constructor(navigation,loadTile,{maxTiles=128,maxBytes=32*1024*1024}={}){this.navigation=navigation;this.loadTile=loadTile;this.maxTiles=maxTiles;this.maxBytes=maxBytes;this.entries=new Map(navigation.tiles.map(tile=>[tile.key,tile]));this.cache=new Map();this.active=new Set();this.bytes=0;this.disposed=false;}
 corridor(start,end){
  const size=this.navigation.tileSize,first=keyOf(Math.floor(start.x/size),Math.floor(start.z/size)),last=keyOf(Math.floor(end.x/size),Math.floor(end.z/size));
  if(!this.entries.has(first)||!this.entries.has(last))throw Error('No walkable surface at that point.');
  const [ex,ez]=last.split(',').map(Number),open=[{key:first,cost:0,score:0}],cost=new Map([[first,0]]),previous=new Map();let visited=0;
  while(open.length){const item=pop(open),current=item.key;if(item.cost!==cost.get(current))continue;if(current===last){const route=[last];while(previous.has(route[0]))route.unshift(previous.get(route[0]));if(route.length>this.maxTiles)throw Error('That walking destination is too far away.');return route;}if(++visited>100000)break;const [x,z]=current.split(',').map(Number);for(const [nx,nz] of [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]){const key=keyOf(nx,nz),next=item.cost+1;if(!this.entries.has(key)||next>=(cost.get(key)??Infinity))continue;cost.set(key,next);previous.set(key,current);const distance=Math.abs(ex-nx)+Math.abs(ez-nz);push(open,{key,cost:next,score:next+distance+distance*.00001});}}
  throw Error('No walkable route to that point.');
 }
 async route(start,end,signal,margin=1){
  if(this.disposed||signal?.aborted)throw abort();
  const corridor=this.corridor(start,end),keys=new Set(corridor);let requiredBytes=0;for(const key of keys){const bytes=this.entries.get(key).bytes;if(!Number.isSafeInteger(bytes)||bytes<1)throw Error('Invalid walking tile size.');requiredBytes+=bytes;}if(requiredBytes>this.maxBytes)throw Error('That walking route needs too much memory.');
  // Adjacent sectors let Detour find small detours without fetching the scene.
  margin=Math.max(1,Math.min(3,Math.floor(margin)));for(const key of corridor){const [x,z]=key.split(',').map(Number);for(let dz=-margin;dz<=margin;dz++)for(let dx=-margin;dx<=margin;dx++){const next=keyOf(x+dx,z+dz),entry=this.entries.get(next);if(!keys.has(next)&&keys.size<this.maxTiles&&entry&&Number.isSafeInteger(entry.bytes)&&entry.bytes>0&&requiredBytes+entry.bytes<=this.maxBytes){keys.add(next);requiredBytes+=entry.bytes;}}}
  const controller=new AbortController(),onAbort=()=>controller.abort();signal?.addEventListener('abort',onAbort,{once:true});this.active.add(controller);
  const wanted=[...keys],result=new Array(wanted.length);let index=0;
  const fetchNext=async()=>{while(index<wanted.length){const at=index++,key=wanted[at],entry=this.entries.get(key);if(this.disposed||controller.signal.aborted)throw abort();let data=this.cache.get(key);if(data){this.cache.delete(key);this.cache.set(key,data);}else{data=await this.loadTile(entry,controller.signal);if(this.disposed||controller.signal.aborted)throw abort();if(!(data instanceof Uint8Array)||data.byteLength!==entry.bytes||data.byteLength>this.maxBytes)throw Error('Invalid walking tile.');if(entry.sha256){const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data))).map(value=>value.toString(16).padStart(2,'0')).join('');if(digest!==entry.sha256)throw Error('Walking tile verification failed.');}if(this.disposed||controller.signal.aborted)throw abort();this.bytes+=data.byteLength-(this.cache.get(key)?.byteLength||0);this.cache.set(key,data);while(this.cache.size>this.maxTiles||this.bytes>this.maxBytes){const oldest=this.cache.keys().next().value;this.bytes-=this.cache.get(oldest).byteLength;this.cache.delete(oldest);}}result[at]={key,data};}};
  try{await Promise.all(Array.from({length:Math.min(4,wanted.length)},()=>fetchNext()));return result;}catch(error){controller.abort();throw error;}finally{signal?.removeEventListener('abort',onAbort);this.active.delete(controller);}
 }
 dispose(){this.disposed=true;for(const controller of this.active)controller.abort();this.active.clear();this.cache.clear();this.entries.clear();this.bytes=0;}
}
