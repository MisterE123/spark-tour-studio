import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as THREE from 'three';

const outputRoot=path.resolve('test-output');await fs.mkdir(outputRoot,{recursive:true});
const output=await fs.mkdtemp(path.join(outputRoot,'radix-selection-floor-unit-'));
// Expose the private asset class only in this isolated Node bundle. Metadata,
// settings and attachment methods are production code; there is no GPU/browser.
await build({entryPoints:['src/rendering/radix/index.ts'],outfile:path.join(output,'backend.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'observe-asset',setup(builder){builder.onLoad({filter:/[\\/]rendering[\\/]radix[\\/]index\.ts$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8'))+'\nexport {RadixAsset,DEFAULTS};\nexport {parseLod,selectLevels,defaultLodSettings} from "./sog/lod";\n',loader:'ts',resolveDir:path.dirname(source)}));}}]});
// The adapter makes a tiny default texture at module evaluation. Node has no
// ImageBitmap constructor; no browser image decode is performed by this test.
const imageBitmap=Object.getOwnPropertyDescriptor(globalThis,'ImageBitmap');Object.defineProperty(globalThis,'ImageBitmap',{configurable:true,value:class ImageBitmap{}});
let loaded;try{loaded=await import(pathToFileURL(path.join(output,'backend.mjs')).href);}finally{if(imageBitmap)Object.defineProperty(globalThis,'ImageBitmap',imageBitmap);else delete globalThis.ImageBitmap;}
const {RadixBackend,RadixAsset,DEFAULTS,parseLod,selectLevels,defaultLodSettings}=loaded;
const originalLoad=RadixAsset.prototype.load;RadixAsset.prototype.load=()=>{};
test.after(async()=>{RadixAsset.prototype.load=originalLoad;assert.equal(path.dirname(output),outputRoot);await fs.rm(output,{recursive:true,force:true});});

function tree(rows,{environment}={}){
 const filenames=[],children=rows.map((counts,leaf)=>({bound:{min:[leaf*2,0,0],max:[leaf*2+1,1,1]},lods:Object.fromEntries(counts.flatMap((count,level)=>{if(count===null)return[];const file=filenames.push('level-'+level+'-leaf-'+leaf+'/meta.json')-1;return[[level,{file,offset:0,count}]];}))}));
 return parseLod({lodLevels:rows[0].length,filenames,environment,tree:{bound:{min:[0,0,0],max:[rows.length*2,1,1]},children}},'https://fixture.invalid/lod-meta.json');
}
function fixture(){
 // Constructor-free backend keeps this a CPU-only ownership/diagnostics test.
 // Real Three hierarchy and production backend/asset methods remain intact.
 const backend=Object.create(RadixBackend.prototype),scene=new THREE.Scene(),node=new THREE.Group();
 Object.assign(node,{sortMode:'gpu',collection:{count:0},params:{},objectParams:{}});scene.add(node);
 Object.assign(backend,{renderer:{xr:{isPresenting:false},setPixelRatio(){}},node,head:new THREE.PerspectiveCamera(),settings:{...DEFAULTS},assets:new Set(),presented:new Set(),members:new Set(),composed:[],dead:false,stats:{backend:'webgpu',selected:0,shown:0,visible:0,residentSplats:0,loading:0,failed:0,frames:0}});
 const create=(lodTree,patch={})=>{
  const asset=backend.createAsset('https://fixture.invalid/asset/lod-meta.json');
  if(lodTree)asset.stream={tree:lodTree,setDegree(){},invalidate(){},dispose(){}};
  // Exercise real asset settings/floor computation, with network/stream upload
  // disabled so neither test construction nor traversal can allocate GPU work.
  asset.applySettings({...DEFAULTS,...patch});asset.update=()=>{};scene.add(asset);return asset;
 };
 return {backend,scene,node,create,update:()=>backend.update(new THREE.PerspectiveCamera()),close:()=>{for(const asset of [...backend.assets])asset.dispose();}};
}
function selectorFloor(lodTree,rangeMin,rangeMax){const desired=new Int8Array(lodTree.leaves),distances=new Float32Array(lodTree.leaves);return selectLevels(lodTree,{x:0,y:0,z:0},{x:0,y:0,z:-1},{...defaultLodSettings(true),rangeMin,rangeMax,splatBudget:1},desired,distances);}

