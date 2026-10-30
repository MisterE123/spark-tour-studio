import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {BoxGeometry} from 'three';
import {blankProject,newScene} from '../shared/project.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),{PagedCollisionWriter}=require('../desktop/paged-collision.cjs');
const root=path.resolve('test-output','walking-camera-'+Date.now());
await fs.mkdir(path.join(root,'config'),{recursive:true});

function geometry(){
 const positions=[],indices=[];
 return {
  box(width,height,depth,x,y,z){const geometry=new BoxGeometry(width,height,depth);geometry.translate(x,y,z);const offset=positions.length/3;positions.push(...geometry.attributes.position.array);indices.push(...Array.from(geometry.index.array,index=>offset+index));geometry.dispose();},
  glb(){
   const vertices=new Float32Array(positions),faces=new Uint32Array(indices),bin=Buffer.concat([Buffer.from(vertices.buffer),Buffer.from(faces.buffer)]),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   positions.forEach((value,index)=>{const axis=index%3;min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);});
   const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:vertices.byteLength,target:34962},{buffer:0,byteOffset:vertices.byteLength,byteLength:faces.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:vertices.length/3,type:'VEC3',min,max},{bufferView:1,componentType:5125,count:faces.length,type:'SCALAR'}]},raw=Buffer.from(JSON.stringify(gltf)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);
   const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const binary=Buffer.alloc(8);binary.writeUInt32LE(bin.length);binary.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,binary,bin]);
  }
 };
}
const project=blankProject();
async function scene(id,configure,start=[-1.2,1.7,0]){
 const shape=geometry();shape.box(30,.2,24,0,-.1,0);configure(shape);await fs.writeFile(path.join(root,id+'.glb'),shape.glb());
 const scene=newScene(id,id,'scan.rad');scene.collider=id+'.glb';scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=start;scene.walkStepHeight=.5334;project.scenes.push(scene);
}
await scene('single',shape=>shape.box(8,.5,16,4,.25,0));
await scene('too-high',shape=>shape.box(8,.8,16,4,.4,0));
await scene('low-ceiling',shape=>{shape.box(8,.5,16,4,.25,0);shape.box(10,.2,8,2,1.95,0);});
await scene('stairs',shape=>{for(let i=0;i<5;i++)shape.box(i===4?8:1.4,.28*(i+1),16,i===4?9.6:.7+i*1.4,.14*(i+1),0);});
await scene('narrow',shape=>{shape.box(14,3,.1,4,1.5,-.37);shape.box(14,3,.1,4,1.5,.37);shape.box(3,.4,.64,2.5,.2,0);});
await scene('flat',()=>{});
await scene('small-voxel',shape=>shape.box(.1,.1,.1,.05,.05,0),[-.6,1.7,0]);
await scene('small-ledge',shape=>shape.box(8,.1,16,4,.05,0));
await scene('overhang-down',shape=>{shape.box(8,.5,16,-4,.25,0);shape.box(8,.2,8,4.6,1.95,0);},[-1.2,2.2,0]);

