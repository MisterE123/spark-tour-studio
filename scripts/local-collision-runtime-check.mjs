import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {Vector3} from 'three';
import {blankProject,newScene} from '../shared/project.mjs';
import {sceneMatrix} from '../shared/collision-selection.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,validatePagedCollisionManifest} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const output=path.resolve('test-output','local collision runtime '+Date.now()),dist=path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist');await fs.mkdir(output,{recursive:true});
const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const actualManifest=option('--manifest'),onlyReal=process.argv.includes('--real-only');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const reports=[];
const transform={position:[0,0,0],rotation:[0,0,0],scale:1};

function denseTemplate(){
 const n=160,cells=[];let isolated=0;
 for(let x=0;x<n;x++)for(let y=0;y<n;y++)for(let z=0;z<n;z++){
  const dense=y>=120,allowed=dense?(x+y+z)%2===0:!(z===40&&y<60);
  if(allowed)cells.push(collisionCellId(x,y,z,n));
  if(dense&&y>120&&y<n-1&&x>0&&x<n-1&&z>0&&z<n-1&&allowed)isolated++;
 }
 // Every interior checkerboard air cell has six solid neighbors. Greedy
 // coplanar merging cannot join its isolated faces to another air cell.
 assert.ok(isolated*12>600000);
 return {bytes:encodeCollisionTile({coord:[0,0,0],tileCells:n,occupied:new Uint32Array(cells)}),voxels:cells.length,triangleLowerBound:isolated*12};
}

async function fixture(detail,template){
 const root=path.join(output,'dense-'+detail),tileSize=160*detail;await fs.mkdir(path.join(root,'physics','tiles'),{recursive:true});
 const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail,tileCells:160,tileSize,coordinateSystem:'generation',sourceTransform:transform,bounds:{min:[0,0,0],max:[24*tileSize,tileSize,tileSize]},tiles:[]};
 for(let x=0;x<24;x++){const coord=[x,0,0],bytes=template.bytes.slice();new DataView(bytes.buffer).setInt32(12,x,true);const url=`tiles/${x}_0_0.scv`;await fs.writeFile(path.join(root,'physics',url),bytes);manifest.tiles.push({key:coord.join(','),coord,url,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bounds:collisionTileBounds(coord,tileSize),voxels:template.voxels});}
 validatePagedCollisionManifest(manifest);await fs.writeFile(path.join(root,'physics','scene.collision.json'),JSON.stringify(manifest));
 const scene=newScene('dense','Detailed corridor','scan.rad');scene.collider='physics/scene.collision.json';scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=[tileSize*.5,1.7,tileSize*.5];
 return {root,manifest,scene,assets:undefined,triangleLowerBound:template.triangleLowerBound};
}

async function savedFixture(file){
 const manifest=validatePagedCollisionManifest(JSON.parse(await fs.readFile(file,'utf8'))),folder=path.dirname(path.resolve(file)),projectRoot=path.resolve(folder,'../..'),saved=JSON.parse(await fs.readFile(path.join(projectRoot,'config','tour.json'),'utf8'));
 const relative=path.relative(projectRoot,path.resolve(file)).replaceAll('\\','/'),sceneId=option('--scene'),source=sceneId?saved.scenes.find(scene=>scene.id===sceneId):saved.scenes.find(scene=>scene.collider===relative);assert.ok(source,'Select the owning scene with --scene when this generated collider has not been saved into the project config');
 const root=path.join(output,'saved-asset');await fs.mkdir(root,{recursive:true});const scene=newScene('saved','Saved collision asset','scan.rad');scene.collider='saved-physics/scene.collision.json';scene.transform=source.transform;scene.colliderTransform=source.colliderTransform;scene.walkHeight=source.walkHeight;scene.modes=['jumps','fly','explore'];const entry=source.viewpoints.find(view=>view.id===source.entry)||source.viewpoints[0];scene.viewpoints[0].position=entry.position;scene.viewpoints[0].rotation=entry.rotation;const walking=source.viewpoints.find(view=>view.id===source.walkStart);if(walking&&walking.id!==entry.id){scene.viewpoints.push({id:'walk-start',name:'Walking start',position:walking.position,rotation:walking.rotation});scene.walkStart='walk-start';}
 const assets=new Set(['scene.collision.json',...manifest.tiles.map(tile=>tile.url),...(manifest.navigation?.tiles||[]).map(tile=>tile.url)]);
 return {root,manifest,scene,assets:{folder,allowed:assets},entryWorld:new Vector3(...entry.position).applyMatrix4(sceneMatrix(source.transform)).toArray()};
}