test('LoD floor matches mandatory selector coverage and excludes fixed environment',()=>{
 const f=fixture(),metadata=tree([[100,40,10],[200,80,20]],{environment:'fixed-environment/meta.json'}),asset=f.create(metadata);
 try{
  assert.equal(asset.stats.selectionFloor,30);assert.equal(asset.stats.selectionFloor,selectorFloor(metadata,0,7));
  asset.applySettings({...DEFAULTS,lodRangeMax:1});assert.equal(asset.stats.selectionFloor,120);assert.equal(asset.stats.selectionFloor,selectorFloor(metadata,0,1));
  asset.applySettings({...DEFAULTS,lodRangeMin:0,lodRangeMax:0});assert.equal(asset.stats.selectionFloor,300);assert.equal(asset.stats.selectionFloor,selectorFloor(metadata,0,0));
  asset.applySettings({...DEFAULTS,lodRangeMin:20,lodRangeMax:31});assert.equal(asset.stats.selectionFloor,30);assert.equal(asset.stats.selectionFloor,selectorFloor(metadata,20,31));
 }finally{f.close();}
});

test('sparse levels use the selector fallback rather than the last level total',()=>{
 const f=fixture(),metadata=tree([[100,null,10],[null,50,null]]),asset=f.create(metadata);
 try{
  assert.equal(metadata.levelTotals[2],10);assert.equal(asset.stats.selectionFloor,60);
  for(const[min,max,expected]of[[0,1,60],[0,0,150],[2,0,150],[2,2,60]]){
   asset.applySettings({...DEFAULTS,lodRangeMin:min,lodRangeMax:max});assert.equal(asset.stats.selectionFloor,expected);assert.equal(asset.stats.selectionFloor,selectorFloor(metadata,min,max));
  }
 }finally{f.close();}
});

test('backend uses the smallest attached visible LoD floor and skips fixed or detached assets',()=>{
 const f=fixture(),small=f.create(tree([[100,40,10],[200,80,20]])),large=f.create(tree([[100,null,10],[null,50,null]])),fixed=f.create();
 try{
  assert.equal(fixed.stats.selectionFloor,undefined);f.update();assert.equal(f.backend.stats.selectionFloor,30,'minimum per-asset floor, never sum or maximum');
  small.removeFromParent();f.update();assert.equal(f.backend.stats.selectionFloor,60);
  f.scene.add(small);small.visible=false;f.update();assert.equal(f.backend.stats.selectionFloor,60);
  const hidden=new THREE.Group();hidden.visible=false;f.scene.add(hidden);hidden.add(large);f.update();assert.equal(f.backend.stats.selectionFloor,undefined,'hidden ancestors exclude a LoD asset');
  hidden.visible=true;f.update();assert.equal(f.backend.stats.selectionFloor,60);
  small.visible=true;f.update();assert.equal(f.backend.stats.selectionFloor,30);
  small.dispose();assert.equal(small.stats.selectionFloor,undefined);assert.equal(f.backend.stats.selectionFloor,60,'disposing refreshes immediately');
  f.node.removeFromParent();f.update();assert.equal(f.backend.stats.selectionFloor,undefined,'assets in another render root do not constrain this backend');
 }finally{f.close();}
});

test('settings immediately refresh floors without a renderer update or changing authored budgets',()=>{
 const f=fixture(),a=f.create(tree([[100,40,10],[200,80,20]])),b=f.create(tree([[100,null,10],[null,50,null]]));
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'devicePixelRatio');Object.defineProperty(globalThis,'devicePixelRatio',{configurable:true,value:1});
 try{
  f.update();assert.equal(f.backend.stats.selectionFloor,30);
  f.backend.applySettings({lodRangeMax:0});assert.equal(a.stats.selectionFloor,300);assert.equal(b.stats.selectionFloor,150);assert.equal(f.backend.stats.selectionFloor,150);
  const budget=f.backend.settings.selectedSplatBudget;f.backend.applySettings({selectedSplatBudget:1});assert.equal(f.backend.stats.selectionFloor,150);assert.equal(f.backend.settings.selectedSplatBudget,1,'diagnostics never force a renderer budget');
  f.backend.applySettings({selectedSplatBudget:budget,lodRangeMax:7});assert.equal(f.backend.stats.selectionFloor,30);
 }finally{if(descriptor)Object.defineProperty(globalThis,'devicePixelRatio',descriptor);else delete globalThis.devicePixelRatio;f.close();}
});