const tileCells=80,detail=.1,coord=[0,0,0],free=[];
for(let x=0;x<tileCells;x++)for(let y=x>=40?5:0;y<45;y++)for(let z=0;z<tileCells;z++)free.push(collisionCellId(x,y,z,tileCells));
const bytes=encodeCollisionTile({coord,tileCells,occupied:free}),tile={key:'0,0,0',coord,url:'tiles/0_0_0.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,8),voxels:free.length};
const writer=await PagedCollisionWriter.create(root);await writer.writeTile(tile,bytes);
const collider=await writer.finalize({format:'spark-tour-collision',version:1,representation:'allowed-space',detail,tileCells,tileSize:8,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[8,8,8]},tiles:[tile]},{stepHeight:.5334});
const paged=newScene('paged','Coarse voxel step','scan.rad');paged.collider=collider;paged.modes=['jumps','fly','explore'];paged.viewpoints[0].position=[2.8,1.7,4];paged.walkStepHeight=.5334;project.scenes.push(paged);
project.startScene='single';await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(?:config|colliders)\//.test(name)||/\.(?:rad|glb)$/.test(name)?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const errors=[],traces={},baseline=process.argv.includes('--baseline');let page;
function summary(samples){
 let maxEye=0,maxBody=0,reversals=0,previous=0;
 for(let i=1;i<samples.length;i++){const eye=samples[i].eye[1]-samples[i-1].eye[1],body=samples[i].body.y-samples[i-1].body.y;maxEye=Math.max(maxEye,Math.abs(eye));maxBody=Math.max(maxBody,Math.abs(body));if(Math.abs(body)>.0005){if(previous&&Math.sign(body)!==previous)reversals++;previous=Math.sign(body);}}
 return {frames:samples.length,start:samples[0],end:samples.at(-1),maxEyeDelta:maxEye,maxBodyDelta:maxBody,verticalReversals:reversals};
}
function log(name,stats){const {maxEyeDelta,maxBodyDelta,verticalReversals,start,end}=stats;console.log(name,JSON.stringify({maxEyeDelta,maxBodyDelta,verticalReversals,start:start.body,end:end.body,eye:end.eye}));}
try{
 page=await browser.newPage({viewport:{width:1280,height:800}});page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(30000);await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour'}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 await page.evaluate(()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);window.walkingTestRender=r.renderer.render;r.renderer.render=()=>{};});
 async function select(id,fps=60){
  await page.evaluate(async id=>{const r=window.tourRuntime;r.setTouch(0,0);r.renderer.render=window.walkingTestRender;await r.selectScene(id);},id);
  // The first-view cover now waits for real display output. Drive those frames
  // before taking deterministic movement samples with rendering disabled.
  await page.waitForFunction(()=>{const r=window.tourRuntime;r.frame(r.last+20);return r.ready&&!r.loading;});
  await page.evaluate(async()=>{const r=window.tourRuntime;r.renderer.render=()=>{};r.rig.rotation.set(0,0,0);r.camera.rotation.set(0,0,0);r.setMode('explore');await r.modeTransition;
   // Each fixture has an authored, known-clear starting floor. Place there
   // directly so mode-switch floor searches cannot move a ceiling fixture.
   const start=r.rig.position.clone().fromArray(r.active.viewpoints[0].position);start.y-=r.viewHeight;r.placeFeet(start);
  });await sample(1,[0,0],fps);
 }
 async function sample(seconds,input,fps){
  const samples=[];
  for(let batch=0;batch<Math.ceil(seconds*fps/12);batch++){
   const count=Math.min(12,Math.ceil(seconds*fps)-samples.length);
   samples.push(...await page.evaluate(({count,input,fps})=>{const r=window.tourRuntime;r.setTouch(...input);const samples=[];for(let i=0;i<count;i++){r.frame(r.last+1000/fps);r.rig.updateMatrixWorld(true);const eye=r.camera.getWorldPosition(r.rig.position.clone());samples.push({body:{...r.body.translation()},eye:eye.toArray(),motion:{x:r.walkMotion.x,z:r.walkMotion.z},verticalVelocity:r.walking?.velocityY??r.velocityY,grounded:r.walking?.grounded??r.character.computedGrounded(),input:[...input],time:r.last});}return samples;},{count,input,fps}));
   if(await page.evaluate(()=>!!window.tourRuntime.pagedCollider))await page.waitForTimeout(4);
  }
  return samples;
 }
 function verifySmooth(name,samples,fps){
  traces[name]=samples;const stats=summary(samples);log(name,stats);
  if(!baseline){assert.ok(stats.maxEyeDelta<=2.8/fps+.008,name+' camera changes smoothly instead of following the full voxel step: '+stats.maxEyeDelta);if(stats.maxBodyDelta>.15)assert.ok(stats.maxEyeDelta<stats.maxBodyDelta*.8,name+' camera actually smooths the body step');}
  return stats;
 }
 for(const fps of [30,60,120]){
  await select('single',fps);const up=verifySmooth('up-'+fps,await sample(2,[1,0],fps),fps);assert.ok(up.end.body.x>1.5&&up.end.body.y>1.3,'capsule climbs configured half-meter stair at '+fps+' fps');
  const down=verifySmooth('down-'+fps,await sample(2,[-1,0],fps),fps);assert.ok(down.end.body.x<-.5&&down.end.body.y<1,'capsule descends at '+fps+' fps');
  const settled=await sample(.6,[0,0],fps);assert.ok(Math.abs(settled.at(-1).eye[1]-settled.at(-1).body.y-.83)<.045,'visual offset settles after stairs');
 }
 for(const id of ['too-high','low-ceiling']){
  await select(id);const samples=await sample(6,[1,0],60),stats=summary(samples);traces[id]=samples;log(id,stats);assert.ok(stats.end.body.x<0,id+' blocks instead of eventually popping up');
  if(!baseline){const stuck=samples.filter(point=>point.body.x>-.34);assert.ok(stuck.length>30,id+' reaches wall');assert.ok(Math.max(...stuck.map(point=>point.body.y))-Math.min(...stuck.map(point=>point.body.y))<.035,id+' body does not jiggle against blocked obstacle');assert.ok(Math.max(...stuck.map(point=>point.eye[1]))-Math.min(...stuck.map(point=>point.eye[1]))<.035,id+' camera does not jiggle against blocked obstacle');}
 }
 for(const fps of [30,60,120])for(const id of ['small-voxel','small-ledge']){
  await select(id,fps);await page.evaluate(()=>window.tourRuntime.setStepHeight(1));const samples=await sample(2,[1,0],fps),stats=summary(samples),name=id+'-'+fps;traces[name]=samples;log(name,stats);if(!baseline){assert.ok(stats.end.body.x>1.5,name+' does not stall with a 1 m step setting');assert.ok(stats.maxEyeDelta<2.8/fps+.008,name+' eye does not jiggle when crossing one 10 cm voxel');}
 }
 await select('stairs');const stairs=verifySmooth('diagonal-stairs',await sample(4.5,[1,.22],60),60);if(!baseline)assert.ok(stairs.end.body.x>6&&stairs.end.body.y>2,'consecutive diagonal risers remain climbable');
 const stairDescent=verifySmooth('diagonal-stairs-down',await sample(4.5,[-1,-.22],60),60);assert.ok(stairDescent.end.body.y<1,'consecutive stair descent returns to ground');
 await select('narrow');const narrowSamples=await sample(3,[1,0],60),narrow=verifySmooth('narrow',narrowSamples,60);assert.ok(narrow.end.body.x>2&&narrowSamples.some(point=>point.body.x>2&&point.body.y>1.2),'narrow passable corridor remains usable');
 await select('single');await page.waitForFunction(()=>window.tourRuntime.routes.ready);await page.evaluate(()=>{const r=window.tourRuntime;r.walkTo(r.rig.position.clone().set(2,.5,0));});await page.waitForFunction(()=>window.tourRuntime.routes.points.length>1);const route=verifySmooth('pathfinding-step',await sample(3.4,[0,0],60),60);assert.ok(route.end.body.x>1.7&&route.end.body.y>1.3,'click-to-walk climbs the stair without going underground');
 await select('single');await page.evaluate(()=>{const r=window.tourRuntime;r.placeFeet(r.rig.position.clone().set(-.12,.5,0));});const corner=await sample(2,[0,0],60);traces['rounded-edge-support']=corner;if(!baseline){const resting=corner.slice(60),last=resting.at(-1);assert.ok(last.body.y>1.2&&last.grounded,'rounded capsule footprint remains supported at a grazing ledge edge');assert.ok(Math.abs(last.verticalVelocity)<.05,'standing at a ledge edge cannot accumulate falling velocity');assert.ok(Math.max(...resting.map(point=>point.eye[1]))-Math.min(...resting.map(point=>point.eye[1]))<.025,'grazing ledge support settles without camera oscillation');}
 await select('overhang-down');await page.evaluate(()=>{const r=window.tourRuntime,cast=r.world.castShape.bind(r.world);r.speed=6;window.overhangCast=r.world.castShape;window.overhangHead=undefined;window.overhangClamps=0;r.world.castShape=(...args)=>{const head=args[3]?.radius===.095;if(head)window.overhangHead=args[3];const hit=cast(...args);if(head&&hit)window.overhangClamps++;return hit;};});
 const overhang=[];
 for(let batch=0;batch<8;batch++)overhang.push(...await page.evaluate(()=>{const r=window.tourRuntime,records=[],identity={x:0,y:0,z:0,w:1};r.setTouch(1,0);for(let i=0;i<12;i++){r.frame(r.last+1000/60);r.rig.updateMatrixWorld(true);const eye=r.camera.getWorldPosition(r.rig.position.clone()),body={...r.body.translation()},head=window.overhangHead;records.push({body,eye:eye.toArray(),motion:{x:r.walkMotion.x,z:r.walkMotion.z},verticalVelocity:r.walking?.velocityY??r.velocityY,grounded:r.walking?.grounded??r.character.computedGrounded(),input:[1,0],time:r.last,headChecked:!!head,clamps:window.overhangClamps,headBlocked:head?!!r.world.intersectionWithShape(eye,identity,head,undefined,undefined,r.capsule):!!r.world.castRay({origin:eye,dir:{x:0,y:1,z:0}},.001,true,undefined,undefined,r.capsule),bodyBlocked:!!r.world.intersectionWithShape(body,identity,r.capsule.shape,undefined,undefined,r.capsule)});}return records;}));
 await page.evaluate(()=>{const r=window.tourRuntime;r.world.castShape=window.overhangCast;r.speed=2;delete window.overhangCast;delete window.overhangHead;delete window.overhangClamps;});traces['overhang-down']=overhang;const under=overhang.at(-1);console.log('overhang-down',JSON.stringify({clamps:under.clamps,end:under.body}));assert.ok(under.body.x>1&&under.body.y<1,'a valid 1.85 m overhang remains traversable after the half-meter descent');
 if(!baseline){assert.ok(overhang.some(point=>point.headChecked&&Math.abs(point.eye[1]-point.body.y-.83)>.02),'overhang fixture exercises actual smoothing and the runtime head probe');assert.ok(under.clamps>0,'overhang fixture actually forces collision correction to override camera smoothing');assert.ok(overhang.every(point=>!point.headBlocked),'visual head stays clear of the overhang while descending; collision correction may override the smoothing speed limit');assert.ok(overhang.every(point=>!point.bodyBlocked),'physical capsule stays clear of the overhang throughout descent');}
 await select('flat');const standing=(await sample(.1,[0,0],60)).at(-1);await page.evaluate(()=>window.tourRuntime.setTouchCrouch(true));const crouching=await sample(.3,[0,0],60);traces.crouching=crouching;assert.ok(Math.abs(standing.eye[1]-crouching.at(-1).eye[1]-.6)<.025,'crouch deliberately lowers the desktop eye by 0.6 m');await page.evaluate(()=>window.tourRuntime.setTouchCrouch(false));const upright=(await sample(.3,[0,0],60)).at(-1);assert.ok(Math.abs(upright.eye[1]-standing.eye[1])<.025,'standing restores the eye without leaving smoothing lag');
 await page.evaluate(()=>window.tourRuntime.requestJump());const jump=await sample(.85,[0,0],60);traces.jump=jump;const apex=Math.max(...jump.map(point=>point.body.y));assert.ok(apex>1.7,'manual jump remains physical');if(!baseline){for(let i=1;i<jump.length;i++)if(!jump[i].grounded&&!jump[i-1].grounded)assert.ok(Math.abs((jump[i].eye[1]-jump[i-1].eye[1])-(jump[i].body.y-jump[i-1].body.y))<.006,'airborne camera follows physical jump instead of floating');}
 await select('paged');const voxel=verifySmooth('paged-up',await sample(2,[1,0],60),60);assert.ok(voxel.end.body.x>4.5&&voxel.end.body.y>1.3,'exact paged voxel step remains climbable');verifySmooth('paged-down',await sample(2,[-1,0],60),60);
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'traces.json'),JSON.stringify(traces));await fs.writeFile(path.join(root,'summary.json'),JSON.stringify(Object.fromEntries(Object.entries(traces).map(([name,samples])=>[name,summary(samples)])),null,2));console.log((baseline?'BASELINE RECORDED':'PASS')+': per-frame GLB and paged walking traces, 30/60/120 fps step smoothing, up/down stairs, blocked tall/low-clearance geometry, diagonal consecutive risers, narrow corridor and physical jump. '+root);
}catch(error){await fs.writeFile(path.join(root,'traces.json'),JSON.stringify(traces));if(page){await page.screenshot({path:path.join(root,'failure.png')});console.error(await page.evaluate(()=>{const r=window.tourRuntime;return {scene:r?.active?.id,mode:r?.mode,status:r?.status,body:r?.body?.translation(),eye:r?.rig?.position?.toArray(),routeError:r?.routes?.error};}));}throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
