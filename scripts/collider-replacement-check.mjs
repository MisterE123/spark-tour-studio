import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene,identity} from '../shared/project.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';
import {radFixture,floorGlb} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),{PagedCollisionWriter}=require('../desktop/paged-collision.cjs');
const root=path.resolve('test-output','collider replacement '+Date.now());await fs.mkdir(path.join(root,'config'),{recursive:true});
const writer=await PagedCollisionWriter.create(root),manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.1,tileCells:20,tileSize:2,coordinateSystem:'generation',sourceTransform:identity(),bounds:{min:[0,0,0],max:[4,2,2]},tiles:[]};
for(let x=0;x<2;x++){
 const coord=[x,0,0],occupied=[];for(let a=0;a<20;a++)for(let b=0;b<20;b++)for(let c=0;c<20;c++)if(x===0||a!==10)occupied.push(collisionCellId(a,b,c,20));
 const bytes=encodeCollisionTile({coord,tileCells:20,occupied}),entry={key:coord.join(','),coord,url:`tiles/${x}_0_0.scv`,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,2),voxels:occupied.length};
 manifest.tiles.push(entry);await writer.writeTile(entry,bytes);
}
const ref=await writer.finalize(manifest),retryRef=path.posix.join(path.posix.dirname(ref),'retry.collision.json'),slowPagedRef=path.posix.join(path.posix.dirname(ref),'slow.collision.json');
for(const alias of [retryRef,slowPagedRef])await fs.copyFile(path.join(root,ref),path.join(root,alias));
const project=blankProject(),scene=newScene('a','Replacement fixture','scan.rad');scene.collider='old.glb';scene.colliderTransform={position:[0,.2,0],rotation:[0,.15,0],scale:1.1};scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=[1,1.7,1];const initial=structuredClone(scene);initial.id='initial';initial.name='Changed while opening';initial.collider='initial.glb';initial.colliderTransform=identity();project.scenes=[scene,initial];project.startScene=scene.id;
await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(root,'old.glb'),floorGlb());await fs.writeFile(path.join(root,'slow.glb'),floorGlb());
await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(config|colliders)\//.test(name)||/^(scan\.rad|old\.glb|slow\.glb)$/.test(name)?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page,releaseSlow,releasePaged,releaseInitial;const errors=[],external=[],requests=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{requests.push(request.url());if(/^https?:/.test(request.url())&&!request.url().startsWith(url))external.push(request.url());});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour'}).click();await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.world);
 await page.evaluate(async()=>{
  const r=window.tourRuntime;r.renderer.setAnimationLoop(null);r.setMode('fly');await r.modeTransition;r.showCollider(true);
  window.saved={mesh:r.mesh,generation:r.generation,collider:r.collider,world:r.world,position:r.rig.position.toArray(),rotation:r.rig.quaternion.toArray(),worldFreed:false,geometryDisposed:false};
  const free=r.world.free.bind(r.world);r.world.free=()=>{window.saved.worldFreed=true;free();};r.collider.traverse(object=>object.geometry?.addEventListener('dispose',()=>window.saved.geometryDisposed=true));
  const walkStart=r.active.walkStart;r.active.walkStart='bad-walk-start';r.active.viewpoints.push({id:'bad-walk-start',name:'Invalid walking start',position:[50,1.7,50],rotation:[0,0,0]});r.rig.position.set(50,1.7,50);r.setMode('explore',true);
  window.saved.navigationError=r.status;r.active.walkStart=walkStart;r.active.viewpoints.pop();r.rig.position.fromArray(window.saved.position);
 });
 assert.match(await page.evaluate(()=>window.saved.navigationError),/No valid walking position/,'the fixture produces a real invalid walking start');
 assert.equal(await page.evaluate(()=>window.tourRuntime.mode),'fly');
 const radRequestsAtStart=requests.filter(request=>new URL(request).pathname==='/scan.rad').length;
 const update=async(ref,transform=identity())=>{
  await page.evaluate(({ref,transform})=>{const r=window.tourRuntime,s=structuredClone(r.active);s.collider=ref;s.colliderTransform=transform;r.updateScene(s);},{ref,transform});
  await page.evaluate(()=>window.tourRuntime.colliderTransition);
 };
 const blockedMovement=async(label)=>{
  const result=await page.evaluate(async()=>{
   const r=window.tourRuntime;r.report('');const before=r.rig.position.toArray();
   r.active.viewpoints.push({id:'blocked-jump-probe',name:'Blocked jump probe',position:[50,1.7,50],rotation:[0,0,0]});r.active.hotspots.push({id:'blocked-bubble-probe',label:'Blocked bubble probe',position:[50,1,50],kind:'scene',target:r.active.id});
   let visited;try{r.jump('blocked-jump-probe',false);visited=await r.visitBubble('blocked-bubble-probe');}finally{r.active.viewpoints.pop();r.active.hotspots.pop();}
   const afterVisits=r.rig.position.toArray();r.setTouch(1,0);r.setTouchLift(1);for(let i=0;i<20;i++){r.pointerMove.set(.5,.5,.5);r.frame(r.last+20);}r.setTouch(0,0);r.setTouchLift(0);return {before,afterVisits,visited,after:r.rig.position.toArray(),mode:r.mode,blocked:r.blocked,preparing:r.preparingMode};
  });
  assert.equal(result.visited,false,label+' blocks a bubble visit');assert.deepEqual(result.afterVisits,result.before,label+' blocks viewpoint/bubble teleport');
  assert.equal(result.mode,'fly',label+' tests Drone');assert.equal(result.blocked,false,label+' must not rely on a modal UI');assert.equal(result.preparing,false,label+' must not rely on mode preparation');assert.deepEqual(result.after,result.before,label+' blocks translation, lift and pan even with the status cleared');
 };
 await update(ref);
 const replaced=await page.evaluate(()=>{
  const r=window.tourRuntime,s=window.saved;return {pager:!!r.pagedCollider,pagerReady:!!r.pagedCollider?.ready,ready:r.ready,source:r.colliderSource,oldDetached:!s.collider.parent,worldFreed:s.worldFreed,geometryDisposed:s.geometryDisposed,newWorld:r.world!==s.world,mesh:r.mesh===s.mesh,generation:r.generation===s.generation,position:r.rig.position.toArray(),rotation:r.rig.quaternion.toArray(),wire:r.collider?.visible,alignment:r.collider?.position.toArray()};
 });
 assert.ok(replaced.pager&&replaced.pagerReady,'a navigation status must not stop GLB → paged collider replacement: '+JSON.stringify(replaced));
 assert.equal(replaced.source,ref);for(const name of ['ready','oldDetached','worldFreed','geometryDisposed','newWorld','mesh','generation','wire'])assert.equal(replaced[name],true,name);
 assert.deepEqual(replaced.position,await page.evaluate(()=>window.saved.position));assert.deepEqual(replaced.rotation,await page.evaluate(()=>window.saved.rotation));assert.deepEqual(replaced.alignment,[0,0,0]);
 assert.deepEqual(await page.evaluate(()=>{const p=window.tourRuntime.pagedCollider;return {inside:p.allows({x:1,y:1,z:1},.6,.24),wall:p.allows({x:3.05,y:1,z:1},.6,.24),outside:p.allows({x:5,y:1,z:1},.6,.24)};}),{inside:true,wall:false,outside:false});
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime,before=r.rig.position.clone();r.setTouch(1,0);for(let i=0;i<5;i++)r.frame(r.last+20);r.setTouch(0,0);const moved=r.rig.position.distanceTo(before);r.rig.position.copy(before);return moved>.05;}),'the movement probes have active, usable controls when collision is ready');

 // Failure is recoverable by repeating the unchanged reference, even if a
 // movement error was displayed before the user generated/relinked it.
 let failOnce=true;await page.route('**/retry.collision.json',route=>{if(failOnce){failOnce=false;return route.fulfill({status:503,body:'Temporary fixture failure'});}return route.continue();});
 await update(retryRef);assert.equal(await page.evaluate(()=>!!window.tourRuntime.pagedCollider),false,'a failed destination must not retain obsolete physics');
 await blockedMovement('a failed configured collider');
 await page.evaluate(()=>window.tourRuntime.report('No valid walking position near this view.',true,'navigation'));await update(retryRef);
 assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider?.ready),true,'retrying the same reference must install its collider');

 // A late GLTF result must release its resources without replacing a newer
 // paged selection. Then perform an ordinary paged → GLB → paged round trip.
 let markSlow;const slowRequested=new Promise(resolve=>markSlow=resolve),holdSlow=new Promise(resolve=>releaseSlow=resolve);
 await page.route('**/slow.glb',async route=>{markSlow();await holdSlow;await route.continue();});
 await page.evaluate(()=>{const r=window.tourRuntime;r.report('');const s=structuredClone(r.active);s.collider='slow.glb';r.updateScene(s);window.slowTransition=r.colliderTransition;});
 await Promise.race([slowRequested,page.waitForTimeout(30000).then(()=>{throw Error('The delayed GLB was never requested.');})]);
 await blockedMovement('a loading GLB');
 await update(ref);releaseSlow();await page.evaluate(()=>window.slowTransition);
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return r.colliderSource===r.active.collider&&r.pagedCollider?.ready&&r.mesh===window.saved.mesh;}),'late GLB loading must not replace the paged destination');
 await page.evaluate(()=>{const r=window.tourRuntime;window.retiredPager=r.pagedCollider;});await update('old.glb');
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return !r.pagedCollider&&r.colliderSource==='old.glb'&&r.world&&window.retiredPager.stream.dead&&!window.retiredPager.group.parent;}),'paged → GLB disposes the page owner');
 await page.evaluate(()=>window.tourRuntime.report('No valid walking position near this view.',true,'navigation'));await update(ref);
 assert.ok(await page.evaluate(()=>window.tourRuntime.pagedCollider?.ready),'another status cannot mask a later replacement');

 let markPaged;const pagedRequested=new Promise(resolve=>markPaged=resolve),holdPaged=new Promise(resolve=>releasePaged=resolve);
 await page.route('**/slow.collision.json',async route=>{markPaged();await holdPaged;await route.continue().catch(()=>{});});
 await page.evaluate(slowPagedRef=>{const r=window.tourRuntime,s=structuredClone(r.active);s.collider=slowPagedRef;r.updateScene(s);window.slowPagedTransition=r.colliderTransition;},slowPagedRef);
 await Promise.race([pagedRequested,page.waitForTimeout(30000).then(()=>{throw Error('The delayed paged manifest was never requested.');})]);
 await blockedMovement('a loading paged manifest');
 await update('old.glb');releasePaged();await page.evaluate(()=>window.slowPagedTransition);
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return !r.pagedCollider&&r.world&&r.colliderSource==='old.glb'&&r.collider?.parent===r.content;}),'an aborted late paged load cannot replace the newer GLB');
 await update(ref);assert.equal(await page.evaluate(()=>window.tourRuntime.pagedCollider?.ready),true,'repeated replacement remains usable');

 await update('old.glb');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('explore');await r.modeTransition;r.report('Streaming failed: expected fixture error. Retry the scene.',true);});
 assert.equal(await page.evaluate(()=>window.tourRuntime.mode),'explore','the scene-error test starts in Walk');
 await update(ref);
 assert.deepEqual(await page.evaluate(()=>{const r=window.tourRuntime;return {source:r.colliderSource,status:r.status,scope:r.statusScope,ready:r.ready};}),{source:ref,status:'Streaming failed: expected fixture error. Retry the scene.',scope:'scene',ready:false},'re-entering Walk after replacement must not erase an unrelated scene-streaming error');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.report('');r.setMode('fly',true);await r.modeTransition;r.rig.position.fromArray(window.saved.position);});
 await update(ref);
 assert.equal(requests.filter(request=>new URL(request).pathname==='/scan.rad').length,radRequestsAtStart,'collider changes do not reload RAD');
 assert.deepEqual(await page.evaluate(()=>window.tourRuntime.rig.position.toArray()),await page.evaluate(()=>window.saved.position));

 // During initial scene preparation, the original GLB can fail after the
 // author has already chosen the newly generated paged collider. The latest
 // reference must still be loaded instead of failing the entire scene.
 let markInitial;const initialRequested=new Promise(resolve=>markInitial=resolve),holdInitial=new Promise(resolve=>releaseInitial=resolve);
 await page.route('**/initial.glb',async route=>{markInitial();await holdInitial;await route.fulfill({status:503,body:'Superseded initial GLB failure'});});
 await page.evaluate(()=>{window.initialTransition=window.tourRuntime.selectScene('initial');});
 await Promise.race([initialRequested,page.waitForTimeout(30000).then(()=>{throw Error('The initial held GLB was never requested.');})]);
 await blockedMovement('an initial configured GLB');
 await page.evaluate(ref=>{const r=window.tourRuntime,s=structuredClone(r.active);s.collider=ref;s.colliderTransform={position:[0,0,0],rotation:[0,0,0],scale:1};r.updateScene(s);},ref);
 releaseInitial();await page.evaluate(()=>window.initialTransition);
 assert.ok(await page.evaluate(ref=>{const r=window.tourRuntime;return r.ready&&r.active.id==='initial'&&r.colliderSource===ref&&r.pagedCollider?.ready;},ref),'initial scene loading must reconcile a newer collider after the old request fails');
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 await page.screenshot({path:path.join(root,'replacement.png')});
 console.log('PASS: GLB ↔ paged replacement after real walking errors, alignment/resource disposal, mixed walls, retry, movement gates, rapid races, camera/RAD continuity and superseded initial load failure. '+root);
}catch(error){
 console.error(error);if(page){const details={errors,text:await page.locator('body').innerText(),runtime:await page.evaluate(()=>{const r=window.tourRuntime;return {status:r?.status,source:r?.colliderSource,desired:r?.active?.collider,pager:!!r?.pagedCollider,ready:r?.pagedCollider?.ready,mode:r?.mode};})};console.error(details);await fs.writeFile(path.join(root,'failure.json'),JSON.stringify(details,null,2));await page.screenshot({path:path.join(root,'failure.png')});}throw error;
}finally{releaseSlow?.();releasePaged?.();releaseInitial?.();await browser.close();await new Promise(resolve=>server.close(resolve));}
