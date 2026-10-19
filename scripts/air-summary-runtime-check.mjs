import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256,validatePagedCollisionManifest} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const root=path.resolve('test-output','certified air runtime '+Date.now());
await fs.mkdir(path.join(root,'config'),{recursive:true});
await fs.mkdir(path.join(root,'colliders/tiles'),{recursive:true});

// This certificate replaces 256^3 (16,777,216) leaf payloads. The separate
// mixed tile has a real wall and must still follow the full preparation gate.
const coord=[256,0,0],occupied=[];
for(let x=0;x<160;x++)for(let y=0;y<60;y++)for(let z=0;z<160;z++)if(x!==80)occupied.push(collisionCellId(x,y,z,160));
const bytes=encodeCollisionTile({coord,tileCells:160,occupied});
const manifest=validatePagedCollisionManifest({
 format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.05,tileCells:160,tileSize:8,coordinateSystem:'generation',
 sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[2064,2048,2048]},
 airNodes:[{coord:[0,0,0],level:8}],
 tiles:[{key:coord.join(','),coord,url:'tiles/256_0_0.scv',bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,8),voxels:occupied.length}],
});
await fs.writeFile(path.join(root,'colliders/scene.collision.json'),JSON.stringify(manifest));
await fs.writeFile(path.join(root,'colliders/tiles/256_0_0.scv'),bytes);
const project=blankProject(),scene=newScene('air','Large certified-air domain','scan.rad');
scene.collider='colliders/scene.collision.json';scene.modes=['fly','explore'];scene.viewpoints[0].position=[4,1.7,4];
project.scenes=[scene];project.startScene=scene.id;
await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);
await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));
await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(config|colliders)\//.test(name)||name==='scan.rad'?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page,releaseMixed;const errors=[],payloads=[],external=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(30000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/tiles/'))payloads.push(request.url());if(/^https?:/.test(request.url())&&!request.url().startsWith(url))external.push(request.url());});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour'}).click();
 await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.pagedCollider?.ready);
 await page.evaluate(()=>window.tourRuntime.renderer.setAnimationLoop(null));
 assert.deepEqual(payloads,[],'a certified-air start needs no leaf payload downloads');

 await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('explore');await r.modeTransition;r.rig.rotation.y=0;});
 const tick=async(count)=>page.evaluate(async count=>{const r=window.tourRuntime;for(let i=0;i<count;i++){r.frame(r.last+20);if(i%10===9)await r.pagedCollider.ensure(r.camera.getWorldPosition(r.rig.position.clone()),4);}return {mode:r.mode,position:r.rig.position.toArray()};},count);
 let walking=await tick(20);assert.equal(walking.mode,'explore');assert.ok(Math.abs(walking.position[1]-1.7)<.12,'certified air retains its domain floor');
 await page.evaluate(()=>window.tourRuntime.setTouch(1,0));walking=await tick(200);
 assert.ok(walking.position[0]>8,'walking crosses the internal air-page seam');
 assert.ok(Math.abs(walking.position[1]-1.7)<.12,'walking does not fall through the air-page seam');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.setTouch(0,0);r.setMode('fly');await r.modeTransition;});
 assert.deepEqual(payloads,[],'walking across certified-air pages needs no leaf downloads');

 const proof=await page.evaluate(()=>{
  const p=window.tourRuntime.pagedCollider,s=p.stream,started=performance.now();let allowed=true;
  // A diagonal capsule's bounding box spans millions of leaf tiles. Its
  // exact all-air parent should answer without visiting those leaves.
  for(let i=0;i<20;i++)allowed&&=s.allowsCapsule([4,4,4],[2000,2000,2000],.24);
  return {allowed,ms:performance.now()-started,stats:s.lastCapsuleQuery,
   inside:p.allows({x:1000,y:1000,z:1000},.6,.24),
   outside:p.allows({x:-1,y:1,z:4},.6,.24),
   missing:p.allows({x:2060,y:1,z:4},.6,.24),
   mixed:p.allows({x:2050,y:1,z:4},.6,.24)};
 });
 assert.equal(proof.allowed,true,'the exact air-parent proof makes the whole interior navigable');
 assert.ok(proof.ms<1000,`twenty enormous air queries must not enumerate leaves (${proof.ms} ms)`);
 assert.ok((proof.stats?.tiles??0)<1024,'the hierarchy skips a fully certified subtree');
 assert.deepEqual({inside:proof.inside,outside:proof.outside,missing:proof.missing,mixed:proof.mixed},{inside:true,outside:false,missing:false,mixed:false});

 const residency=await page.evaluate(async()=>{
  const p=window.tourRuntime.pagedCollider,started=performance.now();let peakTiles=p.residentTiles,peakBytes=p.residentBytes,peakChunks=p.residentChunks,peakTriangles=0;
  for(let i=0;i<24;i++){
   await p.ensure({x:32+i*64,y:16,z:32+i*32},4);
   peakTiles=Math.max(peakTiles,p.residentTiles);peakBytes=Math.max(peakBytes,p.residentBytes);peakChunks=Math.max(peakChunks,p.residentChunks);
   peakTriangles=Math.max(peakTriangles,[...p.surfaces.values()].reduce((sum,surface)=>sum+surface.triangles,0));
  }
  return {peakTiles,peakBytes,peakChunks,peakTriangles,ms:performance.now()-started};
 });
 assert.deepEqual(payloads,[],'moving within certified air never requests its omitted leaves');
 assert.ok(residency.peakTiles<=64,'virtual physics neighborhoods retain the tile budget');
 assert.ok(residency.peakBytes<=64*48,'air leaves stay in their compact representation');
 assert.ok(residency.peakChunks<=2048,'local physics chunks remain bounded independently of raw pages');
 assert.ok(residency.peakTriangles<=128,'interior certified neighbors do not produce artificial wall geometry');
 assert.ok(residency.ms<8000,`high-resolution empty physics should skip per-cell surface work (${residency.ms} ms)`);

 let markRequested;const mixedRequested=new Promise(resolve=>markRequested=resolve),mixedHold=new Promise(resolve=>releaseMixed=resolve);
 await page.route('**/tiles/256_0_0.scv',async route=>{markRequested();await mixedHold;await route.continue();});
 await page.evaluate(()=>{
  const r=window.tourRuntime,p=r.pagedCollider,w=p.worker;p.focus(r.camera.getWorldPosition(r.rig.position.clone()));
  window.surfaceDelay={jobs:[],send:w.postMessage.bind(w)};w.postMessage=(...args)=>window.surfaceDelay.jobs.push(args);
  window.mixedPrepare=p.prepare({x:2050,y:1.7,z:4},4);
 });
 await Promise.race([mixedRequested,page.waitForTimeout(30000).then(()=>{throw Error('The mixed collision page was not requested.');})]);
 assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider.allows({x:2050,y:1,z:4},.6,.24)),false,'unloaded mixed space remains blocked beside certified air');
 releaseMixed();await page.waitForFunction(()=>window.tourRuntime.pagedCollider.stream.resident.has('256,0,0')&&window.surfaceDelay.jobs.length>0);
 assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider.allows({x:2050,y:1,z:4},.6,.24)),false,'receiving mixed bytes cannot bypass physics installation');
 await page.evaluate(async()=>{
  const p=window.tourRuntime.pagedCollider,s=window.surfaceDelay;p.worker.postMessage=s.send;for(const job of s.jobs)s.send(...job);
  window.mixedLease=await window.mixedPrepare;
 });
 const mixed=await page.evaluate(()=>{
  const p=window.tourRuntime.pagedCollider;return {
   inside:p.allows({x:2050,y:1,z:4},.6,.24),wall:p.allows({x:2052.1,y:1,z:4},.6,.24),
   across:p.allowsMotion({x:2049,y:1,z:4},{x:2054,y:1,z:4},.19),
   missing:p.allows({x:2060,y:1,z:4},.6,.24),
  };
 });
 assert.deepEqual(mixed,{inside:true,wall:false,across:false,missing:false},'only fully prepared holes open; the mixed wall and absent page stay solid');
 await page.evaluate(()=>{const r=window.tourRuntime;r.pagedCollider.focus(r.camera.getWorldPosition(r.rig.position.clone()));window.mixedLease.release();});
 assert.equal(new Set(payloads).size,1,'the only payload fetched belongs to the real mixed tile');
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 await page.screenshot({path:path.join(root,'runtime.png')});
 console.log(JSON.stringify({airQueriesMs:proof.ms,query:proof.stats,highResolutionEnsuresMs:residency.ms,peakAirTiles:residency.peakTiles,peakAirBytes:residency.peakBytes,peakPhysicsChunks:residency.peakChunks,peakAirTriangles:residency.peakTriangles,walkingPosition:walking.position,payloadRequests:payloads.length}));
 console.log('PASS: one exact air certificate skips 16 million leaves, zero air requests, high-resolution bounded physics, walking floor/seam, blocked unknowns and delayed mixed-wall preparation. '+root);
}catch(error){
 console.error(error);
 if(page){const details={errors,payloads,text:await page.locator('body').innerText(),runtime:await page.evaluate(()=>{const r=window.tourRuntime;return {status:r?.status,mode:r?.mode,pager:!!r?.pagedCollider,resident:r?.pagedCollider?.residentTiles};})};console.error(details);await fs.writeFile(path.join(root,'failure.json'),JSON.stringify(details,null,2));await page.screenshot({path:path.join(root,'failure.png')});}
 throw error;
}finally{releaseMixed?.();await browser.close();await new Promise(resolve=>server.close(resolve));}
