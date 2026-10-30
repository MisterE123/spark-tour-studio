import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

// Controlled timestamps belong to this isolated fixture only. The production
// frame loop, controller, LoD selection, GPU resources and renderer run normally.
// Long cadence histories call the real runtime feedback method directly, then
// render their result; this avoids thousands of redundant software-GPU draws.
// A separate half-FPS probe goes through every production frame, proving that
// locomotion's capped dt is not substituted for the actual feedback interval.
// This proves feedback integration, not hardware FPS or headset comfort.
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs');
const output=path.resolve('test-output','radix adaptive '+Date.now());await fs.mkdir(output,{recursive:true});
const fixture=sogLodFixture(),metadata=JSON.parse(new TextDecoder().decode(fixture.files['lod-meta.json']));
// Repeat genuine decoded ranges in 128 leaves. This bounded synthetic scene
// crosses the authored 50k budget and its adaptive floor without conversion or
// user assets; overlapping ranges are intentional, not a performance benchmark.
metadata.tree={bound:metadata.tree.bound,children:Array.from({length:128},()=>structuredClone(metadata.tree))};
metadata.counts=metadata.counts.map(n=>n*128);metadata.count=metadata.counts.reduce((a,b)=>a+b,0);
fixture.files['lod-meta.json']=Buffer.from(JSON.stringify(metadata));
for(const[name,bytes]of Object.entries(fixture.files)){
 const file=path.join(output,'scan',name);await fs.mkdir(path.dirname(file),{recursive:true});
 if(name.endsWith('/meta.json')){const meta=JSON.parse(new TextDecoder().decode(bytes));meta.scales.codebook.fill(-6);await fs.writeFile(file,JSON.stringify(meta));}
 else await fs.writeFile(file,bytes);
}
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><link rel="icon" href="data:,"><style>html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden}</style><div id="stage"></div><script type="module" src="./harness.js"></script>');
await fs.writeFile(path.join(output,'harness.ts'),String.raw`
import * as THREE from 'three';
import {TourRuntime} from '../../src/runtime';
import {blankProject,newScene,ProjectSchema} from '../../shared/project.mjs';
import {PerformanceSettingsSchema} from '../../shared/performance.mjs';
const state=window.test={ready:false,time:performance.now(),changes:[],statuses:[],sessions:[]};
Object.defineProperty(globalThis,'XRWebGLBinding',{configurable:true,value:undefined});
globalThis.XRWebGLLayer=class {
 constructor(session,gl){this.framebufferWidth=256;this.framebufferHeight=128;this.ignoreDepthValues=true;this.fixedFoveation=0;
  this.framebuffer=gl.createFramebuffer();this.texture=gl.createTexture();this.depth=gl.createRenderbuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,256,128,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,256,128);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);
 }
 getViewport(view){return{x:view.eye==='left'?0:128,y:0,width:128,height:128};}
};
class Session extends EventTarget {
 frameRate=90;inputSources=[];enabledFeatures=[];environmentBlendMode='opaque';visibilityState='visible';referenceSpace=new EventTarget();renderState={};callback=null;
 requestAnimationFrame(callback){this.callback=callback;return 1;}cancelAnimationFrame(){this.callback=null;}
 updateRenderState(value){Object.assign(this.renderState,value);}async requestReferenceSpace(){return this.referenceSpace;}
 async end(){this.dispatchEvent(new Event('end'));}
}
Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:async()=>{const session=new Session();state.sessions.push(session);return session;}}});
const runtime=state.runtime=await TourRuntime.create(document.querySelector('#stage'));
runtime.onStatus=(text,error)=>state.statuses.push({text,error});
const authored=state.authored=PerformanceSettingsSchema.parse({adaptiveDetail:true,adaptiveTargetFps:30,pixelRatio:.5,radix:{selectedSplatBudget:50000,residentSplatBudget:200000,lodBaseDistance:1000,lodRangeMax:2}});
state.authoredBefore=JSON.stringify(authored);runtime.applyPerformance(authored);
const scene=newScene('test','Adaptive fixture','scan/lod-meta.json');scene.modes=['jumps','fly'];scene.background={type:'solid',color:'#183340'};
const project=state.project=ProjectSchema.parse({...blankProject(),startScene:'test',scenes:[scene]});state.projectBefore=JSON.stringify(project);
await runtime.load(project,{assetBaseUrl:'./',sceneUrls:{}},location.href);
runtime.subscribePerformance(s=>state.changes.push(structuredClone(s)));
state.snapshot=()=>({ready:runtime.ready,scale:runtime.adaptiveDetailScale,backend:runtime.backend.stats.backend,settings:runtime.backend.settings,budget:runtime.mesh?.stream?.settings.splatBudget,selected:runtime.backend.stats.selected,shown:runtime.backend.stats.shown,loading:runtime.backend.stats.loading,phase:runtime.mesh?.stats.phase,base:runtime.basePerformanceSettings,effective:runtime.performanceSettings,quality:runtime.quality,session:runtime.renderer.xr.getSession()===state.sessions[0],manager:runtime.renderer.xr.constructor.name,eyes:runtime.renderer.xr.getCamera().cameras.length,controller:{average:runtime.adaptiveDetail.average,settledSince:runtime.adaptiveDetail.settledSince,lastTime:runtime.adaptiveDetail.lastTime,context:runtime.adaptiveDetail.context}});
state.halt=()=>{runtime.renderer.setAnimationLoop(null);state.time=performance.now();runtime.last=state.time;};
state.tick=async(duration,fps)=>{
 const step=1000/fps,frames=Math.ceil(duration/step),before=runtime.adaptiveDetailScale;
 for(let i=0;i<frames;i++){
  state.time+=step;const session=runtime.renderer.xr.getSession();
  if(session){
   const near=session.renderState.depthNear||.05,far=session.renderState.depthFar||20000,projection=new THREE.Matrix4().makePerspective(-near,near,near,-near,near,far),head=new THREE.Vector3(0,1.6,0),orientation=new THREE.Quaternion(),unit=new THREE.Vector3(1,1,1),views=['left','right'].map((eye,index)=>({eye,transform:{matrix:new THREE.Matrix4().compose(head.clone().add(new THREE.Vector3(index?.032:-.032,0,0)),orientation,unit).elements},projectionMatrix:projection.elements}));
   const pose={views,transform:{matrix:new THREE.Matrix4().compose(head,orientation,unit).elements,position:{x:0,y:1.6,z:0,w:1},orientation:{x:0,y:0,z:0,w:1}}},frame={session,getViewerPose:()=>state.tracking===false?null:pose,getPose:()=>null},callback=session.callback;session.callback=null;if(!callback)throw Error('Actual XR manager callback missing');callback(state.time,frame);
  }else runtime.frame(state.time);
  // CPU sorting completes through a worker/readback. Yield the fixture's task
  // periodically so it is not artificially starved by a synchronous test loop.
  if(i%16===15)await new Promise(resolve=>setTimeout(resolve,0));
 }
 await new Promise(resolve=>setTimeout(resolve,0));
 return {before,after:runtime.adaptiveDetailScale,...state.snapshot()};
};
state.settle=async()=>{
 for(let i=0;i<3;i++){
  await state.tick(1000/60,60);
  const started=performance.now();while(runtime.backend.node.view?.autoSorting){if(performance.now()-started>10000)throw Error('CPU sort did not publish during adaptive fixture');await new Promise(resolve=>setTimeout(resolve,5));}
 }
 return state.snapshot();
};
state.feedback=async(duration,fps)=>{
 const step=1000/fps;for(let i=0;i<Math.ceil(duration/step);i++){state.time+=step;runtime.updateAdaptivePerformance(state.time,step,runtime.renderer.xr.isPresenting,runtime.xrInputSuspended,0);}
 return state.settle();
};
state.startXR=async()=>{runtime.renderer.backend.makeXRCompatible=async()=>{};runtime.renderer.setAnimationLoop((time,frame)=>runtime.frame(time,frame));await runtime.enterXR();state.time=performance.now();runtime.last=state.time;};
state.reset=patch=>{runtime.applyPerformance({...state.authored,...patch,radix:{...state.authored.radix,...patch?.radix}});runtime.loading=null;runtime.firstDisplay=undefined;runtime.fadeUntil=0;runtime.blocked=false;runtime.menuOpen=false;runtime.setEditing(false);runtime.flight=undefined;runtime.currentPage=null;runtime.preparingMode=false;runtime.colliderLoading=false;state.time=Math.max(state.time,performance.now());runtime.last=state.time;};
state.ready=true;
`);
await build({entryPoints:{harness:path.join(output,'harness.ts'),'navigation.worker':'src/navigation.worker.ts','paged-physics.worker':'src/paged-physics.worker.ts'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[{name:'isolated-urls',setup(builder){
 builder.onResolve({filter:/^@dimforge\/rapier3d-compat\?url&no-inline$/},()=>({path:'physics-url',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "./unused-physics.mjs"',loader:'js'}));
 builder.onLoad({filter:/[\\/](walking-routes|paged-collider)\.ts$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8')).replaceAll('./navigation.worker.ts','./navigation.worker.js').replaceAll('./paged-physics.worker.ts','./paged-physics.worker.js'),loader:'ts',resolveDir:path.dirname(source)}));
 }}]});
const {server,url}=await startServer({root:output}),report={output,scope:'Controlled cadence through actual production feedback and Radix backend, with raw-interval production-frame probe; synthetic assets and headset hardware boundary only.',backends:[]};let browser;
const watchdog=setTimeout(()=>{console.error('Adaptive regression exceeded its180-second bound');void browser?.close();},180000);
try{
 browser=await chromium.launch({...(process.env.SPARK_BROWSER_EXECUTABLE?{executablePath:process.env.SPARK_BROWSER_EXECUTABLE}:{channel:process.env.SPARK_TEST_BROWSER_CHANNEL==='bundled'?undefined:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge'}),headless:true,timeout:30000,args:['--enable-webgl','--enable-unsafe-webgpu',...(process.env.RADIX_BACKEND_HARDWARE==='1'?[]:['--enable-unsafe-swiftshader','--use-webgpu-adapter=swiftshader'])]});
 for(const backend of ['webgpu','webgpu-gl']){
  const page=await browser.newPage({viewport:{width:256,height:128}});page.setDefaultTimeout(30000);const errors=[],messages=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))messages.push(m.text());});const results={backend,cases:[],messages};report.backends.push(results);
  const record=async(name,result)=>{results.cases.push({name,...result});console.log(backend+': '+name+'; scale='+result.scale+', budget='+result.budget+', selected='+result.selected);return result;};
  await page.goto(url+'index.html?radixBackend='+backend);await page.waitForFunction(()=>test?.ready&&test.runtime.ready&&test.runtime.backend.stats.loading===0);await page.evaluate(()=>test.halt());
  results.gpu=await page.evaluate(async()=>{const adapters=[];for(const options of [{featureLevel:'compatibility',xrCompatible:true},{featureLevel:'compatibility',xrCompatible:false},{}]){try{const a=await navigator.gpu?.requestAdapter(options);adapters.push({options,adapter:a?{...a.info,vendor:a.info.vendor,device:a.info.device,description:a.info.description,isFallbackAdapter:a.info.isFallbackAdapter}:null});}catch(error){adapters.push({options,error:String(error)});}}return adapters;});report.browser=browser.version();
  let state=await page.evaluate(async()=>{test.reset({});return test.settle();});await record('Initial actual backend and coverage',state);assert.equal(state.backend,backend);assert.equal(state.scale,1);const original=state.selected;assert.ok(original>12500,'actual scene exceeds adaptive minimum budget');
  await record('Real SOG scene starts at authored budget',state);
  state=await page.evaluate(()=>test.feedback(7000,20));assert.equal(state.scale,.75);assert.equal(state.budget,37500);assert.equal(state.base.radix.selectedSplatBudget,50000);await record('20 FPS below30 target reduces actual stream budget',state);
  state=await page.evaluate(()=>test.feedback(6000,20));assert.ok(state.scale<.75);assert.ok(state.selected<original,'actual LoD selection decreases, not just UI metadata');await record('Sustained slow cadence reduces selected splats',state);
  // Exercise the reported-pending-work gate independently of network timing;
  // all fixture files are local. Initial-cover loading is checked separately.
  state=await page.evaluate(()=>{test.runtime.mesh.stream.stats.loading=3;return test.feedback(6000,20);});assert.ok(state.scale<.5625,'reported refinement does not suppress adjustment');await record('Pending refinement count is not a feedback eligibility gate',state);
  state=await page.evaluate(async()=>{test.reset({});await test.tick(30000,.5);return test.settle();});assert.ok(state.scale<1,'repeated two-second render intervals must reduce actual detail');assert.ok(state.budget<50000);assert.ok(state.selected<original);await record('Sustained visible half-FPS cadence reduces the real selection',state);
  // Restore each individual gate and restart feedback before the next probe.
  for(const gate of ['loading','editing','blocked','menuOpen']){
   state=await page.evaluate(gate=>{test.reset({});if(gate==='loading')test.runtime.loading={sceneId:'test'};else test.runtime[gate]=true;return test.feedback(8000,20);},gate);assert.equal(state.scale,1,gate+' excludes the sample window');await record('Excludes '+gate,state);
  }
  state=await page.evaluate(()=>{test.reset({adaptiveDetail:false});return test.feedback(15000,20);});assert.equal(state.scale,1);assert.equal(state.budget,50000);await record('Opt-out retains authored budget',state);
  state=await page.evaluate(()=>{test.reset({});return test.feedback(60000,20);});assert.equal(state.scale,.25);assert.equal(state.budget,12500);assert.ok(state.selected>=8192,'mandatory available coarse coverage remains visible');await record('Bounded reduction retains source coverage',state);
  state=await page.evaluate(()=>test.feedback(55000,60));assert.equal(state.scale,1);assert.equal(state.budget,50000);await record('Healthy cadence cautiously restores authored budget',state);
  state=await page.evaluate(()=>{test.reset({radix:{lodRangeMin:0,lodRangeMax:0}});return test.feedback(60000,20);});assert.equal(state.scale,.25);assert.equal(state.budget,12500);assert.equal(state.selected,32768,'authored sole available level is a coverage floor, not missing imagery');await record('Authored LoD floor can exceed adaptive budget without dropping coverage',state);
  assert.deepEqual(await page.evaluate(()=>[JSON.stringify(test.authored)===test.authoredBefore,JSON.stringify(test.project)===test.projectBefore]),[true,true],'feedback never edits saved preset or scene data');
  if(backend==='webgpu-gl'){
   await page.evaluate(async()=>{test.reset({});await test.startXR();});
   state=await page.evaluate(()=>test.feedback(8000,60));assert.equal(state.manager,'XRManager');assert.equal(state.eyes,2);assert.equal(state.session,true);assert.ok(state.scale<1,'60 FPS meets desktop30 goal but not the real90Hz session goal');assert.match(state.controller.context,/xr:90$/);await record('Actual Three stereo session uses headset90Hz goal',state);
   state=await page.evaluate(()=>{test.reset({});test.sessions[0].frameRate=undefined;return test.feedback(8000,50);});assert.ok(state.scale<1);assert.match(state.controller.context,/xr:72$/);assert.equal(state.session,true);await record('Headset without reported refresh uses72Hz goal in the same session',state);
   state=await page.evaluate(()=>{test.reset({});test.sessions[0].visibilityState='visible-blurred';return test.feedback(10000,20);});assert.equal(state.scale,1,'system-menu suspension cannot lower scene budget');await record('XR system-menu suspension excludes samples',state);
   await page.evaluate(async()=>{test.sessions[0].visibilityState='visible';await test.sessions[0].end();test.runtime.renderer.setAnimationLoop(null);});
  }
  assert.deepEqual(errors,[]);results.errors=errors;results.pass=true;await page.evaluate(()=>test.runtime.dispose());await page.close();
 }
 report.pass=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('PASS: adaptive Radix production-frame/selection/coverage and headset goal integration; '+output);
}catch(error){report.error=String(error);await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));throw error;}
finally{clearTimeout(watchdog);await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