async function openCase(input,label){
 const started=performance.now();
 const {root,scene,assets}=input,project=blankProject();project.scenes=[scene];project.startScene=scene.id;await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.writeFile(path.join(root,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(root,'config','tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config','hosting.json'),'{}');
 // Saved user data is exposed read-only through an exact manifest companion
 // whitelist. The user's config, splats, annotations and other files are never
 // served or copied into this fixture.
 const running=await startServer({root:dist,resolve:name=>{
  if(name.startsWith('saved-physics/')){const relative=name.slice('saved-physics/'.length);return assets?.allowed.has(relative)?{root:assets.folder,relative}:false;}
  return /^(config|physics)\//.test(name)||name==='scan.rad'?{root,relative:name}:undefined;
 }}),context=await browser.newContext({viewport:{width:1100,height:800}}),page=await context.newPage(),errors=[],requests=[];
 page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/\/tiles\//.test(request.url()))requests.push(request.url());});
 try{
  await page.goto(running.url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready,{},{timeout:180000});
  await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;});
  await page.waitForFunction(()=>!!window.tourRuntime.pagedCollider,{},{timeout:180000});
  await page.evaluate(()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);window.localPhysicsErrors=[];r.pagedCollider.onError=message=>window.localPhysicsErrors.push(message);});
 }catch(error){await fs.writeFile(path.join(root,'open-failure.json'),JSON.stringify({error:String(error),errors,text:await page.locator('body').innerText()},null,2));await context.close();await new Promise(resolve=>running.server.close(resolve));throw error;}
 const stats=()=>page.evaluate(()=>{const p=window.tourRuntime.pagedCollider;let meshTriangles=0,meshes=0;const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];p.group.updateWorldMatrix(true,true);p.group.traverse(object=>{if(!object.isMesh)return;meshes++;meshTriangles+=(object.geometry.index?.count||0)/3;if(!object.geometry.boundingBox)object.geometry.computeBoundingBox();const box=object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld);for(let axis=0;axis<3;axis++){const key=['x','y','z'][axis];low[axis]=Math.min(low[axis],box.min[key]);high[axis]=Math.max(high[axis],box.max[key]);}});return {pages:p.residentTiles,bytes:p.residentBytes,chunks:p.physicsChunks,triangles:p.physicsTriangles,meshTriangles,meshes,extent:low.map((value,axis)=>Number.isFinite(value)?high[axis]-value:0)};});
 return {page,errors,requests,stats,loadMs:performance.now()-started,close:async()=>{await context.close();await new Promise(resolve=>running.server.close(resolve));},label};
}

