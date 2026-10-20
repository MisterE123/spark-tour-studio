import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry} from 'three';
import {physicalWalkingPath} from '../shared/walking-route.mjs';
import {buildNavigation,NavigationRefinements,navigationClimb,walkingRibbonSamples,walkingPathLength,refinedNavigationPath} from '../shared/navigation.mjs';
import {bakeNavigationSector,createPagedNavigation} from '../shared/paged-navigation.mjs';
import {DEFAULT_STEP_HEIGHT} from '../shared/walking.mjs';
import {transform} from 'esbuild';
import {readFile} from 'node:fs/promises';

function stair(height){const boxes=[new BoxGeometry(12,.2,8),new BoxGeometry(6,height+.2,8)];boxes[0].translate(0,-.1,0);boxes[1].translate(3,(height-.2)/2,0);const positions=[],indices=[];for(const box of boxes){const offset=positions.length/3;positions.push(...box.attributes.position.array);indices.push(...Array.from(box.index.array,value=>value+offset));box.dispose();}return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};}

test('walking routes and local refinements honor the configured world-meter step height',async()=>{
 assert.equal(DEFAULT_STEP_HEIGHT,.5334);assert.equal(navigationClimb(),10);assert.equal(navigationClimb(0),0);assert.throws(()=>navigationClimb(-1),/step/);
 for(const [height,stepHeight,allowed] of [[.5,DEFAULT_STEP_HEIGHT,true],[.6,DEFAULT_STEP_HEIGHT,false],[.3,.2,false],[.2,.2,true],[.2,0,false]]){
  const part=stair(height),nav=await buildNavigation(part.positions,part.indices,undefined,{stepHeight}),fine=new NavigationRefinements(part.positions,part.indices,{stepHeight}),start={x:-3,y:0,z:0},end={x:3,y:height,z:0};
  try{if(allowed){const route=nav.path(start,end);assert.ok(route.length>3);assert.ok(route.at(-1).x>2.9);assert.ok(route.some(point=>point.x<-.2&&point.y<.15));assert.ok(route.some(point=>point.x>.2&&point.y>height));assert.ok((await fine.path(start,end)).at(-1).x>2.9);}else{assert.throws(()=>nav.path(start,end),/route/);await assert.rejects(fine.path(start,end),/route/);}}finally{nav.dispose();fine.dispose();}
 }
});

test('new paged walking tiles use the same configurable climb limits',async()=>{
 for(const [height,stepHeight,allowed] of [[.5,DEFAULT_STEP_HEIGHT,true],[.6,DEFAULT_STEP_HEIGHT,false],[.3,.2,false]]){
  const part=stair(height);for(let i=0;i<part.positions.length;i+=3){part.positions[i]+=4;part.positions[i+2]+=4;}const options={coord:[0,0],tileSize:8,bounds:{min:[-2,-1,0],max:[10,4,8]},stepHeight},data=await bakeNavigationSector([part],options),nav=await createPagedNavigation({tileSize:8,origin:[0,-1.5,0]});
  try{nav.sync([{key:'0,0',data}]);const start={x:1,y:0,z:4},end={x:7,y:height,z:4};if(allowed)assert.ok(nav.path(start,end).at(-1).x>6.9);else assert.throws(()=>nav.path(start,end),/route/);}finally{nav.dispose();}
 }
});

test('navigation never snaps a clicked surface through the ground to another floor',async()=>{
 const floor=new BoxGeometry(12,.2,8);floor.translate(0,-.1,0);const nav=await buildNavigation(floor.attributes.position.array,new Uint32Array(floor.index.array));floor.dispose();try{assert.ok(nav.path({x:-3,y:0,z:0},{x:3,y:0,z:0}).length>2);assert.throws(()=>nav.path({x:-3,y:0,z:0},{x:3,y:1.5,z:0}),/surface/);assert.throws(()=>nav.path({x:-3,y:1.5,z:0},{x:3,y:0,z:0}),/surface/);}finally{nav.dispose();}
});

