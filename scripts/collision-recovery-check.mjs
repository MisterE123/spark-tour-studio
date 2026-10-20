import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),{PagedCollisionWriter}=require('../desktop/paged-collision.cjs');
const root=path.resolve('test-output','collision recovery '+Date.now());await fs.mkdir(path.join(root,'config'),{recursive:true});
const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.2,tileCells:40,tileSize:8,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[24,8,8]},tiles:[]};
const writer=await PagedCollisionWriter.create(root);
for(let x=0;x<3;x++){
 const coord=[x,0,0],occupied=[];for(let a=0;a<40;a++)for(let b=0;b<15;b++)for(let c=0;c<40;c++)occupied.push(collisionCellId(a,b,c,40));
 const bytes=encodeCollisionTile({coord,tileCells:40,occupied}),entry={key:coord.join(','),coord,url:`tiles/${x}_0_0.scv`,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,8),voxels:occupied.length};manifest.tiles.push(entry);await writer.writeTile(entry,bytes);
}
const ref=await writer.finalize(manifest),project=blankProject(),scene=newScene('a','Collision recovery','scan.rad');scene.collider=ref;scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=[4,1.7,4];scene.walkStart=scene.entry;
const disabled=structuredClone(scene);disabled.id='no-views';disabled.name='No viewpoint movement';disabled.modes=['fly','explore'];disabled.viewpoints[0].autoAnimate=true;disabled.viewpoints[0].type='orbit';disabled.viewpoints[0].orbit={center:[4,0,4],radius:4};project.scenes=[scene,disabled];project.startScene='a';
await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(config|colliders)\//.test(name)||name==='scan.rad'?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let page,unblockLate=()=>{};const errors=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));let fail=true,failedRequests=0;const requests=[];page.on('request',request=>{if(request.url().includes('/colliders/'))requests.push(request.url());});
 await page.route('**/tiles/1_0_0.scv',route=>{failedRequests++;return fail?route.fulfill({status:404,body:'Missing collision tile'}):route.continue();});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour'}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 assert.equal(requests.length,0,'viewpoint mode must not request collision manifest, physics pages or walking tiles');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('explore');await r.modeTransition;});await page.waitForFunction(()=>window.tourRuntime.pagedCollider?.ready);
 const snapshot=()=>page.evaluate(()=>{const r=window.tourRuntime,p=r.pagedCollider,body=r.body.translation();return {ready:r.ready,status:r.status,mode:r.mode,current:p.allows(body,.6,.24),destination:p.allows({x:12,y:.9,z:4},.6,.24),chunks:p.physicsChunks};});
 const initial=await snapshot();assert.ok(initial.ready&&initial.current);assert.equal(initial.mode,'explore');
 // Aim a real controller trigger across an unloaded Rapier seam. A missing tile
 // must leave the current floor intact rather than failing the entire scene.
 await page.evaluate(()=>{const r=window.tourRuntime,xr=r.renderer.xr;r.renderer.setAnimationLoop(null);window.recoveryXR={isPresenting:xr.isPresenting,getSession:xr.getSession,getCamera:xr.getCamera,updateCamera:xr.updateCamera,render:r.renderer.render};window.recoverySession={inputSources:[],end(){throw Error('Collision retry must not end XR');}};xr.isPresenting=true;r.rig.position.y-=1.7;r.camera.position.y=1.7;xr.getSession=()=>window.recoverySession;xr.getCamera=()=>r.camera;xr.updateCamera=()=>{};r.renderer.render=()=>{};window.recoveryRenderer=r.renderer;window.recoveryScene=r.active;r.menuOpen=false;r.blocked=false;const c=r.controllers[0];c.matrixAutoUpdate=true;c.visible=true;c.position.copy(r.rig.worldToLocal(r.camera.getWorldPosition(r.rig.position.clone())));c.lookAt(r.rig.position.clone().set(12,0,4));c.rotateY(Math.PI);c.updateWorldMatrix(true,false);c.dispatchEvent({type:'selectstart'});});
 await page.waitForFunction(()=>window.tourRuntime.pagedCollider.stream.failures.has('1,0,0'));
 const failed=await snapshot();assert.ok(failed.ready&&failed.current&&failed.chunks>0);assert.equal(failed.destination,false);assert.equal(failed.status,'');assert.equal(failedRequests,1);
 await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider;for(let i=0;i<5;i++)await p.ensure({x:4,y:1.7,z:4},4);});assert.equal(failedRequests,1,'frame refresh must not repeatedly download missing data');
 // Hold the trigger during repair. The aim retries without a scene/session reload
 // and becomes a valid far-floor target once verified physics is installed.
 fail=false;await page.waitForFunction(()=>{const r=window.tourRuntime;r.frame(r.last+100);return r.teleportPoint?.x>11.9;},{},{timeout:12000});
 const recovered=await snapshot();assert.ok(recovered.ready&&recovered.current&&recovered.destination);assert.ok(failedRequests>=2&&failedRequests<=3);
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return r.renderer===window.recoveryRenderer&&r.active===window.recoveryScene&&r.renderer.xr.getSession()===window.recoverySession;}),'collision repair preserves scene, renderer and session');
 await page.evaluate(()=>{const r=window.tourRuntime;r.controllers[0].dispatchEvent({type:'selectend'});});assert.ok(await page.evaluate(()=>Math.abs(window.tourRuntime.rig.position.x-12)<.05),'trigger release teleports across the cold seam onto the verified destination');
 // A delayed reply after trigger release must not move the visitor or retain a
 // destination lease. Cancellation keeps the just-reached standing floor safe.
 let release;const hold=new Promise(resolve=>release=resolve);unblockLate=release;let held=false;await page.route('**/tiles/2_0_0.scv',async route=>{held=true;await hold;await route.continue();});
 await page.evaluate(()=>{const r=window.tourRuntime,c=r.controllers[0];c.position.copy(r.rig.worldToLocal(r.camera.getWorldPosition(r.rig.position.clone())));c.lookAt(r.rig.position.clone().set(20,0,4));c.rotateY(Math.PI);c.updateWorldMatrix(true,false);c.dispatchEvent({type:'selectstart'});});
 await page.waitForFunction(()=>{const r=window.tourRuntime;r.frame(r.last+100);return r.teleportAimPending;});for(let i=0;i<100&&!held;i++)await page.waitForTimeout(10);assert.ok(held);
 const aimChange=await page.evaluate(()=>{const r=window.tourRuntime,c=r.controllers[0],aim=r.teleportAim;c.rotateY(.003);c.updateWorldMatrix(true,false);r.updateTeleport();const tremorPreserved=r.teleportAim===aim;c.rotateY(.12);c.updateWorldMatrix(true,false);r.updateTeleport();return {tremorPreserved,deliberateChanged:r.teleportAim!==aim};});assert.deepEqual(aimChange,{tremorPreserved:true,deliberateChanged:true},'normal tremor retains cold aim while deliberate rotation invalidates it');
 await page.evaluate(()=>window.tourRuntime.controllers[0].dispatchEvent({type:'selectend'}));release();await page.waitForFunction(()=>!window.tourRuntime.teleportAimPending);assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return Math.abs(r.rig.position.x-12)<.05&&!r.teleportLease&&!r.teleportPoint&&r.pagedCollider.allows(r.body.translation(),.6,.24);}), 'stale aim cannot teleport after release or remove current support');
 await page.evaluate(()=>{const r=window.tourRuntime,s=window.recoveryXR;r.renderer.xr.isPresenting=s.isPresenting;r.renderer.xr.getSession=s.getSession;r.renderer.xr.getCamera=s.getCamera;r.renderer.xr.updateCamera=s.updateCamera;r.renderer.render=s.render;r.camera.position.y=0;r.rig.position.y+=1.7;r.renderer.setAnimationLoop(t=>r.frame(t));});
 // Entering a scene with viewpoint mode disabled may use its entry camera pose,
 // but must never attach an orbit controller or start authored animation.
 await page.evaluate(()=>window.tourRuntime.selectScene('no-views'));await page.waitForFunction(()=>window.tourRuntime?.ready);assert.deepEqual(await page.evaluate(()=>{const r=window.tourRuntime;return {mode:r.mode,navigator:!!r.navigator};}),{mode:'explore',navigator:false});
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'recovered.png')});await fs.writeFile(path.join(root,'result.json'),JSON.stringify({initial,failed,recovered,failedRequests,errors},null,2));console.log('PASS viewpoint collision isolation, actual trigger cold-floor targeting/404/retry/teleport, fail-closed support, stale-aim cancellation, unchanged scene/session and disabled viewpoint mode. '+root);
}catch(error){console.error(error);if(page){await page.screenshot({path:path.join(root,'failure.png')});console.error(await page.evaluate(()=>{const r=window.tourRuntime;return {body:document.body.innerText,status:r?.status,mode:r?.mode,ready:r?.ready,pages:r?.pagedCollider?.residentTiles,aim:r?.teleportAim,pending:r?.teleportAimPending,point:r?.teleportPoint,rig:r?.rig.position.toArray(),camera:r?.camera.position.toArray(),controller:r?.controllers[0].position.toArray(),ray:r?.ray.ray};}));}throw error;}finally{unblockLate();await browser.close();await new Promise(resolve=>server.close(resolve));}
