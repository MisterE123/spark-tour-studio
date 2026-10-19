import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),{PagedCollisionWriter}=require('../desktop/paged-collision.cjs');
const root=path.resolve('test-output','paged runtime '+Date.now());await fs.mkdir(path.join(root,'config'),{recursive:true});
const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.2,tileCells:40,tileSize:8,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[192,8,8]},tiles:[]};
const writer=await PagedCollisionWriter.create(root);
for(let x=0;x<24;x++){
 const coord=[x,0,0],occupied=[];for(let a=0;a<40;a++)for(let b=0;b<15;b++)for(let c=0;c<40;c++)occupied.push(collisionCellId(a,b,c,40));
 const bytes=encodeCollisionTile({coord,tileCells:40,occupied}),entry={key:coord.join(','),coord,url:`tiles/${x}_0_0.scv`,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,8),voxels:occupied.length};
 manifest.tiles.push(entry);await writer.writeTile(entry,bytes);
}
const ref=await writer.finalize(manifest),project=blankProject(),scene=newScene('a','Allowed corridor','scan.rad');scene.collider=ref;scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=[4,1.7,4];scene.viewpoints[0].rotation=[0,-Math.PI/2,0];scene.walkStart=scene.entry;const second=structuredClone(scene);second.id='b';second.name='Second corridor';project.scenes=[scene,second];project.startScene=scene.id;
await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(config|colliders)\//.test(name)||name==='scan.rad'?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page;const errors=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});const requests=[],external=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('/tiles/'))requests.push(req.url());if(/^https?:/.test(req.url())&&!req.url().startsWith(url))external.push(req.url());});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour'}).click();await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.pagedCollider?.ready);
 assert.ok(new Set(requests).size<5,'initialization loads a nearby neighborhood, not the whole scene');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);r.setMode('explore');await r.modeTransition;});
 const tick=async(n=1)=>page.evaluate(n=>{const r=window.tourRuntime;for(let i=0;i<n;i++)r.frame(r.last+20);return {position:r.rig.position.toArray(),body:r.body.translation(),mode:r.mode,tiles:r.pagedCollider.residentTiles,bytes:r.pagedCollider.residentBytes};},n);
 let state=await tick(20);assert.equal(state.mode,'explore');assert.ok(Math.abs(state.position[1]-1.7)<.1,'walk lands on the allowed-space floor');
 const permissions=await page.evaluate(()=>{const p=window.tourRuntime.pagedCollider;return {inside:p.allows({x:4,y:1,z:4},.6,.24),outside:p.allows({x:4,y:1,z:-1},.6,.24),cold:p.allows({x:100,y:1,z:4},.6,.24)};});assert.deepEqual(permissions,{inside:true,outside:false,cold:false});
 // Receiving bytes alone is insufficient: a neighbor that arrives while an
 // older surface job is pending must not be declared prepared by that job.
 await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,w=p.worker;await p.ensure({x:4,y:1.7,z:4},4);window.surfaceDelay={jobs:[],send:w.postMessage.bind(w)};w.postMessage=(...args)=>window.surfaceDelay.jobs.push(args);await p.stream.load(p.stream.entries.get('6,0,0'));await p.stream.load(p.stream.entries.get('7,0,0'));});
 await page.evaluate(()=>window.surfaceDelay.send(...window.surfaceDelay.jobs[0]));await page.waitForFunction(()=>window.surfaceDelay.jobs.length>=2);assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider.allows({x:60,y:1,z:4},.6,.24)),false,'an older worker reply cannot unlock newly arrived data');
 await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,s=window.surfaceDelay;p.worker.postMessage=s.send;for(const job of s.jobs.slice(1))s.send(...job);await p.ensure({x:60,y:1.7,z:4},4);});assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider.allows({x:60,y:1,z:4},.6,.24)),true,'only installed full-detail physics unlocks the area');
 // Keep a destination cold while the visitor reaches the edge. Unknown data
 // must stop movement; receiving its verified tile opens the same seam.
 let release;const hold=new Promise(resolve=>release=resolve);let held=false;
 await page.route('**/tiles/2_0_0.scv',async route=>{held=true;await hold;await route.continue();});
 await page.evaluate(()=>{const r=window.tourRuntime;r.rig.position.x=15;r.body.setTranslation({x:15,y:r.body.translation().y,z:4},true);r.world.step();r.setTouch(1,0);r.rig.rotation.y=0;r.pagedCollider.update(r.rig.position,r.last+1000);});
 await tick(120);state=await tick();assert.ok(state.position[0]<16,'missing next tile is solid');assert.ok(held,'nearby tiles are prefetched');release();await page.waitForFunction(()=>window.tourRuntime.pagedCollider.stream.resident.has('2,0,0'));await page.evaluate(()=>window.tourRuntime.pagedCollider.ensure({x:17,y:1.7,z:4},4));state=await tick(100);assert.ok(state.position[0]>17,'loaded neighbor removes the seam cap');assert.ok(Math.abs(state.position[1]-1.7)<.12,'no seam fall');await page.evaluate(()=>window.tourRuntime.setTouch(0,0));
 // Native author-time navigation tiles supply a route across multiple sectors.
 await page.waitForFunction(()=>window.tourRuntime.routes.ready);await page.evaluate(()=>{const r=window.tourRuntime;r.walkTo(r.rig.position.clone().set(35,0,4));});await page.waitForFunction(()=>window.tourRuntime.routes.points.length>1);const route=await page.evaluate(()=>window.tourRuntime.routes.points.map(p=>p.toArray()));assert.ok(route.at(-1)[0]>34);
 await page.evaluate(()=>{const r=window.tourRuntime;r.routes.cancel();r.setMode('fly');});await page.evaluate(()=>window.tourRuntime.modeTransition);await page.evaluate(()=>{const r=window.tourRuntime;r.setTouchLift(1);});state=await tick(100);assert.ok(state.position[1]<3,'drone cannot leave the navigable volume');await page.evaluate(()=>window.tourRuntime.setTouchLift(0));
 await page.evaluate(async()=>{const r=window.tourRuntime,p=r.pagedCollider;await p.ensure({x:4,y:1,z:4},4);await p.ensure({x:20,y:1,z:4},4);r.rig.position.set(4,1,4);r.camera.position.set(0,0,0);const w=p.worker;window.evictionDelay={jobs:[],send:w.postMessage.bind(w)};w.postMessage=(...args)=>window.evictionDelay.jobs.push(args);const old=p.stream.resident.get('1,0,0');p.stream.resident.delete('1,0,0');p.stream.bytes-=old.bytes.length;p.stream.onChange(['1,0,0']);r.pointerMove.set(16,0,0);r.frame(r.last+20);});assert.ok(Math.abs((await tick()).position[0]-4)<.01,'a large pan cannot cross an evicted tile through temporarily open seams');
 await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,s=window.evictionDelay;p.worker.postMessage=s.send;for(const job of s.jobs)s.send(...job);await p.ensure({x:4,y:1,z:4},4);});
 // Rotation around a physically offset headset keeps both the tracked head and
 // the walking capsule in the same world location, including near a boundary.
 const turn=await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('explore');await r.modeTransition;r.camera.position.set(.4,0,.2);r.rig.updateMatrixWorld(true);const head=r.camera.getWorldPosition(r.rig.position.clone()).toArray(),body={...r.body.translation()};r.turnXR(Math.PI/6);return {head,after:r.camera.getWorldPosition(r.rig.position.clone()).toArray(),body,bodyAfter:r.body.translation()};});assert.ok(Math.hypot(...turn.head.map((v,i)=>v-turn.after[i]))<1e-6);assert.deepEqual(turn.body,turn.bodyAfter);
 await page.evaluate(()=>{const r=window.tourRuntime;r.camera.position.set(0,0,0);r.showCollider(true);const scene=structuredClone(r.active);scene.colliderTransform.position=[0,.1,0];r.updateScene(scene);});await page.waitForFunction(()=>window.tourRuntime.pagedCollider.ready);assert.equal(await page.evaluate(()=>window.tourRuntime.collider.visible),true,'alignment edits preserve wireframe preference');
 // Scene changes preserve the renderer/session owner while disposing old pages.
 const switching=await page.evaluate(async()=>{const r=window.tourRuntime,renderer=r.renderer,canvas=r.renderer.domElement,previous=r.pagedCollider,session={same:true};r.renderer.xr.getSession=()=>session;await r.selectScene('b');await r.selectScene('a');return {renderer:r.renderer===renderer,canvas:r.renderer.domElement===canvas,session:r.renderer.xr.getSession()===session,disposed:previous.stream.dead,mode:r.mode,tiles:r.pagedCollider.residentTiles};});assert.deepEqual({...switching,tiles:0},{renderer:true,canvas:true,session:true,disposed:true,mode:'explore',tiles:0});assert.ok(switching.tiles<8);assert.deepEqual(external,[]);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'runtime.png')});console.log('PASS: bounded cold loading, default blocked air, walk floor/seams, streamed native routes, drone bounds, XR pivot, alignment and same-session scene cleanup. '+root);
}catch(error){console.error(error);if(page){const details={errors,text:await page.locator('body').innerText(),runtime:await page.evaluate(()=>{const r=window.tourRuntime;return {status:r?.status,mode:r?.mode,collider:r?.active?.collider,pager:!!r?.pagedCollider,resident:r?.pagedCollider?.residentTiles};})};console.error(details);await fs.writeFile(path.join(root,'failure.json'),JSON.stringify(details,null,2));await page.screenshot({path:path.join(root,'failure.png')});}throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
