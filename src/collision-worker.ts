import {fromHalf,PagedSplats,type SplatPager} from '@sparkjsdev/spark';
import {Vector3} from 'three';
import {CollisionAuthoringSchema,compileSelection,sceneMatrix} from '../shared/collision-selection.mjs';
import {CollisionGrid,blockySurface} from '../shared/collision-grid.mjs';
import {finishSurface,collisionGlb} from '../shared/collision-surface.mjs';
import {assertPagedRad} from '../shared/rad.mjs';
import type {CollisionAuthoring,Transform} from './model';

// Spark's chunk URL resolver uses window.location; decoding does not need a
// DOM or renderer. Provide its URL context in this dedicated module worker.
(globalThis as any).window=globalThis;
export interface CollisionRequest {url:string;transform:Transform;authoring:CollisionAuthoring;engineUrl:string}
const progress=(phase:string,completed?:number,total?:number)=>postMessage({type:'progress',phase,completed,total});
async function smoothSurface(grid:any,smoothing:number,engineUrl:string){
 progress('Starting local mesh engine…');
 const {loadPyodide}=await import(/* @vite-ignore */new URL('pyodide.mjs',engineUrl).href);
 const py=await loadPyodide({indexURL:engineUrl,stdout:()=>{},stderr:()=>{}});
 await py.loadPackage(['scipy','scikit-image'],{messageCallback:()=>{},errorCallback:(text:string)=>{throw Error(text);}});
 await py.runPythonAsync(`
import numpy as np
from scipy.ndimage import gaussian_filter
from skimage.measure import marching_cubes
def tour_surface(raw, nx, ny, nz, sigma, spacing):
    field = np.frombuffer(raw, dtype=np.uint8).reshape((nx, ny, nz)).astype(np.float32)
    if sigma > 0:
        field = gaussian_filter(field, sigma=sigma, mode="constant", cval=0.0, truncate=3.0)
    vertices, faces, _, _ = marching_cubes(field, level=0.5, spacing=(spacing, spacing, spacing), allow_degenerate=False, method="lewiner")
    if len(faces) > 2000000:
        raise ValueError("Collision surface exceeds two million triangles. Choose coarser detail.")
    return vertices.astype(np.float32).reshape(-1), faces.astype(np.uint32).reshape(-1)
`);
 progress('Smoothing and extracting collision surface…');
 const raw=py.toPy(grid.field),fn=py.globals.get('tour_surface');let result;
 try{result=fn(raw,...grid.shape,smoothing,grid.detail);const verts=result.get(0),faces=result.get(1);try{const v=verts.getBuffer('f32'),f=faces.getBuffer('u32');try{const positions=new Float32Array(v.data),indices=new Uint32Array(f.data);for(let i=0;i<positions.length;i++)positions[i]+=(grid.low[i%3]+.5)*grid.detail;return {positions,indices};}finally{v.release();f.release();}}finally{verts.destroy();faces.destroy();}}finally{raw.destroy();fn.destroy();result?.destroy();}
}
export async function generateCollision(request:CollisionRequest){
 const authoring=CollisionAuthoringSchema.parse(request.authoring);
 if(!authoring.volumes.some((v:any)=>v.operation==='add'))throw Error('Add a ball or box selection first.');
 const selected=compileSelection(authoring.volumes),transform=sceneMatrix(request.transform),grid=new CollisionGrid(authoring.options),point=new Vector3();
 // Decode one RAD page at a time, always at extended precision. Leaf-only
 // extraction prevents camera-dependent LoD ancestors becoming extra solids.
 const paged=new PagedSplats({rootUrl:request.url,pager:{extSplats:true} as SplatPager,maxSh:0});let scanned=0,leaves=0;
 try{const {meta}=await paged.getRadMeta();assertPagedRad(meta);const total=meta.chunks.length;
  for(let chunk=0;chunk<total;chunk++){progress('Reading selected splats',chunk,total);const decoded=await paged.fetchDecodeChunk(chunk);if(!('extArrays' in decoded))throw Error('Extended splat decoding is unavailable.');const tree=decoded.extra.lodTree as Uint32Array|undefined;if(!tree||tree.length<decoded.numSplats*4)throw Error('RAD page has no complete LoD tree.');
   // Spark 2.3.1 ExtSplats stores XYZ as float32 words 0..2 and opacity as
   // float16 in word 3 of its first array. Inspect those decoded values without
   // allocating colors, scales, quaternions or textures for millions of points.
   const words=decoded.extArrays[0],centers=new Float32Array(words.buffer,words.byteOffset,words.length);
   for(let index=0;index<decoded.numSplats;index++){scanned++;const offset=index*4;if((tree[offset+2]&0xffff)!==0)continue;leaves++;const x=centers[offset],y=centers[offset+1],z=centers[offset+2];if(selected(x,y,z)){point.set(x,y,z).applyMatrix4(transform);grid.add(point.x,point.y,point.z,fromHalf(words[offset+3]&0xffff));}}
  }progress('Reading selected splats',total,total);
 }finally{paged.dispose();}
 progress('Building enclosure…');const field=grid.finish();const surface=authoring.options.surface==='blocky'?blockySurface(field,()=>progress('Merging collision faces…')):await smoothSurface(field,authoring.options.smoothing,request.engineUrl);
 progress('Packaging collision mesh…');const geometry=finishSurface(surface,authoring.options.surface==='smooth'?field:undefined,transform.clone().invert()),stats={scanned,leaves,selected:field.selected,ignored:field.ignored,footprint:field.footprint,voxels:field.voxels,triangles:geometry.indices.length/3};
 return {bytes:collisionGlb(geometry,{...stats,options:authoring.options}),stats};
}
self.onmessage=async event=>{try{const result=await generateCollision(event.data);(self as any).postMessage({type:'complete',...result},[result.bytes.buffer]);}catch(error){postMessage({type:'error',message:error instanceof Error?error.message:String(error)});}};