test('walking path display preserves the height of each surface segment',()=>{
 const points=[{x:0,y:0,z:0},{x:1,y:0,z:0},{x:1,y:.5,z:0},{x:2,y:.5,z:1},{x:2,y:0,z:2},{x:3,y:0,z:2}],samples=walkingRibbonSamples(points);
 assert.ok(samples.length>points.length);for(const sample of samples){assert.ok(sample.y>=0&&sample.y<=.5);if(sample.x<1)assert.equal(sample.y,0);if(sample.x>2)assert.equal(sample.y,0);}assert.deepEqual(samples.at(-1),points.at(-1));
});

test('navigation cache invalidates on changed step height and hashes typed-array slices correctly',async()=>{
 const entry=new URL('../src/navigation-cache.ts',import.meta.url),source=(await readFile(entry,'utf8')).replace("'../shared/walking.mjs'",JSON.stringify(new URL('../shared/walking.mjs',import.meta.url).href)),compiled=await transform(source,{loader:'ts',format:'esm'}),{navigationKey}=await import('data:text/javascript;base64,'+Buffer.from(compiled.code).toString('base64'));
 const part=stair(.5),key=await navigationKey(part.positions,part.indices);assert.equal(key,await navigationKey(part.positions,part.indices,{stepHeight:DEFAULT_STEP_HEIGHT}));assert.notEqual(key,await navigationKey(part.positions,part.indices,{stepHeight:.2}));assert.notEqual(key,await navigationKey(part.positions,part.indices,{stepHeight:0}));const backing=new Float32Array(part.positions.length+4);backing.set(part.positions,2);const slice=backing.subarray(2,2+part.positions.length);assert.equal(key,await navigationKey(slice,part.indices));backing[0]=999;assert.equal(key,await navigationKey(slice,part.indices));
});

test('a successful long detour is reconsidered using the active step limit',async()=>{
 const floor=new BoxGeometry(20,.2,20);floor.translate(0,-.1,0);const bump=new BoxGeometry(1,.4,10);bump.translate(0,.2,0);
 const positions=new Float32Array([...floor.attributes.position.array,...bump.attributes.position.array]),indices=new Uint32Array([...floor.index.array,...Array.from(bump.index.array,n=>n+floor.attributes.position.count)]);floor.dispose();bump.dispose();
 const start={x:-3,y:0,z:0},end={x:3,y:0,z:0},old=await buildNavigation(positions,indices,undefined,{stepHeight:.25}),fine=new NavigationRefinements(positions,indices,{stepHeight:.5334}),low=new NavigationRefinements(positions,indices,{stepHeight:.1});
 try{const detour=old.path(start,end),short=await refinedNavigationPath(old,fine,start,end),blocked=await refinedNavigationPath(old,low,start,end);
 assert.ok(walkingPathLength(detour)>12);assert.ok(walkingPathLength(short)<walkingPathLength(detour)*.7);assert.ok(short.some(p=>p.y>.3));const physical=await physicalWalkingPath([{positions,indices}],start,end,undefined,.5334);assert.ok(physical&&physical.some(p=>p.y>.3),'the actual walking motor steps over this ridge without jumping');assert.equal(await physicalWalkingPath([{positions,indices}],start,end,undefined,.25),null,'the lower automatic step limit remains a barrier');assert.ok(walkingPathLength(blocked)>12,'lower step limit still detours');
 }finally{old.dispose();fine.dispose();low.dispose();}
});
test('failed or longer refinement retains a valid coarse corridor',async()=>{
 const start={x:0,y:0,z:0},end={x:4,y:0,z:0},route=[start,{x:0,y:0,z:5},{x:4,y:0,z:5},end],nav={path:()=>route};
 assert.equal(await refinedNavigationPath(nav,{path:async()=>{throw Error('No route');}},start,end),route);
 assert.equal(await refinedNavigationPath(nav,{path:async()=>[start,{x:0,y:0,z:20},end]},start,end),route);
});

test('physical shortcuts do not substitute a large drop for normal automatic steps',async()=>{
 for(const height of [.4,.8]){const part=stair(height),route=await physicalWalkingPath([part],{x:3,y:height,z:0},{x:-3,y:0,z:0},undefined,.5334);if(height<.5334)assert.ok(route);else assert.equal(route,null);}
});
