import assert from 'node:assert/strict';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import test from 'node:test';
import {build} from 'esbuild';
import Rapier from '@dimforge/rapier3d-compat';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as THREE from 'three';

const root=path.resolve('test-output');
await mkdir(root,{recursive:true});
const output=await mkdtemp(path.join(root,'radix-bubble-occlusion-unit-'));
test.after(()=>rm(output,{recursive:true,force:true}));
const outfile=path.join(output,'bubble.mjs');
await build({stdin:{resolveDir:process.cwd(),contents:`
 export {TourRuntime} from './src/runtime.ts';
 export {ProjectBubbleSettings,SceneBubbleSettingsEditor} from './src/bubble-settings.tsx';
 export {initializePhysics} from './shared/physics.mjs';
`},outfile,bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'silent',plugins:[{name:'unused-browser-url',setup(builder){
 builder.onResolve({filter:/\?url&no-inline$/},args=>({path:args.path,namespace:'browser-url'}));
 builder.onLoad({filter:/.*/,namespace:'browser-url'},()=>({contents:'export default "unused-browser-url";'}));
}}]});
const bitmap=Object.getOwnPropertyDescriptor(globalThis,'ImageBitmap');
Object.defineProperty(globalThis,'ImageBitmap',{configurable:true,value:class ImageBitmap{}});
let loaded;
try{loaded=await import(pathToFileURL(outfile).href);}
finally{if(bitmap)Object.defineProperty(globalThis,'ImageBitmap',bitmap);else delete globalThis.ImageBitmap;}
const {TourRuntime,ProjectBubbleSettings,SceneBubbleSettingsEditor,initializePhysics}=loaded;

test('bubble settings describe when collision geometry can hide bubbles',()=>{
 const project={bubbles:{occlusion:true}};
 const render=scene=>renderToStaticMarkup(React.createElement(SceneBubbleSettingsEditor,{project,scene,onChange(){}}));
 const tour=renderToStaticMarkup(React.createElement(ProjectBubbleSettings,{project,change(){}}));
 assert.match(tour,/Hide bubbles behind collision geometry/);
 assert.match(tour,/Available in Walk or Drone/);
 assert.match(render({modes:['jumps'],collider:'wall.glb'}),/This scene uses Viewpoints only/);
 assert.match(render({modes:['jumps','fly'],collider:''}),/This scene has no collision geometry/);
 assert.match(render({modes:['explore','fly'],collider:'wall.glb'}),/Available in Walk or Drone/);
});

test('bubble visibility uses the current collision world only in Walk or Drone',async()=>{
 const engine=await initializePhysics(Rapier),world=new engine.World({x:0,y:0,z:0});
 world.createCollider(engine.ColliderDesc.cuboid(2,2,.1).setTranslation(0,0,-5));
 world.step();
 const originalCast=world.castRay.bind(world);
 let collisionRays=0,splatRays=0;
 world.castRay=(...args)=>{collisionRays++;return originalCast(...args);};
 const bubbles=new THREE.Group(),bubble=new THREE.Mesh(new THREE.CircleGeometry(.2),new THREE.MeshBasicMaterial()),eye=new THREE.Vector3();
 bubble.position.z=-10;bubbles.add(bubble);
 const runtime=Object.assign(Object.create(TourRuntime.prototype),{
  bubbles,camera:new THREE.PerspectiveCamera(),world,collider:new THREE.Group(),colliderSource:'wall.glb',
  project:{bubbles:{occlusion:true}},active:{collider:'wall.glb'},mesh:{raycast(){splatRays++;}},
  walking:{reset(){}},walkCamera:{reset(){}},routes:{dispose(){}}
 });
 runtime.mode='jumps';
 const visibility=()=>runtime.updateBubbleVisibility(bubble,eye).appearance;
 const probe=time=>runtime.updateBubbleOcclusion(eye,time);
 try{
  probe(200);probe(400);
  assert.equal(collisionRays,0,'Viewpoints makes no occlusion probes even with retained physics');
  assert.equal(visibility().interactive,true);

  runtime.mode='fly';probe(600);
  assert.equal(visibility().interactive,true,'one blocked check does not hide the bubble');
  probe(800);
  assert.equal(visibility().interactive,false);
  assert.equal(bubble.visible,false);
  assert.equal(collisionRays,8,'the real wall blocks center and rim rays twice');
  probe(810);
  assert.equal(collisionRays,8,'stationary results stay cached between checks');
  runtime.editing=true;runtime.selected=bubble;
  assert.equal(visibility().interactive,true,'the selected authoring bubble stays visible');
  runtime.editing=false;runtime.selected=undefined;

  runtime.mode='jumps';probe(1000);
  assert.equal(visibility().interactive,true,'switching to Viewpoints immediately reveals the bubble');
  assert.equal(collisionRays,8);
  runtime.mode='explore';probe(1200);
  assert.equal(visibility().interactive,true,'Walk starts with fresh evidence');
  probe(1400);assert.equal(visibility().interactive,false);

  runtime.colliderLoading=true;probe(1600);
  assert.equal(visibility().interactive,true,'a loading collider cannot hide a bubble');
  runtime.colliderLoading=false;runtime.active={collider:'replacement.glb'};probe(1800);
  assert.equal(visibility().interactive,true,'a superseded collider cannot leave the bubble hidden');
  assert.equal(collisionRays,16);
  runtime.clearPhysics();
  runtime.active={collider:''};probe(2000);
  assert.equal(visibility().interactive,true,'a splat-only scene keeps the bubble interactive');
  assert.equal(splatRays,0,'sampled splats are never used for occlusion');
 }finally{
  if(runtime.world)runtime.clearPhysics();
  bubble.geometry.dispose();bubble.material.dispose();
 }
});
