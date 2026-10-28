import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {gzipSync} from 'node:zlib';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {bakeNavigationSector} from '../shared/paged-navigation.mjs';
import {radFixture,floorGlb} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),{exportTour}=require('../desktop/export.cjs');
const root=path.resolve('test-output','lazy physics '+Date.now()),source=path.join(root,'project'),output=path.join(root,'export'),dist=path.resolve('dist');
await fs.mkdir(source,{recursive:true});await fs.writeFile(path.join(source,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(source,'floor.glb'),floorGlb());
const project=blankProject(),view=newScene('view','Viewpoint only','scan.rad'),other=newScene('other','Other viewpoint','scan.rad'),move=newScene('move','Walking scene','scan.rad');
view.modes=['jumps','fly','explore'];other.modes=['jumps'];move.modes=['fly','explore'];
for(const scene of [view,other,move])scene.collider='floor.glb';project.scenes=[view,other,move];project.startScene='view';
await exportTour({project,hosting:{assetBaseUrl:'./',sceneUrls:{}},projectRoot:source,sources:{},destination:output,dist,portable:true,omitSplats:false,websiteOnly:true});
const manifest=JSON.parse(await fs.readFile(path.join(dist,'.vite/manifest.json'),'utf8'));
let engineFile=Object.values(manifest).find(entry=>/rapier/i.test(entry.file))?.file;
if(!engineFile)engineFile='assets/'+(await fs.readdir(path.join(dist,'assets'))).find(file=>/^rapier-[\w-]+\.(?:m?js)$/.test(file));
assert.ok(engineFile&&!engineFile.endsWith('undefined'),'build contains a separate engine module');await fs.access(path.join(output,engineFile));
await fs.access(path.join(output,'licenses/@dimforge_rapier3d-compat.txt'));
const staticFiles=new Set();function collect(key){const entry=manifest[key];if(!entry||staticFiles.has(entry.file))return;staticFiles.add(entry.file);for(const dep of entry.imports||[])collect(dep);}collect('index.html');
assert.ok(!staticFiles.has(engineFile),'the physics engine is not a title-screen dependency');
const size=async files=>{let bytes=0,gzip=0;for(const file of files){const contents=await fs.readFile(path.join(dist,file));bytes+=contents.length;gzip+=gzipSync(contents).length;}return {bytes,gzip};};
const sizes={initial:await size(staticFiles),engine:await size([engineFile])};
const {server,url}=await startServer({root:output,resolve:file=>file.startsWith('museum/')?{root:output,relative:file.slice(7)||'index.html'}:undefined}),base=url+'museum/';
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),reports={sizes,engineFile};
async function fixture(){
 const context=await browser.newContext({viewport:{width:1100,height:750}}),page=await context.newPage(),requests=[],errors=[],external=[];page.setDefaultTimeout(20000);
 await context.route('**/*',route=>{const request=route.request(),target=new URL(request.url());if(target.origin!==new URL(base).origin){external.push(request.url());return route.abort();}return route.continue();});
 page.on('request',request=>requests.push({url:request.url(),time:Date.now()}));page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.wasmCalls=[];for(const method of ['instantiate','instantiateStreaming','compile','compileStreaming']){const original=WebAssembly[method];if(original)WebAssembly[method]=function(...args){window.wasmCalls.push({method,stack:new Error().stack});return Reflect.apply(original,this,args);};}});
 await page.goto(base+'?diagnostics=1');return {context,page,requests,errors,external};
}
const ready=page=>page.waitForFunction(()=>{const r=window.tourRuntime;if(r?.mesh?.parent)r.frame(r.last+20);return r?.ready;});
const engineRequests=fixture=>fixture.requests.filter(request=>new URL(request.url).pathname.endsWith('/'+engineFile));
const engineCompiles=page=>page.evaluate(file=>window.wasmCalls.filter(call=>call.stack?.includes(file)),path.basename(engineFile));
try{
 // A real failed module fetch must recover in this document, not just reset an
 // application promise that the browser's module cache will reject again.
 const retry=await fixture();try{
  let attempts=0;await retry.page.route('**/'+path.basename(engineFile)+'*',route=>++attempts===1?route.abort('failed'):route.continue());
  await retry.page.getByRole('button',{name:'Enter tour',exact:true}).click();await ready(retry.page);
  assert.equal(engineRequests(retry).length,0);assert.equal((await engineCompiles(retry.page)).length,0);
  await retry.page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;});
  const failed=await retry.page.evaluate(()=>{const r=window.tourRuntime;return {mode:r.mode,world:!!r.world,failure:r.colliderFailure};});assert.equal(failed.mode,'jumps');assert.equal(failed.world,false);assert.ok(failed.failure);
  await retry.page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;});
  const recovered=await retry.page.evaluate(()=>{const r=window.tourRuntime;return {mode:r.mode,world:!!r.world,failure:r.colliderFailure};});
  reports.retry={attempts,failed,recovered,requests:engineRequests(retry)};await fs.writeFile(path.join(root,'retry.json'),JSON.stringify(reports.retry,null,2));
  assert.equal(recovered.mode,'fly','a failed engine fetch can retry without refreshing the tour');assert.ok(recovered.world);assert.equal(recovered.failure,'');assert.equal(attempts,2);assert.deepEqual(retry.errors,[]);assert.deepEqual(retry.external,[]);
 }finally{await retry.context.close();}
 const compile=await fixture();try{
  await compile.page.getByRole('button',{name:'Enter tour',exact:true}).click();await ready(compile.page);
  await compile.page.evaluate(file=>{const original=WebAssembly.instantiate;window.physicsInitAttempts=0;WebAssembly.instantiate=function(...args){if(new Error().stack?.includes(file)&&++window.physicsInitAttempts===1)return Promise.reject(Error('Fixture: interrupted physics initialization'));return Reflect.apply(original,this,args);};},path.basename(engineFile));
  await compile.page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;});
  assert.equal(await compile.page.evaluate(()=>!!window.tourRuntime.world),false,'failed initialization exposes no partial physics');
  await compile.page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;});
  reports.initialization=await compile.page.evaluate(()=>({attempts:window.physicsInitAttempts,mode:window.tourRuntime.mode,world:!!window.tourRuntime.world}));
  assert.equal(reports.initialization.mode,'fly');assert.ok(reports.initialization.world);assert.equal(reports.initialization.attempts,2);assert.equal(engineRequests(compile).length,1,'successful module bytes are reused after an initialization failure');assert.deepEqual(compile.errors,[]);
 }finally{await compile.context.close();}
 const current=await fixture();try{
  assert.equal(engineRequests(current).length,0,'cold landing requests no physics');assert.equal((await engineCompiles(current.page)).length,0);
  await current.page.getByRole('button',{name:'Enter tour',exact:true}).click();await ready(current.page);
  assert.equal(engineRequests(current).length,0,'Viewpoints requests no physics');assert.equal((await engineCompiles(current.page)).length,0);
  await current.page.evaluate(()=>{const r=window.tourRuntime,xr=r.renderer.xr;r.renderer.setAnimationLoop(null);window.identities={renderer:r.renderer,canvas:r.renderer.domElement,camera:r.camera,rig:r.rig};window.sessionMarker={inputSources:[],visibilityState:'visible',end(){throw Error('The scene must preserve XR');}};xr.getSession=()=>window.sessionMarker;xr.getCamera=()=>r.camera;xr.updateCamera=()=>{};xr.isPresenting=true;r.camera.position.y=1.7;r.rig.position.y-=1.7;});
  let engineHeld=false,releaseEngine;const held=new Promise(resolve=>releaseEngine=resolve);
  await current.page.route('**/'+path.basename(engineFile)+'*',async route=>{engineHeld=true;await held;await route.continue().catch(()=>{});});
  await current.page.evaluate(()=>window.tourRuntime.setMode('fly'));
  for(let i=0;i<200&&!engineHeld;i++)await current.page.waitForTimeout(10);assert.ok(engineHeld);
  await current.page.waitForFunction(()=>window.tourRuntime.colliderLoading);
  assert.ok(current.requests.some(request=>request.url.endsWith('/floor.glb')),'collider I/O overlaps the held engine download');
  await current.page.evaluate(()=>window.tourRuntime.selectScene('other'));await ready(current.page);
  assert.equal(await current.page.evaluate(()=>window.tourRuntime.active.id),'other','a canceled physics consumer does not block a viewpoint scene');
  await current.page.evaluate(()=>{window.nextScene=window.tourRuntime.selectScene('move');});
  assert.equal(engineRequests(current).length,1,'destinations share the in-flight engine import');releaseEngine();await current.page.evaluate(()=>window.nextScene);await ready(current.page);
  await current.page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('explore');await r.modeTransition;});
  reports.transition=await current.page.evaluate(()=>{const r=window.tourRuntime;return {scene:r.active.id,mode:r.mode,world:!!r.world,body:!!r.body,sameRenderer:r.renderer===identities.renderer,sameCanvas:r.renderer.domElement===identities.canvas,sameCamera:r.camera===identities.camera,sameRig:r.rig===identities.rig,sameSession:r.renderer.xr.getSession()===sessionMarker,position:r.rig.position.toArray()};});
  for(const key of ['world','body','sameRenderer','sameCanvas','sameCamera','sameRig','sameSession'])assert.equal(reports.transition[key],true,key);assert.equal(reports.transition.mode,'explore');assert.equal(engineRequests(current).length,1);
  reports.compiles=await engineCompiles(current.page);assert.ok(reports.compiles.length>0,'the engine compiles only after movement requests it');
  reports.requests=current.requests;assert.deepEqual(current.errors,[]);assert.deepEqual(current.external,[]);
  await current.page.screenshot({path:path.join(root,'exported-viewer.png')});
 }finally{await current.context.close();}
 // A failed, unused physical-shortcut engine must not disable normal Recast
 // routes. Inject at the real emitted worker boundary, leaving Recast intact.
 const routing=await fixture();try{
  const workerFile=Object.values(manifest).flatMap(entry=>entry.assets||[]).find(file=>/navigation\.worker-.*\.js$/.test(file));assert.ok(workerFile);
  const engineBytes=(await fs.stat('node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm')).size;
  const prefix=`const instantiate=WebAssembly.instantiate;WebAssembly.instantiate=function(source,...args){const bytes=source?.byteLength||0,blocked=bytes===${engineBytes};self.postMessage({type:'physics-fixture',bytes,blocked});if(blocked)return Promise.reject(Error('Fixture: worker physics unavailable'));return Reflect.apply(instantiate,this,[source,...args]);};\n`;
  await routing.page.route('**/'+path.basename(workerFile),route=>fs.readFile(path.join(output,workerFile),'utf8').then(body=>route.fulfill({status:200,contentType:'text/javascript',body:prefix+body})));
  await routing.page.evaluate(file=>{window.workerWasm=[];const Original=window.Worker;window.Worker=new Proxy(Original,{construct(Target,args){const worker=new Target(...args);if(String(args[0]).includes(file))worker.addEventListener('message',event=>{if(event.data.type==='physics-fixture')window.workerWasm.push(event.data);});return worker;}});},path.basename(workerFile));
  await routing.page.getByRole('button',{name:'Enter tour',exact:true}).click();await ready(routing.page);await routing.page.evaluate(()=>window.tourRuntime.selectScene('move'));await ready(routing.page);
  await routing.page.waitForFunction(()=>{const r=window.tourRuntime;return r.routes.ready||!!r.routes.error;});
  assert.equal(await routing.page.evaluate(()=>window.tourRuntime.routes.ready),true,'normal native routes do not initialize the unavailable worker physics engine');
  await routing.page.evaluate(async()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);r.setMode('explore');await r.modeTransition;r.routes.find({x:0,y:0,z:3},{x:4,y:0,z:3});});
  await routing.page.waitForFunction(()=>window.tourRuntime.routes.points.length>1);
  const firstRoute=await routing.page.evaluate(()=>({end:window.tourRuntime.routes.points.at(-1).toArray(),blocked:window.workerWasm.filter(event=>event.blocked).length}));assert.ok(firstRoute.end[0]>3.9);assert.equal(firstRoute.blocked,0);
  const positions=[-10,0,-10,10,0,-10,10,0,10,-10,0,10],indices=[0,2,1,0,3,2];
  const physical=await routing.page.evaluate(async({positions,indices})=>{
   const worker=window.tourRuntime.routes.worker;window.workerQuery=(message,reply='path')=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>{worker.removeEventListener('message',listen);reject(Error('Worker reply timeout: '+message.type));},10000),listen=event=>{const data=event.data;if(data.id!==message.id||data.type!==reply&&data.type!=='error')return;clearTimeout(timer);worker.removeEventListener('message',listen);resolve(data);};worker.addEventListener('message',listen);worker.postMessage(message);});
   return window.workerQuery({type:'local-paged-path',validate:true,id:-901,parts:[{positions:new Float32Array(positions),indices:new Uint32Array(indices)}],start:{x:0,y:0,z:3},end:{x:1,y:0,z:3},options:{stepHeight:.5334}});
  },{positions,indices});
  assert.equal(physical.type,'error');assert.match(physical.error,/worker physics unavailable/);
  await routing.page.evaluate(()=>window.tourRuntime.routes.find({x:0,y:0,z:3},{x:-4,y:0,z:3}));await routing.page.waitForFunction(()=>window.tourRuntime.routes.points.length>1);
  const walked=await routing.page.evaluate(()=>{const r=window.tourRuntime;for(let i=0;i<300;i++)r.frame(r.last+1000/60);return {x:r.body.translation().x,ready:r.routes.ready,error:r.routes.error,blocked:window.workerWasm.filter(event=>event.blocked).length};});assert.ok(walked.x<-3.5,'a normal native route remains physically usable after a local validation failure');assert.equal(walked.ready,true);assert.equal(walked.error,'');assert.equal(walked.blocked,1);
  const data=await bakeNavigationSector([{positions:new Float32Array(positions),indices:new Uint32Array(indices)}],{coord:[0,0],tileSize:8,bounds:{min:[0,-1,0],max:[8,3,8]},stepHeight:.5334});assert.ok(data);
  const paged=await routing.page.evaluate(async data=>{await window.workerQuery({type:'paged-init',navigation:{tileSize:8,origin:[0,-1.5,0]}},'ready');return window.workerQuery({type:'paged-path',id:-902,start:{x:1,y:0,z:3},end:{x:6,y:0,z:3},tiles:[{key:'0,0',data:new Uint8Array(data)}]});},Array.from(data));
  assert.equal(paged.type,'path');assert.ok(paged.path.at(-1).x>5.9);assert.equal(await routing.page.evaluate(()=>window.workerWasm.filter(event=>event.blocked).length),1,'normal paged routing does not retry unused worker physics');
  reports.worker={firstRoute,physical,walked,paged,wasm:await routing.page.evaluate(()=>window.workerWasm)};assert.deepEqual(routing.errors,[]);assert.deepEqual(routing.external,[]);
 }finally{await routing.context.close();}
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify(reports,null,2));console.log('PASS cold landing/Viewpoints omit physics, real failed-fetch/initialization retry, parallel collider I/O, canceled-scene sharing, same XR/camera, native/paged worker failure isolation, portable local dynamic assets/notices and subdirectory hosting. '+root);console.log(JSON.stringify(sizes));
}catch(error){await fs.writeFile(path.join(root,'failure.json'),JSON.stringify({error:String(error),...reports},null,2));throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
