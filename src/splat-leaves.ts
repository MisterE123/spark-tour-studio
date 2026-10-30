import type {SplatPager} from '@sparkjsdev/spark';
import {assertPagedRad} from '../shared/rad.mjs';
import {splatFormat} from '../shared/splat-format.mjs';
import {finestSogLeafFiles,mergeSplatLeafRanges} from '../shared/splat-leaf-ranges.mjs';
import {openSogInput,alphaTable,type SogSource} from './rendering/radix/sog/sog';
import {parseLod} from './rendering/radix/sog/lod';
import {decodePixels} from './rendering/radix/sog/webp';

type Visit=(x:number,y:number,z:number,opacity:number)=>Promise<void>|void;
type Progress=(phase:string,completed?:number,total?:number)=>void;
type Options={signal?:AbortSignal;progress?:Progress};
type Range={offset:number;count:number};
const yieldTask=()=>new Promise<void>(resolve=>setTimeout(resolve,0));

// Both collision generators consume this source-local stream. Rendering,
// scene transforms and currently selected LoD never change its source points.
export async function scanSplatLeaves(url:string,visit:Visit,{signal,progress=()=>{}}:Options={}){
 signal?.throwIfAborted();
 if(splatFormat(url)==='rad')return scanRadLeaves(url,visit,{signal,progress});
 const input=await openSogInput(url,{signal});let scanned=0,leaves=0;
 if(input.kind==='sog'){
  progress('Reading original SOG splats…',0,1);
  const stats=await scanSogSource(input.source,null,visit,{signal});scanned+=stats.scanned;leaves+=stats.leaves;
  progress('Reading original SOG splats…',1,1);
 }else{
  const files=finestSogLeafFiles(parseLod(input.json,input.url));
  for(let index=0;index<files.length;index++){
   signal?.throwIfAborted();progress('Reading finest SOG source files…',index,files.length);
   const file=files[index],opened=await openSogInput(file.url,{signal});
   if(opened.kind!=='sog')throw Error('A SOG LoD leaf must reference a single SOG asset.');
   const stats=await scanSogSource(opened.source,file.ranges,visit,{signal});scanned+=stats.scanned;leaves+=stats.leaves;
   await yieldTask();
  }
  progress('Reading finest SOG source files…',files.length,files.length);
 }
 signal?.throwIfAborted();return {scanned,leaves};
}

async function scanSogSource(source:SogSource,ranges:Range[]|null,visit:Visit,{signal}:Options){
 const {meta}=source,selected=ranges===null?[{offset:0,count:meta.count}]:mergeSplatLeafRanges(ranges,meta.count);
 // Collision only needs position and opacity. Avoid quaternions, scales, SH,
 // and a second 32-byte-per-splat decoded table for large captures.
 const [low,high,color]=await Promise.all([meta.means.files[0],meta.means.files[1],meta.sh0.files[0]].map(async name=>decodePixels(await source.getFile(name))));
 signal?.throwIfAborted();
 for(const image of [low,high,color])if(image.width!==low.width||image.height!==low.height||image.width*image.height<meta.count||image.rgba.length!==image.width*image.height*4)throw Error('SOG position and opacity images have incompatible dimensions or too few splats.');
 const alpha=alphaTable(meta),lo=low.rgba,hi=high.rgba,colors=color.rgba,{mins,maxs}=meta.means;
 const dx=(maxs[0]-mins[0])/65535,dy=(maxs[1]-mins[1])/65535,dz=(maxs[2]-mins[2])/65535;
 const unlog=(value:number)=>Math.sign(value)*Math.expm1(Math.abs(value));let leaves=0;
 for(const range of selected)for(let index=range.offset,end=range.offset+range.count;index<end;index++){
  if((leaves&0xffff)===0){signal?.throwIfAborted();await yieldTask();signal?.throwIfAborted();}
  const at=index*4,x=unlog(mins[0]+dx*(lo[at]|hi[at]<<8)),y=unlog(mins[1]+dy*(lo[at+1]|hi[at+1]<<8)),z=unlog(mins[2]+dz*(lo[at+2]|hi[at+2]<<8));
  const waiting=visit(x,y,z,alpha[colors[at+3]]);leaves++;if(waiting){await waiting;signal?.throwIfAborted();}
 }
 signal?.throwIfAborted();return {scanned:meta.count,leaves};
}

async function scanRadLeaves(url:string,visit:Visit,{signal,progress=()=>{}}:Options){
 // Keep the existing RAD decoder available for retained project sources. It
 // is not imported or initialized by a SOG-only collision generation job.
 (globalThis as any).window=globalThis;
 const {PagedSplats,fromHalf}=await import('@sparkjsdev/spark');
 const paged=new PagedSplats({rootUrl:url,pager:{extSplats:true} as SplatPager,maxSh:0});let scanned=0,leaves=0;
 const abort=()=>paged.abortController.abort();signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();const {meta}=await paged.getRadMeta();assertPagedRad(meta);const total=meta.chunks.length;
  for(let chunk=0;chunk<total;chunk++){
   signal?.throwIfAborted();progress('Reading original splat pages…',chunk,total);
   const decoded=await paged.fetchDecodeChunk(chunk);if(!('extArrays'in decoded))throw Error('Extended splat decoding is unavailable.');
   const tree=decoded.extra.lodTree as Uint32Array|undefined;if(!tree||tree.length<decoded.numSplats*4)throw Error('RAD page has no complete LoD tree.');
   const words=decoded.extArrays[0],centers=new Float32Array(words.buffer,words.byteOffset,words.length);
   for(let index=0;index<decoded.numSplats;index++){
    if((index&0xffff)===0){signal?.throwIfAborted();await yieldTask();}
    scanned++;const at=index*4;if((tree[at+2]&0xffff)!==0)continue;
    const waiting=visit(centers[at],centers[at+1],centers[at+2],fromHalf(words[at+3]&0xffff));leaves++;if(waiting){await waiting;signal?.throwIfAborted();}
   }
  }
  signal?.throwIfAborted();progress('Reading original splat pages…',total,total);return {scanned,leaves};
 }finally{signal?.removeEventListener('abort',abort);paged.dispose();}
}
