import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';

const outputRoot=path.resolve('test-output');await fs.mkdir(outputRoot,{recursive:true});
const output=await fs.mkdtemp(path.join(outputRoot,'radix-background-unit-'));
await build({entryPoints:['src/background.ts'],outfile:path.join(output,'background.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent'});
const {BackgroundLayer}=await import(pathToFileURL(path.join(output,'background.mjs')).href);
test.after(async()=>{assert.equal(path.dirname(output),outputRoot);await fs.rm(output,{recursive:true,force:true});});
const transform=(position=[0,0,0],rotation=[0,0,0],scale=1)=>({position,rotation,scale});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function fixture(){
 const scene=new THREE.Scene(),assets=[],errors=[];
 const layer=new BackgroundLayer(scene,message=>errors.push(message),(url,options)=>{
  const pending=deferred(),asset=new THREE.Group();
  Object.assign(asset,{url,options,pending,initialized:pending.promise,disposed:0,maxSh:options.maxSh,invalidations:0,setMaxSh(value){this.maxSh=value;},invalidateTransform(){this.invalidations++;},dispose(){this.disposed++;}});
  assets.push(asset);return asset;
 });
 return {scene,assets,errors,layer};
}

test('background assets attach before coarse readiness and keep authored alignment through edits',async()=>{
 const {scene,assets,layer,errors}=fixture(),first={type:'splat',source:'sky/lod-meta.json',transform:transform([1,2,3],[.1,.2,.3],4)};
 const loaded=layer.load(first,'https://tour.test/sub/',{assetBaseUrl:'https://cdn.test/assets/'},2);
 const asset=assets[0];assert.equal(asset.parent,scene,'LoD update/render can see the asset while initialization awaits coarse data');
 assert.equal(asset.url,'https://cdn.test/assets/sky/lod-meta.json');assert.deepEqual(asset.position.toArray(),[1,2,3]);assert.equal(asset.scale.x,4);assert.equal(asset.maxSh,2);
 asset.pending.resolve({lod:true});await loaded;
 const next={...first,transform:transform([3,2,1],[.3,.2,.1],2)};await layer.load(next,'https://tour.test/sub/',{assetBaseUrl:'https://cdn.test/assets/'},2);
 assert.equal(assets.length,1);assert.equal(layer.mesh,asset);assert.deepEqual(asset.position.toArray(),[3,2,1]);assert.equal(asset.scale.x,2);assert.equal(asset.invalidations,1);
 layer.performance(1);assert.equal(asset.maxSh,1);assert.deepEqual(errors,[]);layer.clear();assert.equal(asset.disposed,1);assert.equal(asset.parent,null);
});

test('late background success and errors cannot replace or fail a new selection',async()=>{
 const {layer,assets,scene,errors}=fixture();
 const old=layer.load({type:'splat',source:'old/lod-meta.json',transform:transform()},'https://tour.test/',{assetBaseUrl:'./'},3),a=assets[0];
 const current=layer.load({type:'splat',source:'new/lod-meta.json',transform:transform()},'https://tour.test/',{assetBaseUrl:'./'},3),b=assets[1];
 assert.equal(a.disposed,1);assert.equal(a.parent,null);b.pending.resolve({lod:true});await current;
 a.options.onError(Error('obsolete failed page'));a.pending.reject(Error('obsolete metadata'));await old;
 assert.equal(layer.mesh,b);assert.equal(b.parent,scene);assert.deepEqual(errors,[]);
 b.options.onError(Error('new failed page'));assert.equal(b.visible,false);assert.deepEqual(errors,['Background streaming failed: new failed page']);layer.clear();assert.equal(b.disposed,1);
});

test('failed initial background is disposed and the same URL can be retried',async()=>{
 const {layer,assets,scene}=fixture(),value={type:'splat',source:'lod-meta.json',transform:transform()};
 const failed=layer.load(value,'https://tour.test/',{assetBaseUrl:'./'},3);assets[0].pending.reject(Error('metadata unavailable'));
 await assert.rejects(failed,/metadata unavailable/);assert.equal(assets[0].disposed,1);assert.equal(layer.mesh,undefined);
 const retry=layer.load(value,'https://tour.test/',{assetBaseUrl:'./'},3);assert.equal(assets.length,2);assets[1].pending.resolve({lod:true});await retry;assert.equal(assets[1].parent,scene);layer.clear();
});

test('unsupported splat backgrounds never allocate renderer assets and remain replaceable',async()=>{
 const {layer,assets}=fixture();
 await assert.rejects(layer.load({type:'splat',source:'retained.rad',transform:transform()},'https://tour.test/',{assetBaseUrl:'./'},3),/RAD rendering is unavailable/);
 assert.equal(assets.length,0);assert.equal(layer.mesh,undefined);
 const replacing=layer.load({type:'splat',source:'lod-meta.json',transform:transform()},'https://tour.test/',{assetBaseUrl:'./'},3);
 assert.equal(assets.length,1);assets[0].pending.resolve({lod:true});await replacing;layer.clear();
});

test('two-color sky uses a node material, stays camera centered and releases both resources',async()=>{
 const {layer,scene}=fixture();await layer.load({type:'solid',color:'#224466',topColor:'#224466',bottomColor:'#886644'},'https://tour.test/',{assetBaseUrl:'./'},3);
 const shell=layer.hemisphere;assert.ok(shell);assert.equal(shell.material.isMeshBasicNodeMaterial,true);assert.ok(shell.material.colorNode);assert.equal(shell.material.depthTest,false);assert.equal(shell.material.depthWrite,false);assert.equal(shell.material.side,THREE.BackSide);
 const camera=new THREE.PerspectiveCamera();camera.position.set(2,3,4);camera.updateMatrixWorld();shell.onBeforeRender(null,scene,camera);assert.deepEqual(shell.position.toArray(),[2,3,4]);
 let geometry=0,material=0;shell.geometry.addEventListener('dispose',()=>geometry++);shell.material.addEventListener('dispose',()=>material++);
 await layer.load({type:'solid',color:'#224466'},'https://tour.test/',{assetBaseUrl:'./'},3);assert.equal(geometry,1);assert.equal(material,1);assert.equal(layer.hemisphere,undefined);assert.equal(scene.background.getHexString(),'224466');layer.clear();
});