async function checkDense(input){
 const size=input.manifest.tileSize,check=await openCase(input,'dense-'+size),{page,stats}=check;try{
  const ensure=point=>page.evaluate(async point=>{const p=window.tourRuntime.pagedCollider;await p.ensure({x:point[0],y:point[1],z:point[2]},2);},point),start=[size*.5,1.7,size*.5];await ensure(start);let initial=await stats();assert.ok(initial.triangles<600000&&initial.meshTriangles<600000);assert.ok(initial.chunks>0);assert.ok(new Set(check.requests).size<6,'A local patch must not download the full scene');
  const planner=await page.evaluate(async({size})=>{
   const r=window.tourRuntime,p=r.pagedCollider,point={x:size*.5,y:1.7,z:size*.5},revision=p.revision,started=performance.now();for(let i=0;i<10000;i++)p.focus(point);const focusMs=performance.now()-started,revisionDelta=p.revision-revision;
   const matrix=p.group.matrix.clone(),notice=p.onError,leases=p.leases.size,expected=[];p.onError=message=>expected.push(message);p.group.matrix.makeScale(1e-9,1e-9,1e-9);p.group.matrixWorldNeedsUpdate=true;p.group.updateWorldMatrix(true,true);let prepareError,focusError,updateError,frameError;
   try{try{await p.prepare(point,2);}catch(error){prepareError=String(error);}try{p.focus(point);}catch(error){focusError=String(error);}try{p.update(point,r.last+1000);}catch(error){updateError=String(error);}try{r.frame(r.last+20);}catch(error){frameError=String(error);}await Promise.allSettled([p.work,p.updating].filter(Boolean));return {focusMs,revisionDelta,prepareError,focusError,updateError,frameError,leasesBefore:leases,leasesAfter:p.leases.size,expectedNotices:expected.length};}
   finally{p.group.matrix.copy(matrix);p.group.matrixWorldNeedsUpdate=true;p.group.updateWorldMatrix(true,true);await p.realign();await p.ensure(point,2);p.onError=notice;}
  },{size});assert.equal(planner.revisionDelta,0,'Unchanged focus must not create new physics plans');assert.ok(planner.prepareError,'Exceptional descriptor planning should reject preparation');assert.equal(planner.leasesAfter,planner.leasesBefore,'Failed preparation must not leak a query lease');assert.equal(planner.focusError,undefined);assert.equal(planner.updateError,undefined);assert.equal(planner.frameError,undefined);
  const wall=size*.25;await ensure([size*.5,1.7,wall+.75]);
  const physical=await page.evaluate(({x,z,wall})=>{const r=window.tourRuntime,p=r.pagedCollider,ray=(origin,dir,limit)=>r.world.castRayAndGetNormal({origin,dir},limit,true,undefined,undefined,r.capsule);const floor=ray({x,y:1.7,z},{x:0,y:-1,z:0},3),hit=ray({x,y:1,z},{x:0,y:0,z:-1},2);return {floor:floor?.timeOfImpact,wall:hit?.timeOfImpact,motion:p.allowsMotion({x,y:1,z},{x,y:1,z:wall-.4},.19)};},{x:size*.5,z:wall+.75,wall});assert.ok(Math.abs(physical.floor-1.7)<.07,'Exact allowed-space floor must be installed');assert.ok(physical.wall>0&&physical.wall<.8,'Thin voxel wall must be installed');assert.equal(physical.motion,false);
  await ensure([size-.02,1.7,size*.5]);const seam=await page.evaluate(({size})=>{const r=window.tourRuntime,p=r.pagedCollider;return {allowed:p.allowsMotion({x:size-.4,y:1,z:size*.5},{x:size+.4,y:1,z:size*.5},.19),cap:r.world.castRayAndGetNormal({origin:{x:size-.4,y:1,z:size*.5},dir:{x:1,y:0,z:0}},.8,true,undefined,undefined,r.capsule)?.timeOfImpact};},{size});assert.equal(seam.allowed,true);assert.equal(seam.cap,undefined,'Physics chunks must not introduce seam walls');
  // Cached voxel data is not permission to move until local physics is ready.
  const distant=[10*size+size*.5,1.7,size*.5];await page.evaluate(async({size})=>{const p=window.tourRuntime.pagedCollider;await p.stream.load(p.stream.entries.get('10,0,0'));window.physicsDelay={jobs:[],send:p.worker.postMessage.bind(p.worker)};p.worker.postMessage=(...args)=>window.physicsDelay.jobs.push(args);window.delayedEnsure=p.ensure({x:10*size+size*.5,y:1.7,z:size*.5},2).then(()=>({ok:true}),error=>({error:error.name}));},{size});await page.waitForFunction(()=>window.physicsDelay.jobs.length>0);assert.equal(await page.evaluate(point=>window.tourRuntime.pagedCollider.allows({x:point[0],y:point[1],z:point[2]},.6,.24),distant),false);await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,s=window.physicsDelay;p.worker.postMessage=s.send;for(const args of s.jobs)s.send(...args);await window.delayedEnsure;});assert.equal(await page.evaluate(point=>window.tourRuntime.pagedCollider.allows({x:point[0],y:point[1],z:point[2]},.6,.24),distant),true);
  // Destination preparation must preserve the current floor. Releasing the
  // temporary query must revoke its unpinned local physics synchronously.
  await ensure(start);const lease=await page.evaluate(async({size})=>{const p=window.tourRuntime.pagedCollider,a={x:size*.5,y:1.7,z:size*.5},b={x:14*size+size*.5,y:1.7,z:size*.5},lease=await p.prepare(b,2);const result={current:p.allows(a,.6,.24),target:p.allows(b,.6,.24)};lease.release();return {...result,released:p.allows(b,.6,.24)};},{size});assert.deepEqual(lease,{current:true,target:true,released:false});
  let peak=0;for(let x=1;x<22;x++){await ensure([x*size+size*.5,1.7,size*.5]);const current=await stats();peak=Math.max(peak,current.chunks);assert.ok(current.triangles<600000);assert.ok(current.meshTriangles<600000);assert.ok(current.extent[0]<size*3,'Active geometry must follow the visitor rather than accumulate across pages');}
  const travelled=await stats();assert.ok(travelled.pages>=12,'Decoded voxel pages should be reusable beyond the small physics neighborhood');assert.ok(travelled.chunks<=peak&&peak<256);assert.ok(travelled.extent[0]<size*3);
  // Rapidly replaced ensure goals may finish in either order; only the final
  // primary neighborhood is allowed once both requests have settled.
  await page.evaluate(async({size})=>{const p=window.tourRuntime.pagedCollider;await Promise.all([p.stream.load(p.stream.entries.get('3,0,0')),p.stream.load(p.stream.entries.get('5,0,0'))]);window.physicsDelay={jobs:[],send:p.worker.postMessage.bind(p.worker)};p.worker.postMessage=(...args)=>window.physicsDelay.jobs.push(args);window.oldGoal=p.ensure({x:3*size+size*.5,y:1.7,z:size*.5},2).catch(error=>error.name);},{size});await page.waitForFunction(()=>window.physicsDelay.jobs.length>0);await page.evaluate(({size})=>{const p=window.tourRuntime.pagedCollider;window.newGoal=p.ensure({x:5*size+size*.5,y:1.7,z:size*.5},2).catch(error=>error.name);},{size});await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,s=window.physicsDelay;p.worker.postMessage=s.send;for(const args of s.jobs)s.send(...args);await Promise.all([window.oldGoal,window.newGoal]);});const goals=await page.evaluate(({size})=>{const p=window.tourRuntime.pagedCollider;return {old:p.allows({x:3*size+size*.5,y:1.7,z:size*.5},.6,.24),latest:p.allows({x:5*size+size*.5,y:1.7,z:size*.5},.6,.24)};},{size});assert.deepEqual(goals,{old:false,latest:true});
  const aligned=await page.evaluate(async({size})=>{const r=window.tourRuntime,scene=structuredClone(r.active);scene.colliderTransform={position:[1,.2,-2],rotation:[0,.35,0],scale:1.2};r.updateScene(scene);await r.colliderTransition;const p=r.pagedCollider,a=p.fromGeneration({x:size*.5,y:1.7,z:size*.5}),b=p.fromGeneration({x:size*.5,y:1,z:size*.25+.75}),c=p.fromGeneration({x:size*.5,y:1,z:size*.25-.4});await p.ensure(a,2);await p.ensure(b,2);return {inside:p.allows(b,0,.19),wall:p.allowsMotion(b,c,.19)};},{size});assert.deepEqual(aligned,{inside:true,wall:false});
  await page.evaluate(async({size})=>{const p=window.tourRuntime.pagedCollider,point=p.fromGeneration({x:18*size+size*.5,y:1.7,z:size*.5});window.physicsDelay={jobs:[],send:p.worker.postMessage.bind(p.worker)};p.worker.postMessage=(...args)=>window.physicsDelay.jobs.push(args);window.disposedEnsure=p.ensure(point,2).then(()=>({ok:true}),error=>({name:error.name}));},{size});await page.waitForFunction(()=>window.physicsDelay.jobs.length>0);const disposed=await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider,reply=p.worker.onmessage,job=window.physicsDelay.jobs[0][0];p.dispose();reply?.({data:{id:job.id,results:[]}});const result=await window.disposedEnsure;return {result,chunks:p.physicsChunks,triangles:p.physicsTriangles,pages:p.residentTiles,parent:!!p.group.parent};});assert.equal(disposed.chunks,0);assert.equal(disposed.triangles,0);assert.equal(disposed.pages,0);assert.equal(disposed.parent,false);
  assert.deepEqual(await page.evaluate(()=>window.localPhysicsErrors),[]);assert.deepEqual(check.errors,[]);reports.push({case:check.label,loadMs:check.loadMs,wholePageTriangleLowerBound:input.triangleLowerBound,initial,travelled,peakPhysicsChunks:peak,planner});
 }catch(error){await fs.writeFile(path.join(input.root,'failure.json'),JSON.stringify({error:String(error),stats:await stats().catch(()=>null),errors:check.errors,text:await page.locator('body').innerText()},null,2));throw error;}finally{await check.close();}
}

