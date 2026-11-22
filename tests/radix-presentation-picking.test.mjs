import assert from 'node:assert/strict';
import {mkdtemp, mkdir, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';
import * as THREE from 'three';
import {Splats} from '../src/rendering/radix/vendor/radix-core.module.js';

const root=path.resolve('test-output');
await mkdir(root,{recursive:true});
const output=await mkdtemp(path.join(root,'radix-presentation-picking-unit-'));
test.after(()=>rm(output,{recursive:true,force:true}));
const outfile=path.join(output,'backend.mjs');
await build({stdin:{resolveDir:process.cwd(),contents:`
 export {RadixBackend} from './src/rendering/radix/index.ts';
 export {SurfaceProxy} from './src/rendering/radix/surface-proxy.ts';
`},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
// The adapter's module initialization creates a default texture. No browser
// image decode, hardware renderer or worker is needed for these checks.
const bitmap=Object.getOwnPropertyDescriptor(globalThis,'ImageBitmap');
Object.defineProperty(globalThis,'ImageBitmap',{configurable:true,value:class ImageBitmap{}});
let loaded;
try{loaded=await import(pathToFileURL(outfile).href);}
finally{if(bitmap)Object.defineProperty(globalThis,'ImageBitmap',bitmap);else delete globalThis.ImageBitmap;}
const {RadixBackend,SurfaceProxy}=loaded;

test('first view accepts a completed empty CPU sort for the current collection',()=>{
 const renderer={backend:{gl:{getParameter:()=>4096,getExtension:()=>null}},info:{render:{drawCalls:0}},xr:{isPresenting:false},setPixelRatio(){},initTexture(){},setAnimationLoop(){},dispose(){},domElement:{remove(){}}};
 const density=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');
 Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1});
 let backend;
 try{backend=new RadixBackend(renderer);}
 finally{if(density)Object.defineProperty(globalThis,'devicePixelRatio',density);else delete globalThis.devicePixelRatio;}
 const {node}=backend;
 const current={count:256,objects:[]},old={count:256,objects:[]};
 const asset={stats:{shown:256,phase:'ready'}};
 backend.members.add(asset);
 node.collection=current;
 const finishFrame=()=>{node.onAfterRender();backend.markRendered();};
 try{
  finishFrame();
  assert.equal(backend.hasPresented(asset),false,'ordering is still pending');
  node.view._order={collection:old,visible:0};
  finishFrame();
  assert.equal(backend.hasPresented(asset),false,'old collection sorted empty');
  node.view._order={collection:current,visible:256};
  node.geometry.instanceCount=1;
  finishFrame();
  assert.equal(backend.hasPresented(asset),false,'nonempty draw still pending');
  node.geometry.instanceCount=0;
  finishFrame();
  assert.equal(backend.hasPresented(asset),false,'positive visible order is not an empty frame');
  node.view._order={collection:current,visible:0};
  backend.markRendered();
  assert.equal(backend.hasPresented(asset),false,'the splat render pass has not completed');
  node.onAfterRender();
  node.collection=old;
  backend.markRendered();
  assert.equal(backend.hasPresented(asset),false,'the collection changed after the empty render pass');
  node.collection=current;
  finishFrame();
  assert.equal(backend.hasPresented(asset),true,'current empty order completed the render pass');
  backend.presented.clear();
  backend.markRendered();
  assert.equal(backend.hasPresented(asset),false,'an empty render pass is consumed only once');
  node.view._order={collection:current,visible:256};
  node.geometry.instanceCount=1;
  renderer.info.render.drawCalls++;
  finishFrame();
  assert.equal(backend.hasPresented(asset),true,'normal nonempty draw still requires a draw call');
 }finally{backend.dispose();}
});

function packedSplat(center,scales,rotation){
 const splat=Splats.makeExtSplat(),data=Splats.make(1);
 Object.assign(splat.center,center);
 Object.assign(splat.scales,scales);
 Object.assign(splat.quaternion,rotation);
 splat.opacity=1;
 Splats.encodeExt(data.bundles.extSplats,0,splat);
 return data;
}

test('picker includes rotated anisotropic edges and new streamed samples in local bounds',async()=>{
 const proxy=new SurfaceProxy(),parent=new THREE.Group(),asset=new THREE.Group();
 parent.position.set(7,3,1);parent.rotation.y=.47;parent.scale.setScalar(3);
 asset.position.set(-2,.5,-1);asset.rotation.x=-.31;
 parent.add(asset);
 const ray=(x,y)=>new THREE.Raycaster(asset.localToWorld(new THREE.Vector3(x,y,0)),new THREE.Vector3(0,0,-1).transformDirection(asset.matrixWorld));
 const hit=(x,y)=>{const result=[];proxy.intersect(ray(x,y),asset,result);return result[0];};
 const rotation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};
 const data=x=>packedSplat({x,y:0,z:-5},{x:.5,y:.05,z:.125},rotation);
 const offer=(key,x)=>new Promise(resolve=>proxy.offer(key,{count:1,read:async()=>data(x)},()=>resolve));
 await offer('first',0);
 assert.equal(proxy.count,1);
 assert.ok(hit(0,0),'center ray intersects');
 const silhouette=hit(0,.7);
 assert.ok(silhouette,'edge ray hits the long axis even though it misses the center bounds');
 assert.ok(Math.abs(asset.worldToLocal(silhouette.point.clone()).y-.7)<1e-7);
 assert.ok(silhouette.distance>13.5&&silhouette.distance<15);
 assert.equal(hit(.7,0),undefined,'the narrow axis remains a miss');
 assert.equal(hit(10,.7),undefined);
 await offer('second',10);
 assert.ok(hit(10,.7),'streamed samples grow the same asset-space bounds');
 proxy.dispose();
 assert.equal(proxy.count,0);
 assert.equal(hit(10,.7),undefined);
});

test('disposal during a pending pick read releases its source without new samples',async()=>{
 const proxy=new SurfaceProxy();
 let provide;
 const pending=new Promise(resolve=>{provide=resolve;});
 const released=new Promise(resolve=>proxy.offer('pending',{count:1,read:()=>pending},()=>resolve));
 proxy.dispose();
 provide(packedSplat({x:0,y:0,z:-5},{x:.5,y:.5,z:.5},{x:0,y:0,z:0,w:1}));
 await released;
 assert.equal(proxy.count,0);
});
