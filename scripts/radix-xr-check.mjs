import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';
import {floorGlb} from '../tests/fixtures.mjs';

// The headset boundary is synthetic. The production TourRuntime, Radix SOG
// loading/sorting/rendering, Three XRManager and stereo camera math are real.
// In particular getSession/getCamera/updateCamera are never replaced.
const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const output=path.resolve('test-output','radix XR '+Date.now());await fs.mkdir(output,{recursive:true});
for(const[name,bytes]of Object.entries(sogLodFixture().files)){
 const file=path.join(output,'scan',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
}
await fs.writeFile(path.join(output,'floor.glb'),floorGlb());
await fs.copyFile(path.resolve('node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs'),path.join(output,'rapier.mjs'));
await fs.copyFile(path.resolve('node_modules/@recast-navigation/wasm/dist/recast-navigation.wasm.wasm'),path.join(output,'recast-navigation.wasm.wasm'));
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><link rel="icon" href="data:,"><style>html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden}</style><div id="stage"></div><script type="module" src="./harness.js"></script>');
await fs.writeFile(path.join(output,'harness.ts'),String.raw`
import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {SplatCamera} from '../../src/rendering/radix/vendor/radix.module.js';
import {TourRuntime} from '../../src/runtime';
import {blankProject,newScene,ProjectSchema} from '../../shared/project.mjs';
import {PerformanceSettingsSchema} from '../../shared/performance.mjs';
const state=window.test={errors:[],statuses:[],sessions:[],requests:[],layers:[],ready:false,time:performance.now(),head:new THREE.Vector3(.13,1.6,.17),orientation:new THREE.Quaternion().setFromEuler(new THREE.Euler(.08,.21,0,'YXZ'))};
Object.defineProperty(globalThis,'XRWebGLBinding',{configurable:true,value:undefined});
globalThis.XRWebGLLayer=class {
 constructor(session,gl,options){
  this.scale=options.framebufferScaleFactor;this.options=options;this.framebufferWidth=Math.round(800*this.scale);this.framebufferHeight=Math.round(600*this.scale);this.ignoreDepthValues=true;this.fixedFoveation=0;
  // A real framebuffer avoids the null-WebGLFramebuffer artifact of some XR
  // emulators. No Three backend/render state is patched to accommodate it.
  this.framebuffer=gl.createFramebuffer();this.texture=gl.createTexture();this.depth=gl.createRenderbuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER,this.framebuffer);gl.bindTexture(gl.TEXTURE_2D,this.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,this.framebufferWidth,this.framebufferHeight,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.texture,0);gl.bindRenderbuffer(gl.RENDERBUFFER,this.depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT24,this.framebufferWidth,this.framebufferHeight);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.depth);this.complete=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindTexture(gl.TEXTURE_2D,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);state.layers.push(this);
 }
 getViewport(view){return{x:view.eye==='left'?0:Math.floor(this.framebufferWidth/2),y:0,width:Math.floor(this.framebufferWidth/2),height:this.framebufferHeight};}
};
class Session extends EventTarget {
 inputSources=[];enabledFeatures=[];environmentBlendMode='opaque';visibilityState='visible';referenceSpace=new EventTarget();renderState={};callback=null;ended=0;
 requestAnimationFrame(callback){this.callback=callback;return 1;}
 cancelAnimationFrame(){this.callback=null;}
 updateRenderState(value){Object.assign(this.renderState,value);}
 async requestReferenceSpace(){if(state.failReferenceSpace){state.failReferenceSpace=false;throw Error('Fixture reference-space request failed');}return this.referenceSpace;}
 async end(){this.ended++;this.dispatchEvent(new Event('end'));}
}
Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:async(mode,options)=>{const session=new Session();state.sessions.push(session);state.requests.push({mode,options});return session;}}});
const runtime=state.runtime=await TourRuntime.create(document.querySelector('#stage'));
runtime.onStatus=(text,error)=>state.statuses.push({text,error});
// Observe, then forward, the actual timestamp-less Animation.start bootstrap
// invoked by Three when XR sessionend restores the desktop animation context.
// No frame timestamp is injected and no manager/callback is substituted.
state.animationBootstraps=[];const productionFrame=runtime.frame;
runtime.frame=function(time,frame){if(!Number.isFinite(time))state.animationBootstraps.push({type:typeof time,value:String(time),presenting:runtime.renderer.xr.isPresenting});return productionFrame.call(this,time,frame);};
// The native browser implementation is absent in headless mode; all renderer
// and manager code above this hardware compatibility bridge stays untouched.
runtime.renderer.backend.makeXRCompatible=async()=>{};
state.identities={manager:runtime.renderer.xr,renderer:runtime.renderer,camera:runtime.camera,rig:runtime.rig,canvas:runtime.renderer.domElement,array:runtime.renderer.xr.getCamera(),sortView:runtime.backend.node.view};
state.settings=scale=>PerformanceSettingsSchema.parse({...runtime.performanceSettings,pixelRatio:1,radix:{...runtime.performanceSettings.radix,xrResolutionScale:scale}});
runtime.applyPerformance(state.settings(.65));
const a=newScene('a','SOG A','scan/lod-meta.json'),b=newScene('b','SOG B','scan/lod-meta.json'),bad=newScene('bad','Failed SOG','missing/lod-meta.json');
for(const scene of [a,b,bad]){scene.modes=['jumps','fly','explore'];scene.collider='floor.glb';scene.background={type:'solid',color:'#183340'};}
b.transform={position:[2,0,-1],rotation:[0,.3,0],scale:1.4};b.vrScale=1.7;
const project=blankProject();project.scenes=[a,b,bad];project.startScene=a.id;
state.loading=runtime.load(ProjectSchema.parse(project),{assetBaseUrl:'./',sceneUrls:{}},location.href).then(()=>state.loaded=true).catch(error=>{state.errors.push(String(error));});
state.tick=(frames=1)=>{
 const rows=[];
 for(let index=0;index<frames;index++){
  const session=runtime.renderer.xr.getSession();if(!session?.callback)throw Error('No actual XRManager frame callback');
  state.time=Math.max(state.time,performance.now())+1000/72;const near=session.renderState.depthNear||.05,far=session.renderState.depthFar||20000;
  const projection=new THREE.Matrix4().makePerspective(-near,near,near,-near,near,far),unit=new THREE.Vector3(1,1,1),views=['left','right'].map((eye,i)=>({eye,transform:{matrix:new THREE.Matrix4().compose(state.head.clone().add(new THREE.Vector3(i?.032:-.032,0,0).applyQuaternion(state.orientation)),state.orientation,unit).elements},projectionMatrix:projection.elements}));
  const pose={views,transform:{matrix:new THREE.Matrix4().compose(state.head,state.orientation,unit).elements,position:{...state.head,w:1},orientation:{...state.orientation}}},frame={session,getViewerPose:()=>state.tracking===false?null:pose,getPose:space=>{const control=state.controls?.find(source=>source.targetRaySpace===space);const matrix=control?.pose??(state.ray&&session.inputSources.some(source=>source.targetRaySpace===space)?state.ray:null);return matrix?{transform:{matrix:matrix.elements}}:null;}};state.frame=frame;
  const callback=session.callback;session.callback=null;callback(state.time,frame);
  const array=runtime.renderer.xr.getCamera(),eyes=array.cameras.map(camera=>camera.getWorldPosition(new THREE.Vector3()));
  if(eyes.length!==2)throw Error('Actual manager did not create stereo eyes');
  const midpoint=eyes[0].clone().add(eyes[1]).multiplyScalar(.5),expected=runtime.rig.localToWorld(state.head.clone()),sortHead=runtime.backend.head.getWorldPosition(new THREE.Vector3()),radixHead=new THREE.Vector3().setFromMatrixPosition(SplatCamera.head.clone().invert()),proxy=array.getWorldPosition(new THREE.Vector3());
  rows.push({midpoint:midpoint.toArray(),expected:expected.toArray(),sortHead:sortHead.toArray(),radixHead:radixHead.toArray(),radixEyes:SplatCamera.eyes,proxy:proxy.toArray(),eyeError:midpoint.distanceTo(expected),sortHeadError:sortHead.distanceTo(midpoint),radixHeadError:radixHead.distanceTo(midpoint),proxyDistance:proxy.distanceTo(midpoint),eyes:array.cameras.map(camera=>({determinant:camera.matrixWorld.determinant(),projection:camera.projectionMatrix.elements.slice(),viewport:camera.viewport.toArray()})),mode:runtime.mode,scene:runtime.active?.id,ready:runtime.ready,shown:runtime.backend.stats.shown,drawCalls:runtime.renderer.info.render.drawCalls});
 }
 return rows;
};
state.snapshot=()=>({actualManager:runtime.renderer instanceof WebGPURenderer&&runtime.renderer.xr.constructor.name==='XRManager',managerClass:runtime.renderer.xr.constructor.name,frameClock:{averageMs:runtime.frameMs,lastTimestamp:runtime.last,averageFinite:Number.isFinite(runtime.frameMs)&&runtime.frameMs>0,lastFinite:Number.isFinite(runtime.last),bootstrapCallbacks:state.animationBootstraps.slice()},identities:{manager:runtime.renderer.xr===state.identities.manager,renderer:runtime.renderer===state.identities.renderer,camera:runtime.camera===state.identities.camera,rig:runtime.rig===state.identities.rig,canvas:runtime.renderer.domElement===state.identities.canvas,array:runtime.renderer.xr.getCamera()===state.identities.array,sortView:runtime.backend.node.view===state.identities.sortView,session:runtime.renderer.xr.getSession()===state.sessions[0]},scene:runtime.active?.id,mode:runtime.mode,ready:runtime.ready,world:!!runtime.world,body:!!runtime.body,presenting:runtime.renderer.xr.isPresenting,stats:{...runtime.getRenderStats()},views:runtime.backend.node.views.size,requests:state.requests,layers:state.layers.map(layer=>({scale:layer.scale,complete:layer.complete,width:layer.framebufferWidth,height:layer.framebufferHeight,foveation:layer.fixedFoveation})),sessions:state.sessions.map(session=>({ended:session.ended})),statuses:state.statuses,errors:state.errors});
state.change=id=>{state.changeDone=false;state.changeError='';void runtime.selectScene(id).then(()=>state.changeDone=true).catch(error=>{state.changeError=String(error);state.changeDone=true;});};
state.mode=mode=>{runtime.setMode(mode);state.modeDone=false;void Promise.resolve(runtime.modeTransition).then(()=>state.modeDone=true).catch(error=>{state.errors.push(String(error));state.modeDone=true;});};
state.attachRay=()=>{const session=runtime.renderer.xr.getSession(),source={handedness:'right',targetRayMode:'tracked-pointer',targetRaySpace:{},profiles:['oculus-touch-v3'],gamepad:{axes:[0,0,0,0],buttons:[]}};state.ray=new THREE.Matrix4().compose(new THREE.Vector3(.5,1.25,0),new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI/4,0,0)),new THREE.Vector3(1,1,1));session.inputSources.push(source);const event=new Event('inputsourceschange');event.added=[source];event.removed=[];session.dispatchEvent(event);state.source=source;state.tick();};
state.select=type=>{const session=runtime.renderer.xr.getSession(),event=new Event(type);event.inputSource=state.source;event.frame=state.frame;session.dispatchEvent(event);};
state.attachControls=()=>{
 const session=runtime.renderer.xr.getSession();state.controls=['left','right'].map((hand,index)=>({handedness:hand,targetRayMode:'tracked-pointer',targetRaySpace:{},profiles:['oculus-touch-v3'],gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false,touched:false,value:0}))},pose:new THREE.Matrix4().compose(new THREE.Vector3(index?.25:-.25,1.3,-.35),new THREE.Quaternion(),new THREE.Vector3(1,1,1))}));
 session.inputSources.push(...state.controls);const event=new Event('inputsourceschange');event.added=state.controls;event.removed=[];session.dispatchEvent(event);state.tick(3);
 return runtime.controllers.map(controller=>({visible:controller.visible,hand:controller.userData.handedness}));
};
state.controlEvent=(hand,type)=>{const session=runtime.renderer.xr.getSession(),source=state.controls.find(source=>source.handedness===hand),event=new Event(type);event.inputSource=source;event.frame=state.frame;session.dispatchEvent(event);};
state.selectWristMenu=()=>{
 const source=state.controls.find(source=>source.handedness==='right'),previous=source.pose.clone(),origin=new THREE.Vector3().setFromMatrixPosition(source.pose),target=runtime.rig.worldToLocal(runtime.wristMenu.getWorldPosition(new THREE.Vector3())),orientation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(origin,target,new THREE.Vector3(0,1,0)));
 source.pose.compose(origin,orientation,new THREE.Vector3(1,1,1));state.tick(2);runtime.controllerRay(runtime.controllers.find(controller=>controller.userData.handedness==='right'));const targetHit=runtime.hitUI()===runtime.wristMenu;state.controlEvent('right','selectstart');state.controlEvent('right','selectend');state.tick(2);source.pose.copy(previous);state.tick(2);return {targetHit,...state.controlSnapshot()};
};
state.controlsNeutral=()=>{for(const source of state.controls)source.gamepad.axes=[0,0,0,0];state.tick(2);};
state.controlSnapshot=()=>({position:runtime.rig.position.toArray(),rotation:runtime.rig.rotation.y,menuOpen:runtime.menuOpen,hudVisible:runtime.hud.visible,blocked:runtime.blocked,firstDisplay:!!runtime.firstDisplay,loading:!!runtime.loading,preparingMode:runtime.preparingMode,collisionMovementBlocked:runtime.collisionMovementBlocked,status:runtime.status,session:runtime.renderer.xr.getSession()===state.sessions[0],output:runtime.renderer.getOutputRenderTarget()===runtime.renderer.xr._xrRenderTarget});
state.readStereoPixels=()=>{
 const gl=runtime.renderer.backend.gl,layer=state.layers[0],previous=gl.getParameter(gl.FRAMEBUFFER_BINDING),readBuffer=gl.getParameter(gl.READ_BUFFER),pixels=new Uint8Array(layer.framebufferWidth*layer.framebufferHeight*4);
 try{gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.readPixels(0,0,layer.framebufferWidth,layer.framebufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,previous);gl.readBuffer(readBuffer);}
 return pixels;
};
state.menuPixels=()=>{
 const after=state.readStereoPixels(),before=state.closedPixels,layer=state.layers[0],eyes=runtime.renderer.xr.getCamera().cameras;
 runtime.hud.updateWorldMatrix(true,true);
 return eyes.map(eye=>{
  const points=[[-.96,-1.09],[.96,-1.09],[-.96,1.09],[.96,1.09]].map(([x,y])=>new THREE.Vector3(x,y,0).applyMatrix4(runtime.hud.matrixWorld).project(eye)),vp=eye.viewport;
  const xs=points.map(p=>vp.x+(p.x+1)*vp.z/2),ys=points.map(p=>vp.y+(p.y+1)*vp.w/2),minX=Math.max(vp.x,Math.floor(Math.min(...xs))),maxX=Math.min(vp.x+vp.z,Math.ceil(Math.max(...xs))),minY=Math.max(vp.y,Math.floor(Math.min(...ys))),maxY=Math.min(vp.y+vp.w,Math.ceil(Math.max(...ys)));let changed=0,bright=0,samples=0;
  for(let y=minY;y<maxY;y++)for(let x=minX;x<maxX;x++){const at=(y*layer.framebufferWidth+x)*4;samples++;if(Math.abs(after[at]-before[at])+Math.abs(after[at+1]-before[at+1])+Math.abs(after[at+2]-before[at+2])>45)changed++;if(after[at]>120&&after[at+1]>120&&after[at+2]>120)bright++;}
  return {region:[minX,minY,maxX,maxY],samples,changed,bright};
 });
};
state.detachControls=()=>{state.controlsNeutral();const session=runtime.renderer.xr.getSession(),removed=state.controls;session.inputSources=session.inputSources.filter(source=>!removed.includes(source));const event=new Event('inputsourceschange');event.added=[];event.removed=removed;session.dispatchEvent(event);state.controls=undefined;state.tick(2);};
state.ready=true;
`);
const progress=async stage=>{console.log(stage);await fs.writeFile(path.join(output,'progress.json'),JSON.stringify({stage,time:new Date().toISOString()}));};
await progress('Bundling real TourRuntime and workers');
await build({entryPoints:{harness:path.join(output,'harness.ts'),'navigation.worker':'src/navigation.worker.ts','paged-physics.worker':'src/paged-physics.worker.ts'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[{name:'isolated-urls',setup(builder){
 if(process.env.SPARK_RADIX_XR_BASELINE==='1')builder.onLoad({filter:/[\\/]src[\\/]runtime\.ts$/},({path:source})=>({contents:execFileSync('git',['show','HEAD:src/runtime.ts'],{encoding:'utf8',windowsHide:true}),loader:'ts',resolveDir:path.dirname(source)}));
 builder.onResolve({filter:/^@dimforge\/rapier3d-compat\?url&no-inline$/},()=>({path:'physics-url',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "./rapier.mjs"',loader:'js'}));
 // Expose the existing internal static camera for observation only. No Radix
 // method is wrapped or replaced; production code does not gain a test export.
 builder.onLoad({filter:/[\\/]radix[\\/]vendor[\\/]radix\.module\.js$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8'))+'\nexport {SplatCamera};\n',loader:'js',resolveDir:path.dirname(source)}));
 builder.onLoad({filter:/[\\/](walking-routes|paged-collider)\.ts$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8')).replaceAll('./navigation.worker.ts','./navigation.worker.js').replaceAll('./paged-physics.worker.ts','./paged-physics.worker.js'),loader:'ts',resolveDir:path.dirname(source)}));
 }}]});
if(process.env.SPARK_RADIX_PREPARE_ONLY==='1'){console.log('Prepared '+output);process.exit(0);}
const {server,url}=await startServer({root:output}),errors=[],consoleErrors=[],responses=[];let browser,page;
const report={output,runtimeSource:process.env.SPARK_RADIX_XR_BASELINE==='1'?'HEAD runtime baseline':'working tree',hardwareBoundary:'synthetic headset/session and real WebGL framebuffer; production Three XRManager/TourRuntime/Radix run unmodified',rows:[]};
try{
 await progress('Launching XR source fixture');browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL==='bundled'?undefined:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge',headless:true,timeout:30000,args:['--enable-webgl','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleErrors.push(message.text());});page.on('response',response=>{if(response.status()>=400)responses.push({url:response.url(),status:response.status()});});
 await page.goto(url+'index.html?radixBackend=webgpu-gl&diagnostics=1');await page.waitForFunction(()=>window.test?.ready);await page.waitForFunction(()=>test.runtime.ready);assert.equal(await page.evaluate(()=>test.runtime.backend.stats.backend),'webgpu-gl');
 const finiteClock=(snapshot,label)=>assert.ok(snapshot.frameClock.averageFinite&&snapshot.frameClock.lastFinite,label+' must retain a finite frame average and timestamp: '+JSON.stringify(snapshot.frameClock));
 report.startup=await page.evaluate(()=>test.snapshot());finiteClock(report.startup,'Actual desktop animation startup');
 await progress('Starting the actual Three XRManager');await page.evaluate(()=>test.runtime.enterXR());
 const first=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));report.first=first;assert.ok(first.snapshot.actualManager);assert.ok(Object.values(first.snapshot.identities).every(Boolean));assert.equal(first.snapshot.layers[0].scale,.65);assert.ok(first.snapshot.layers[0].complete);assert.ok(first.rows.every(row=>row.eyeError<1e-6));
 // Record the union-culling proxy offset as well as the physical eye midpoint;
 // this catches using Three's behind-head culling camera for LoD and sorting.
 await fs.writeFile(path.join(output,'head-audit.json'),JSON.stringify(first,null,2));
 assert.ok(first.rows.every(row=>row.sortHeadError<1e-6),'LoD/shared sort must use the physical stereo midpoint, not Three\'s shifted union-culling camera');
 assert.ok(first.rows.every(row=>row.radixHeadError<1e-6&&row.radixEyes===2),'actual Radix projection/sorting camera must share the physical stereo midpoint');
 async function pump(predicate,label,timeout=30000){const start=Date.now();while(Date.now()-start<timeout){const ready=await page.evaluate(predicate);if(ready)return;report.rows.push(...await page.evaluate(()=>test.tick()));await page.waitForTimeout(10);}throw Error('Timed out: '+label);}
 await progress('Checking real two-hand input events, locomotion and stereo menu pixels');
 report.controllers=await page.evaluate(()=>test.attachControls());assert.deepEqual(report.controllers.map(c=>c.hand),['left','right']);assert.ok(report.controllers.every(c=>c.visible),'actual XRManager receives both tracked poses');
 await page.evaluate(()=>test.mode('fly'));await pump(()=>test.modeDone&&!test.runtime.preparingMode,'controller Drone');
 report.controls={};
 report.controls.fly=await page.evaluate(()=>{test.controlsNeutral();const before=test.controlSnapshot();test.controls[0].gamepad.axes=[0,0,.6,-.65];test.tick(30);const after=test.controlSnapshot();test.controlsNeutral();return{before,after};});
 assert.ok(Math.hypot(...report.controls.fly.after.position.map((n,i)=>n-report.controls.fly.before.position[i]))>.1,'left stick must translate Drone through real XR frames: '+JSON.stringify(report.controls.fly));
 report.controls.lift=await page.evaluate(()=>{const before=test.controlSnapshot();test.controls[1].gamepad.axes=[0,0,0,-.7];test.tick(24);const after=test.controlSnapshot();test.controlsNeutral();return{before,after};});assert.ok(report.controls.lift.after.position[1]-report.controls.lift.before.position[1]>.1,'right vertical stick must lift Drone');
 report.controls.snap=await page.evaluate(()=>{const before=test.controlSnapshot();test.controls[1].gamepad.axes=[0,0,.9,0];test.tick(12);const after=test.controlSnapshot();test.controlsNeutral();return{before,after};});assert.ok(Math.abs(Math.abs(report.controls.snap.after.rotation-report.controls.snap.before.rotation)-Math.PI/6)<1e-6,'a held right stick makes exactly one30-degree snap');
 await page.evaluate(()=>{test.controlsNeutral();test.tick(3);test.closedPixels=test.readStereoPixels();test.controlEvent('left','squeezestart');test.tick(3);});await page.waitForTimeout(100);await page.evaluate(()=>test.tick(3));
 report.controls.menu=await page.evaluate(()=>({state:test.controlSnapshot(),pixels:test.menuPixels(),labels:test.runtime.hud.children.map(c=>c.userData.label).filter(Boolean)}));assert.ok(report.controls.menu.state.menuOpen&&report.controls.menu.state.hudVisible,'a native squeeze event must open the menu');
 assert.ok(report.controls.menu.pixels.every(eye=>eye.samples>500&&eye.changed>300&&eye.bright>30),'menu backgrounds and text must actually render in both eye framebuffers: '+JSON.stringify(report.controls.menu));
 report.controls.menuBlocked=await page.evaluate(()=>{const before=test.controlSnapshot();test.controls[0].gamepad.axes=[0,0,.6,-.65];test.controls[1].gamepad.axes=[0,0,.9,-.7];test.tick(24);const after=test.controlSnapshot();test.controlsNeutral();return{before,after};});assert.deepEqual(report.controls.menuBlocked.after.position,report.controls.menuBlocked.before.position,'open menu blocks locomotion');assert.equal(report.controls.menuBlocked.after.rotation,report.controls.menuBlocked.before.rotation,'open menu blocks turning');
 await page.evaluate(()=>{test.controlEvent('left','squeezestart');test.tick(2);});assert.equal(await page.evaluate(()=>test.runtime.menuOpen),false,'the same grip closes the menu');
 report.controls.afterClose=await page.evaluate(()=>{const before=test.controlSnapshot();test.controls[0].gamepad.axes=[0,0,0,-.65];test.tick(24);const after=test.controlSnapshot();test.controlsNeutral();return{before,after};});assert.ok(Math.hypot(...report.controls.afterClose.after.position.map((n,i)=>n-report.controls.afterClose.before.position[i]))>.1,'closing menu restores locomotion');
 report.controls.wristOpen=await page.evaluate(()=>test.selectWristMenu());assert.ok(report.controls.wristOpen.targetHit&&report.controls.wristOpen.menuOpen&&report.controls.wristOpen.hudVisible,'a tracked right controller ray opens the left wrist menu');
 report.controls.wristClose=await page.evaluate(()=>test.selectWristMenu());assert.ok(report.controls.wristClose.targetHit&&!report.controls.wristClose.menuOpen&&!report.controls.wristClose.hudVisible,'the same wrist action closes the menu');
 await page.evaluate(()=>test.mode('explore'));await pump(()=>test.modeDone&&!test.runtime.preparingMode,'controller Walk');
 report.controls.walk=await page.evaluate(()=>{const before=test.controlSnapshot();test.controls[0].gamepad.axes=[0,0,.5,-.6];test.tick(30);const after=test.controlSnapshot();test.controlsNeutral();return{before,after,body:test.runtime.body.translation()};});assert.ok(Math.hypot(report.controls.walk.after.position[0]-report.controls.walk.before.position[0],report.controls.walk.after.position[2]-report.controls.walk.before.position[2])>.1,'left stick must move Walk against the actual floor');assert.ok(Math.abs(report.controls.walk.after.position[1]-report.controls.walk.before.position[1])<.15,'walking remains grounded');assert.ok(report.controls.walk.after.session,'input actions retain the same session');
 await page.evaluate(()=>test.detachControls());
 await progress('Checking modes with real deferred collision physics');
 for(const mode of ['fly','explore','jumps']){await page.evaluate(mode=>test.mode(mode),mode);await pump(()=>test.modeDone&&!test.runtime.preparingMode,'mode '+mode);const item=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));assert.equal(item.snapshot.mode,mode);assert.ok(Object.values(item.snapshot.identities).every(Boolean));if(mode!=='jumps')assert.ok(item.snapshot.world&&item.snapshot.body);assert.ok(item.rows.every(row=>row.eyeError<1e-6&&row.sortHeadError<1e-6&&row.radixHeadError<1e-6&&row.radixEyes===2));report[mode]=item;
  if(mode==='explore'){
   await page.evaluate(()=>test.attachRay());report.walkTeleports=[];
   for(let index=0;index<2;index++){
    const teleport=await page.evaluate(()=>{const r=test.runtime,before=test.tick()[0];test.select('selectstart');const target=r.teleportPoint?.toArray(),ring=r.teleportRing.visible;test.select('selectend');const after=test.tick(3).at(-1);return{before,after,target,ring,snapshot:test.snapshot()};});
    assert.ok(teleport.ring&&teleport.target,'a tracked controller selects a valid real floor landing');assert.ok(Math.hypot(...teleport.before.midpoint.map((value,i)=>value-teleport.after.midpoint[i]))>.5,'trigger release actually teleports the tracked head');assert.ok(teleport.after.eyeError<1e-6&&teleport.after.sortHeadError<1e-6&&teleport.after.radixHeadError<1e-6);assert.ok(Object.values(teleport.snapshot.identities).every(Boolean));report.walkTeleports.push(teleport);
   }
  }
 }
 await progress('Switching SOG scenes without changing the XR session');await page.evaluate(()=>test.change('b'));await pump(()=>test.changeDone&&test.runtime.ready,'second SOG first draw');const changed=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));report.changed=changed;assert.equal(changed.snapshot.scene,'b');assert.ok(Object.values(changed.snapshot.identities).every(Boolean));assert.equal(changed.snapshot.views,1);assert.ok(changed.rows.every(row=>row.eyeError<1e-6&&row.sortHeadError<1e-6&&row.radixHeadError<1e-6&&row.radixEyes===2));
 await progress('Recovering a failed destination inside the same session');await page.evaluate(()=>test.change('bad'));await pump(()=>test.changeDone&&!test.runtime.loading,'failed destination');const failed=await page.evaluate(()=>test.snapshot());report.failed=failed;assert.ok(failed.statuses.some(value=>value.error&&/404/.test(value.text)));assert.ok(Object.values(failed.identities).every(Boolean));await page.evaluate(()=>test.change('a'));await pump(()=>test.changeDone&&test.runtime.ready,'recovered SOG');report.recovered=await page.evaluate(()=>test.snapshot());assert.ok(Object.values(report.recovered.identities).every(Boolean));
 await progress('Retaining Walk during transformed scene and VR-scale changes');await page.evaluate(()=>test.mode('explore'));await pump(()=>test.modeDone&&!test.runtime.preparingMode,'walk before scaled scene');await page.evaluate(()=>test.change('b'));await pump(()=>test.changeDone&&test.runtime.ready,'scaled walking scene');report.scaledWalk=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));assert.equal(report.scaledWalk.snapshot.mode,'explore');assert.ok(report.scaledWalk.snapshot.world&&report.scaledWalk.snapshot.body);assert.ok(Object.values(report.scaledWalk.snapshot.identities).every(Boolean));assert.ok(report.scaledWalk.rows.every(row=>row.eyeError<1e-6&&row.sortHeadError<1e-6&&row.radixHeadError<1e-6&&row.radixEyes===2&&row.eyes.every(eye=>Math.abs(eye.determinant-1)<1e-6)));
 await progress('Checking next-session scale and failed-session cleanup');await page.evaluate(()=>test.runtime.applyPerformance(test.settings(1.2)));assert.equal(await page.evaluate(()=>test.layers[0].scale),.65,'active eye buffer remains unchanged');report.afterSessionEnd=await page.evaluate(async()=>{await test.sessions[0].end();return test.snapshot();});finiteClock(report.afterSessionEnd,'Actual XR sessionend animation restart');assert.ok(report.afterSessionEnd.frameClock.bootstrapCallbacks.length>0,'the actual Three animation restart exercised a timestamp-less callback');await page.evaluate(()=>test.runtime.enterXR());const second=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));report.second=second;finiteClock(second.snapshot,'XR re-entry');assert.equal(second.snapshot.layers[1].scale,1.2);assert.equal(second.snapshot.requests.length,2);assert.equal(second.snapshot.sessions[0].ended,1);assert.ok(second.rows.every(row=>row.eyeError<1e-6&&row.sortHeadError<1e-6&&row.radixHeadError<1e-6&&row.radixEyes===2));
 await page.evaluate(async()=>{await test.sessions[1].end();test.failReferenceSpace=true;await test.runtime.enterXR();});const broken=await page.evaluate(()=>test.snapshot());report.sessionFailure=broken;finiteClock(broken,'Failed session initialization cleanup');assert.equal(broken.sessions[2].ended,1,'failed session initialization releases the newly requested session');assert.equal(broken.presenting,false);await page.evaluate(()=>test.runtime.enterXR());const final=await page.evaluate(()=>({snapshot:test.snapshot(),rows:test.tick(3)}));report.final=final;finiteClock(final.snapshot,'Subsequent recovered XR session');assert.equal(final.snapshot.requests.length,4);assert.ok(final.snapshot.presenting);assert.ok(final.rows.every(row=>row.eyeError<1e-6&&row.sortHeadError<1e-6&&row.radixHeadError<1e-6&&row.radixEyes===2));
 const readbackObserverWarnings=consoleErrors.filter(text=>/^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(text));
 report.readbackObserverWarnings=readbackObserverWarnings;
 const unexpectedConsole=consoleErrors.filter(text=>!text.startsWith("THREE.TSL: Return statement used in an inline 'Fn()'. Define a layout struct to allow return values.")&&!/^Failed to load resource: the server responded with a status of 404/.test(text)&&!readbackObserverWarnings.includes(text));
 assert.deepEqual(errors,[]);assert.deepEqual(final.snapshot.errors,[]);assert.deepEqual(unexpectedConsole,[],'no unexpected browser/GPU validation errors');assert.ok(final.snapshot.stats.frames>0);report.browser=browser.version();report.errors=errors;report.console=consoleErrors;report.failedResponses=responses;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('PASS real Three XRManager: configured eye buffers, physical stereo/shared sort head, scene/mode/failure continuity and failed-session cleanup. '+output);
}catch(error){report.error=String(error);report.stack=error.stack;report.errors=errors;report.console=consoleErrors;report.failedResponses=responses;if(page)report.state=await page.evaluate(()=>window.test?.snapshot()).catch(()=>null);await fs.writeFile(path.join(output,'failure.json'),JSON.stringify(report,null,2));throw error;}
finally{if(page)await page.evaluate(async()=>{await test.runtime.renderer.xr.getSession()?.end();test.runtime.dispose();}).catch(()=>{});await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