async function checkSaved(input){const check=await openCase(input,'saved-user-collider');try{
 const point=input.entryWorld;await check.page.evaluate(async point=>{const p=window.tourRuntime.pagedCollider;await p.ensure({x:point[0],y:point[1],z:point[2]},2);},point);const state=await check.stats();assert.ok(state.chunks>0&&state.triangles<600000&&state.meshTriangles<600000);assert.ok(state.pages<input.manifest.tiles.length,'Saved asset initializes without downloading every collision leaf');
 // Entry validity is author-dependent. Report the real walking-start result
 // without mistaking an invalid authored position for a physics-budget failure.
 const walk=await check.page.evaluate(async()=>{const r=window.tourRuntime,p=r.pagedCollider,head=r.camera.getWorldPosition(r.rig.position.clone()),center={x:head.x,y:head.y-r.viewHeight+.87,z:head.z},entry={headAllowed:p.allows(head,0,.095),bodyAllowed:p.allows(center,.6,.24),viewHeight:r.viewHeight};let error;try{r.setMode('explore',true,true);await r.modeTransition;}catch(cause){error=String(cause);}return {...entry,mode:r.mode,status:r.status,error,headAfterAllowed:p.allows(r.camera.getWorldPosition(r.rig.position.clone()),0,.095),bodyAfterAllowed:r.body?p.allows(r.body.translation(),.6,.24):false};});
 assert.deepEqual(await check.page.evaluate(()=>window.localPhysicsErrors),[]);assert.deepEqual(check.errors,[]);reports.push({case:check.label,loadMs:check.loadMs,detail:input.manifest.detail,pageSize:input.manifest.tileSize,availablePages:input.manifest.tiles.length,...state,walk});
 }finally{await check.close();}}

try{if(!onlyReal){const template=denseTemplate();for(const detail of [.05,.1])await checkDense(await fixture(detail,template));}if(actualManifest)await checkSaved(await savedFixture(actualManifest));await fs.writeFile(path.join(output,'results.json'),JSON.stringify(reports,null,2));console.log('PASS: exact local collision physics for high-detail pages, bounded travel/cache, walls/floors/seams, deferred readiness, query leases, latest goals, transformed alignment and disposal. '+output);}finally{await browser.close();}
