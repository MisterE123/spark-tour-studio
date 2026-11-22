import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

// Synthetic native session/binding boundary only. The projection textures,
// production TourRuntime/Radix, common Three XRManager and draw calls are real.
// OVR_multiview2 is used only when the actual browser exposes the extension.
const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const output=path.resolve('test-output','radix XR layers '+Date.now());await fs.mkdir(output,{recursive:true});
for(const folder of ['scan','second-scan'])for(const[name,bytes]of Object.entries(sogLodFixture().files)){const file=path.join(output,folder,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><link rel="icon" href="data:,"><style>html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden}</style><div id="stage"></div><script type="module" src="./harness.js"></script>');
await fs.writeFile(path.join(output,'record.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="512" height="768"><rect width="512" height="768" fill="#dad7c6"/><path d="M48 96H464M48 216H396M48 286H464M48 356H410M48 426H444" stroke="#334753" stroke-width="20"/></svg>');
await fs.writeFile(path.join(output,'harness.ts'),String.raw`
import * as THREE from 'three';
import {WebGPURenderer} from 'three/webgpu';
import {TourRuntime} from '../../src/runtime';
import {createRadixBackend} from '../../src/rendering/radix';
import {blankProject,newScene,ProjectSchema} from '../../shared/project.mjs';
import {plainTextDocument} from '../../shared/rich-text.mjs';
const state=window.test={sessions:[],layers:[],errors:[],statuses:[],time:performance.now(),head:new THREE.Vector3(0,1.6,0),orientation:new THREE.Quaternion(),ready:false};
globalThis.XRWebGLBinding=class {
 constructor(session,gl){this.session=session;this.gl=gl;}
 createProjectionLayer(init){
  const gl=this.gl,array=init.textureType==='texture-array',scale=init.scaleFactor;
  const layer={textureWidth:Math.round((array?400:800)*scale),textureHeight:Math.round(600*scale),ignoreDepthValues:false,fixedFoveation:0,scale,array,init};
  const target=array?gl.TEXTURE_2D_ARRAY:gl.TEXTURE_2D,previous=gl.getParameter(array?gl.TEXTURE_BINDING_2D_ARRAY:gl.TEXTURE_BINDING_2D);
  layer.texture=gl.createTexture();gl.bindTexture(target,layer.texture);
  if(array)gl.texStorage3D(target,1,gl.RGBA8,layer.textureWidth,layer.textureHeight,2);else gl.texStorage2D(target,1,gl.RGBA8,layer.textureWidth,layer.textureHeight);
  gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(target,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  layer.depth=gl.createTexture();gl.bindTexture(target,layer.depth);
  if(array)gl.texStorage3D(target,1,gl.DEPTH_COMPONENT24,layer.textureWidth,layer.textureHeight,2);else gl.texStorage2D(target,1,gl.DEPTH_COMPONENT24,layer.textureWidth,layer.textureHeight);
  gl.texParameteri(target,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(target,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.bindTexture(target,previous);state.layers.push(layer);return layer;
 }
 getViewSubImage(layer,view){return{colorTexture:layer.texture,depthStencilTexture:layer.depth,imageIndex:view.eye==='left'?0:1,viewport:{x:layer.array?0:view.eye==='left'?0:Math.floor(layer.textureWidth/2),y:0,width:layer.array?layer.textureWidth:Math.floor(layer.textureWidth/2),height:layer.textureHeight}};}
};
class Session extends EventTarget {
 inputSources=[];enabledFeatures=['local-floor','layers'];environmentBlendMode='opaque';visibilityState='visible';referenceSpace=new EventTarget();renderState={};callback=null;ended=0;
 requestAnimationFrame(callback){this.callback=callback;return 1;}cancelAnimationFrame(){this.callback=null;}updateRenderState(value){Object.assign(this.renderState,value);}async requestReferenceSpace(){return this.referenceSpace;}async end(){this.ended++;this.dispatchEvent(new Event('end'));}
}
Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:async()=>{const session=new Session();state.sessions.push(session);return session;}}});
const backend=await createRadixBackend({backend:'webgpu-gl',xr:true,multiview:new URL(location.href).searchParams.get('multiview')!=='0',directCanvas:false});
const runtime=state.runtime=new TourRuntime(document.querySelector('#stage'),backend);runtime.onStatus=(text,error)=>state.statuses.push({text,error});
// Headless browsers have no native immersive context. No render/manager method
// above this context-compatibility boundary is replaced.
runtime.renderer.backend.makeXRCompatible=async()=>{};
const gl=runtime.renderer.backend.gl,debug=gl.getExtension('WEBGL_debug_renderer_info');
const ovr=gl.getExtension('OVR_multiview2');state.capabilities={ovr:!!ovr,ovrFramebufferMultisample:typeof ovr?.framebufferTextureMultisampleMultiviewOVR==='function',renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),extensions:gl.getSupportedExtensions(),multiviewRequested:new URL(location.href).searchParams.get('multiview')!=='0'};
state.identity={renderer:runtime.renderer,manager:runtime.renderer.xr,camera:runtime.camera,rig:runtime.rig,array:runtime.renderer.xr.getCamera(),canvas:runtime.renderer.domElement};
const scene=newScene('scene','Projection layer SOG','scan/lod-meta.json');scene.modes=['jumps','fly'];scene.background={type:'solid',color:'#183340'};scene.hotspots=[{id:'info',label:'Projection bubble',position:[0,1.6,-2],kind:'page',target:'bubble-page'}];
scene.viewpoints[0].extendedDescription={enabled:true,richText:plainTextDocument('Continue from the first stop.'),links:[{id:'visit-second',label:'Visit second scene',sceneId:'second'}]};
const second=newScene('second','Second scene','second-scan/lod-meta.json');second.hotspots=structuredClone(scene.hotspots);second.background=scene.background;
const project=blankProject();project.scenes=[scene,second];project.startScene=scene.id;project.pages=[{id:'bubble-page',title:'Projection bubble',html:'',blocks:[{type:'image',text:'',url:'record.svg'},{type:'text',text:'A story to scroll.\n'.repeat(32),url:''}]}];
state.loaded=runtime.load(ProjectSchema.parse(project),{assetBaseUrl:'./',sceneUrls:{}},location.href).catch(error=>state.errors.push(String(error)));
state.tick=(frames=1)=>{for(let n=0;n<frames;n++){
 const session=runtime.renderer.xr.getSession();if(!session?.callback)throw Error('Missing actual XRManager callback');state.time=Math.max(state.time,performance.now())+1000/72;
 const near=session.renderState.depthNear||.05,far=session.renderState.depthFar||20000,projection=new THREE.Matrix4().makePerspective(-near,near,near,-near,near,far),unit=new THREE.Vector3(1,1,1),views=['left','right'].map((eye,index)=>({eye,transform:{matrix:new THREE.Matrix4().compose(state.head.clone().add(new THREE.Vector3(index?.032:-.032,0,0)),state.orientation,unit).elements},projectionMatrix:projection.elements}));
 const pose={views,transform:{matrix:new THREE.Matrix4().compose(state.head,state.orientation,unit).elements,position:{...state.head,w:1},orientation:{...state.orientation}}};
 const frame={session,getViewerPose:()=>pose,getPose:space=>{const source=state.controls?.find(s=>s.targetRaySpace===space);return source&&!source.untracked?{transform:{matrix:source.pose.elements}}:null;}};state.frame=frame;const callback=session.callback;session.callback=null;callback(state.time,frame);
 }};
state.attach=()=>{const session=runtime.renderer.xr.getSession();state.controls=['left','right'].map((hand,index)=>({handedness:hand,targetRayMode:'tracked-pointer',targetRaySpace:{},profiles:['oculus-touch-v3'],gamepad:{mapping:'xr-standard',axes:[0,0,0,0],buttons:Array.from({length:6},()=>({pressed:false,touched:false,value:0}))},pose:new THREE.Matrix4().compose(new THREE.Vector3(index?.25:-.25,1.3,-.35),new THREE.Quaternion(),new THREE.Vector3(1,1,1))}));session.inputSources.push(...state.controls);const event=new Event('inputsourceschange');event.added=state.controls;event.removed=[];session.dispatchEvent(event);state.tick(3);};
state.event=(type,hand='left')=>{const event=new Event(type);event.inputSource=state.controls.find(s=>s.handedness===hand);event.frame=state.frame;runtime.renderer.xr.getSession().dispatchEvent(event);};
state.aimPoint=(point,hand='right',jitter=0)=>{
 const source=state.controls.find(item=>item.handedness===hand),origin=new THREE.Vector3().setFromMatrixPosition(source.pose),target=runtime.rig.worldToLocal(point.clone());
 const rotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(origin,target,new THREE.Vector3(0,1,0)));
 rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),jitter));
 source.pose.compose(origin,rotation,new THREE.Vector3(1,1,1));state.tick(3);
 runtime.controllerRay(runtime.controllers.find(controller=>controller.userData.handedness===hand));
 return runtime.hitUI();
};
state.aim=(object,hand='right',jitter=0)=>state.aimPoint(object.getWorldPosition(new THREE.Vector3()),hand,jitter);
state.button=(label,y)=>runtime.hud.children.find(object=>object.userData.label===label&&(y===undefined||object.position.y===y));
state.click=(object,hand='right')=>{
 if(!object||state.aim(object,hand)!==object)return false;
 state.event('selectstart',hand);state.event('selectend',hand);state.tick(3);return true;
};
state.bubble=()=>runtime.bubbles.children.find(item=>item.userData.id==='info');
state.card=()=>runtime.hud.children.find(object=>object.userData.contentCard);
state.aimBubble=pitch=>{
 state.orientation.setFromEuler(new THREE.Euler(pitch,0,0));
 state.controls[0].pose.setPosition(new THREE.Vector3(-.24,-.25,-.55).applyQuaternion(state.orientation).add(state.head));state.tick(3);
 const eye=runtime.trackedHeadPosition(),direction=runtime.camera.getWorldDirection(new THREE.Vector3());
 const bubble=state.bubble();
 bubble.position.copy(runtime.bubbles.worldToLocal(eye.clone().addScaledVector(direction,3)));
 return state.aim(bubble)===bubble;
};
state.read=()=>{
 const layer=state.layers.at(-1),previousRead=gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),previousDraw=gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),readBuffer=gl.getParameter(gl.READ_BUFFER),framebuffer=gl.createFramebuffer(),eyes=[];
 try{gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.readBuffer(gl.COLOR_ATTACHMENT0);for(let eye=0;eye<2;eye++){
  if(layer.array)gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,layer.texture,0,eye);else gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,layer.texture,0);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Projection texture is not framebuffer complete');
  const width=layer.array?layer.textureWidth:Math.floor(layer.textureWidth/2),pixels=new Uint8Array(width*layer.textureHeight*4);gl.readPixels(layer.array?0:eye*width,0,width,layer.textureHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);eyes.push({width,height:layer.textureHeight,pixels});
 }}finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,previousRead);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,previousDraw);gl.readBuffer(readBuffer);gl.deleteFramebuffer(framebuffer);}return eyes;
};
state.compare=(regions)=>{const after=state.read(),before=state.before;return after.map((eye,index)=>{let changed=0,bright=0;for(let i=0;i<eye.pixels.length;i+=4){const pixel=i/4,x=(pixel%eye.width)/eye.width,y=Math.floor(pixel/eye.width)/eye.height;const bounds=regions?.[index];if(bounds&&(x<bounds[0]||x>bounds[1]||y<bounds[2]||y>bounds[3]))continue;const differs=Math.abs(eye.pixels[i]-before[index].pixels[i])+Math.abs(eye.pixels[i+1]-before[index].pixels[i+1])+Math.abs(eye.pixels[i+2]-before[index].pixels[i+2])>45;if(differs)changed++;if((!bounds||differs)&&eye.pixels[i]>120&&eye.pixels[i+1]>120&&eye.pixels[i+2]>120)bright++;}return{width:eye.width,height:eye.height,changed,bright};});};
state.content=()=>{
 const card=state.card(),{width,height}=card.geometry.parameters,eyes=runtime.renderer.xr.getCamera().cameras;
 const regions=eyes.map(eye=>{
  const corners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>card.localToWorld(new THREE.Vector3(x*width/2,y*height/2,0)).project(eye));
  return [Math.min(...corners.map(p=>p.x)),Math.max(...corners.map(p=>p.x)),Math.min(...corners.map(p=>p.y)),Math.max(...corners.map(p=>p.y))].map(v=>(v+1)/2);
 });
 return {page:runtime.currentPage?.id,visible:runtime.hud.visible,mount:runtime.hudMount,shade:runtime.readingShade.visible,anchor:runtime.hud.getWorldPosition(new THREE.Vector3()).toArray(),physicalWidth:width*card.getWorldScale(new THREE.Vector3()).x,center:eyes.map(eye=>runtime.hud.getWorldPosition(new THREE.Vector3()).project(eye).toArray()),regions,pixels:state.compare(regions),surfaces:runtime.hud.children.flatMap(object=>{const image=object.material?.map?.image;return image?[[image.width,image.height]]:[];}),images:runtime.hud.children.filter(object=>object.userData.imageState).map(object=>object.userData.imageState)};
};
state.mount=()=>({kind:runtime.hudMount,anchor:runtime.hud.position.toArray(),leftPointing:runtime.controllers.find(c=>c.userData.handedness==='left').userData.rayLine.visible,rightPointing:runtime.controllers.find(c=>c.userData.handedness==='right').userData.rayLine.visible});
state.tonePixels=()=>{
 const image=state.button('Enlarge image'),eyes=runtime.renderer.xr.getCamera().cameras;
 const samples=()=>state.read().map(({pixels,width,height},index)=>{
  const projected=image.getWorldPosition(new THREE.Vector3()).project(eyes[index]);
  const sample=(x,y)=>{const i=(Math.floor(y*height)*width+Math.floor(x*width))*4;return pixels[i]+pixels[i+1]+pixels[i+2];};
  return {content:sample((projected.x+1)/2,(projected.y+1)/2),world:[[.05,.05],[.95,.05],[.05,.95],[.95,.95]].map(([x,y])=>sample(x,y))};
 });
 const dimmed=samples();
 runtime.readingShade.visible=false;state.tick(2);const undimmed=samples();
 runtime.readingShade.visible=true;runtime.fadeUntil=performance.now()+1000;state.tick(2);
 const motionVisible=runtime.fade.visible,motion=samples();
 runtime.fadeUntil=0;state.tick(2);return {dimmed,undimmed,motion,motionVisible};
};
state.snapshot=()=>({capabilities:state.capabilities,actualManager:runtime.renderer instanceof WebGPURenderer&&runtime.renderer.xr.constructor.name==='XRManager',identities:{renderer:runtime.renderer===state.identity.renderer,manager:runtime.renderer.xr===state.identity.manager,camera:runtime.camera===state.identity.camera,rig:runtime.rig===state.identity.rig,array:runtime.renderer.xr.getCamera()===state.identity.array,canvas:runtime.renderer.domElement===state.identity.canvas,session:runtime.renderer.xr.getSession()===state.sessions[0]},presenting:runtime.renderer.xr.isPresenting,multiview:runtime.renderer.xr.useMultiview(),projectionLayer:runtime.renderer.xr._glProjLayer===state.layers.at(-1),output:runtime.renderer.getOutputRenderTarget()===runtime.renderer.xr._xrRenderTarget,eyes:runtime.renderer.xr.getCamera().cameras.map(eye=>({position:eye.getWorldPosition(new THREE.Vector3()).toArray(),viewport:eye.viewport.toArray(),determinant:eye.matrixWorld.determinant()})),hudVisible:runtime.hud.visible,menuOpen:runtime.menuOpen,wristVisible:runtime.wristMenu.visible,controllers:runtime.controllers.map(c=>({visible:c.visible,hand:c.userData.handedness})),layers:state.layers.map(l=>({width:l.textureWidth,height:l.textureHeight,array:l.array,init:l.init})),stats:{...runtime.backend.stats},errors:state.errors,statuses:state.statuses,glError:gl.getError()});
state.ready=true;
`);
await build({entryPoints:{harness:path.join(output,'harness.ts'),'navigation.worker':'src/navigation.worker.ts','paged-physics.worker':'src/paged-physics.worker.ts'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[{name:'fixture-worker-urls',setup(builder){
 if(process.env.SPARK_RADIX_XR_BASELINE==='1')builder.onLoad({filter:/[\\/]src[\\/]runtime\.ts$/},({path:source})=>({contents:execFileSync('git',['show','HEAD:src/runtime.ts'],{encoding:'utf8',windowsHide:true}),loader:'ts',resolveDir:path.dirname(source)}));
 builder.onResolve({filter:/^@dimforge\/rapier3d-compat\?url&no-inline$/},()=>({path:'physics-url',namespace:'fixture'}));builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "./unused-physics.mjs"',loader:'js'}));
 builder.onLoad({filter:/[\\/](walking-routes|paged-collider)\.ts$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8')).replaceAll('./navigation.worker.ts','./navigation.worker.js').replaceAll('./paged-physics.worker.ts','./paged-physics.worker.js'),loader:'ts',resolveDir:path.dirname(source)}));
 }}]});
if(process.env.SPARK_RADIX_PREPARE_ONLY==='1'){console.log('Prepared '+output);process.exit(0);}
const {server,url}=await startServer({root:output}),report={output,hardwareBoundary:'synthetic session and XRWebGLBinding; actual projection textures, Three XRManager, Radix, TourRuntime and GPU draws',rows:[]};let browser,page;
try{
 const hardware=process.env.SPARK_XR_HARDWARE==='1',args=['--enable-webgl','--enable-unsafe-webgpu',...(process.env.SPARK_XR_DRAFT_EXTENSIONS==='1'?['--enable-webgl-draft-extensions']:[]),...(hardware?[]:['--enable-unsafe-swiftshader','--use-angle=swiftshader'])];
 browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL==='bundled'?undefined:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge',headless:true,timeout:30000,args});report.browser=browser.version();report.hardwareRequested=hardware;
 for(const multiview of [false,true]){
  const errors=[],messages=[];page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['warning','error'].includes(m.type()))messages.push(m.text());});
  let failSecond=true;
  await page.route('**/second-scan/lod-meta.json',route=>failSecond?route.fulfill({status:404,body:'Intentional metadata failure before retry'}):route.continue());
  const row={multiviewRequested:multiview,errors,messages};report.rows.push(row);
  await page.goto(url+'index.html?multiview='+(multiview?'1':'0'));await page.waitForFunction(()=>window.test?.ready&&test.runtime.ready);
  row.capabilities=await page.evaluate(()=>test.capabilities);
  if(multiview&&row.capabilities.ovr&&!row.capabilities.ovrFramebufferMultisample){
   // Desktop ANGLE can advertise OVR_multiview2 without the multisample entry
   // required by this pinned Three backend. Do not emulate that native method
   // or claim this machine proves Quest multiview rendering.
   row.unavailable='Native OVR_multiview2 lacks framebufferTextureMultisampleMultiviewOVR; genuine multiview requires headset validation.';await page.evaluate(()=>test.runtime.dispose());await page.close();page=undefined;continue;
  }
  await page.evaluate(()=>test.runtime.enterXR());await page.evaluate(()=>{test.tick(5);test.attach();});
  // Pipeline compilation is asynchronous. Observe real subsequent draws before
  // comparing the two actual projection texture layers/eye viewports.
  await page.waitForTimeout(100);await page.evaluate(()=>{test.tick(5);test.before=test.read();test.event('squeezestart');test.tick(3);});await page.waitForTimeout(100);await page.evaluate(()=>test.tick(5));
  row.open=await page.evaluate(()=>({state:test.snapshot(),pixels:test.compare()}));
  assert.ok(row.open.state.actualManager&&row.open.state.projectionLayer&&row.open.state.output);assert.ok(Object.values(row.open.state.identities).every(Boolean));assert.ok(row.open.state.controllers.every(c=>c.visible));assert.ok(row.open.state.menuOpen&&row.open.state.hudVisible);
  assert.equal(row.open.state.layers[0].array,multiview&&row.open.state.capabilities.ovr,'only genuine OVR support enables texture-array multiview');assert.equal(row.open.state.multiview,row.open.state.layers[0].array);assert.ok(row.open.pixels.every(eye=>eye.changed>300&&eye.bright>30),'menu background and text must draw into both actual projection eye textures: '+JSON.stringify(row.open));assert.ok(row.open.state.eyes.every(e=>Math.abs(e.determinant-1)<1e-6));assert.equal(row.open.state.glError,0);
  row.mount=await page.evaluate(()=>{
   const initial=test.mount(),left=test.controls[0];left.pose.elements[12]+=.10;test.tick(3);const moved=test.mount();
   const scene=test.runtime.active.id;left.untracked=true;test.tick(3);const fallback=test.mount();
   const settings=test.click(test.button('Settings'));const settingsOpen=!!test.button('Turning: 30° snap');
   left.untracked=false;test.tick(3);const restored=test.mount();
   const right=test.controls[1];right.untracked=true;test.tick(3);const leftFallback=test.mount();
   const leftCanSelect=test.click(test.button('Movement'),'left');right.untracked=false;test.tick(3);
   return {initial,moved,fallback,settings,settingsOpen,restored,leftFallback,leftCanSelect,scene,closed:test.click(test.button('Close menu'))};
  });
  assert.deepEqual([row.mount.initial.kind,row.mount.initial.leftPointing,row.mount.initial.rightPointing],['hand',false,true]);
  assert.ok(Math.abs(row.mount.moved.anchor[0]-row.mount.initial.anchor[0]-.1)<1e-5,'the menu tracks the left hand without moving the headset');
  assert.equal(row.mount.fallback.kind,'fallback');assert.ok(row.mount.fallback.rightPointing&&row.mount.settings&&row.mount.settingsOpen);
  assert.equal(row.mount.restored.kind,'hand');assert.equal(row.mount.closed,true,'the right ray can close the hand menu');
  assert.deepEqual([row.mount.leftFallback.kind,row.mount.leftFallback.leftPointing,row.mount.leftCanSelect],['fallback',true,true],'single-left-hand tracking can operate the fallback menu');
  row.closed=await page.evaluate(()=>test.snapshot());assert.equal(row.closed.menuOpen,false);assert.equal(row.closed.hudVisible,false);assert.ok(Object.values(row.closed.identities).every(Boolean));
  const crossed=await page.evaluate(()=>{
   test.aimBubble(0);test.event('selectstart','right');test.event('squeezestart','left');test.tick(3);
   const overNewMenu=test.aim(test.button('Scenes'))===test.button('Scenes');
   test.event('selectend','right');test.tick(3);
   const untouched=test.runtime.menuTab==='move'&&!test.runtime.currentPage;
   test.event('squeezestart','left');test.tick(3);return {overNewMenu,untouched};
  });
  assert.deepEqual(crossed,{overNewMenu:true,untouched:true},'a press on a bubble cannot activate a menu action that appears before release');
  row.bubble=[];
  for(const degrees of [-65,65]){
   const aimed=await page.evaluate(pitch=>test.aimBubble(pitch),degrees*Math.PI/180);assert.equal(aimed,true,'tracked right controller reaches the pitched bubble');
   const missed=await page.evaluate(()=>{test.before=test.read();test.event('selectstart','right');const missed=!test.aim(test.bubble(),'right',.043);test.event('selectend','right');test.tick(4);return missed;});
   assert.equal(missed,true,'the bubble is missed at release by 2.5 degrees');
   await page.waitForFunction(()=>test.runtime.xrContent.page&&test.runtime.hud.children.some(object=>object.userData.imageState==='ready'));
   await page.evaluate(()=>test.tick(5));
   const content=await page.evaluate(()=>test.content());row.bubble.push({degrees,...content});
   assert.equal(content.page,'bubble-page');assert.equal(content.visible,true);assert.equal(content.mount,'hand');assert.equal(content.shade,true);
   assert.ok(content.physicalWidth>=.27&&content.physicalWidth<=.30,'popup has a compact physical wrist width');
   assert.ok(content.surfaces.length>0&&content.surfaces.every(size=>Math.max(...size)<=2048),'all popup textures are bounded, including invisible controls: '+JSON.stringify(content.surfaces));
   assert.ok(content.images.includes('ready'),'the popup loads an actual photograph texture');
   assert.ok(content.regions.every(region=>region.every(edge=>edge>0&&edge<1)),'the compact raised-wrist card is entirely in both eyes at either viewing pitch: '+JSON.stringify(content));
   assert.ok(content.pixels.every(eye=>eye.changed>300&&eye.bright>30),'wrist content produces legible pixels in both eyes: '+JSON.stringify(content));
   const tone=await page.evaluate(()=>test.tonePixels());row.bubble.at(-1).tone=tone;
   assert.ok(tone.dimmed.every((eye,index)=>eye.content>140&&Math.abs(eye.content-tone.undimmed[index].content)<12&&eye.world.every((sample,corner)=>sample>0&&sample<tone.undimmed[index].world[corner]*.9)),'reading shade dims the visible world across both eyes while leaving the card bright: '+JSON.stringify(tone));
   assert.ok(tone.motionVisible&&tone.motion.every((eye,index)=>eye.content>140&&Math.abs(eye.content-tone.dimmed[index].content)<12&&eye.world.every((sample,corner)=>sample<tone.dimmed[index].world[corner])),'motion fades and content shade remain separate without dimming the card: '+JSON.stringify(tone));
   const returned=await page.evaluate(()=>{
    const r=test.runtime,initial=r.hud.position.toArray();
    test.controls[0].pose.elements[12]+=.08;test.tick(3);
    const moved=r.hud.position.toArray(),worldBlocked=test.aim(test.bubble())!==test.bubble();
    const viaMenu=test.click(test.button('Tour menu'));
    const returned={page:r.currentPage,visible:r.hud.visible,mount:r.hudMount,shade:r.readingShade.visible,fade:r.fade.visible};
    test.event('squeezestart','left');test.tick(3);return {initial,moved,worldBlocked,viaMenu,returned};
   });
   assert.ok(Math.abs(returned.moved[0]-returned.initial[0]-.08)<1e-5,'open content follows the left hand while the headset is still');
   assert.equal(returned.worldBlocked,true,'an open panel prevents activation of world bubbles');
   assert.equal(returned.viaMenu,true,'right ray selects the Tour menu action on the wrist');
   assert.deepEqual(returned.returned,{page:null,visible:true,mount:'hand',shade:false,fade:false},'Tour menu replaces the reading card and its dimming');
  }
  row.scroll=await page.evaluate(()=>{
   const r=test.runtime,left=test.controls[0],right=test.controls[1],motion=()=>[r.rig.position.toArray(),r.rig.rotation.y];
   if(!test.aimBubble(0)||!test.click(test.bubble()))throw Error('Could not open scrollable wrist content');
   const before=motion(),start=r.xrContent.offset;
   const away=r.hud.position.clone();away.x+=4;away.y+=4;away.z-=3;test.aimPoint(away);
   right.gamepad.axes=[0,0,.9,.85];test.tick(12);const offCard=r.xrContent.offset;
   test.aim(test.card());left.gamepad.axes=[0,0,.85,-.9];test.tick(12);const onCard=r.xrContent.offset,after=motion();
   left.gamepad.axes=[0,0,0,0];right.gamepad.axes=[0,0,0,0];
   const samePage=r.xrContent.page;
   left.untracked=true;test.tick(3);
   const rightFallback={...test.mount(),offset:r.xrContent.offset,samePage:r.xrContent.page===samePage};
   left.untracked=false;test.tick(3);
   const restored={...test.mount(),offset:r.xrContent.offset,samePage:r.xrContent.page===samePage};
   right.untracked=true;test.tick(3);left.gamepad.axes=[0,0,0,.85];
   const leftFallback=test.mount();test.tick(12);const leftStick=r.xrContent.offset;
   left.gamepad.axes=[0,0,0,0];
   const down=test.click(test.button('Down'),'left'),afterDown=r.xrContent.offset;
   const closed=test.click(test.button('Close content'),'left'),shadeClosed=r.readingShade.visible;
   right.untracked=false;test.tick(3);
   return {start,offCard,onCard,before,after,rightFallback,restored,leftFallback,leftStick,down,afterDown,closed,shadeClosed};
  });
  assert.equal(row.scroll.offCard,row.scroll.start,'right stick away from card does not scroll');
  assert.ok(row.scroll.onCard>row.scroll.offCard+.12,'aiming the right ray at the card enables thumbstick scroll');
  assert.deepEqual(row.scroll.before,row.scroll.after,'the modal routes neither stick to locomotion or turning');
  assert.deepEqual([row.scroll.rightFallback.kind,row.scroll.rightFallback.rightPointing,row.scroll.rightFallback.samePage,row.scroll.rightFallback.offset],['fallback',true,true,row.scroll.onCard],'left tracking loss preserves the document and scroll in a right-ray fallback');
  assert.deepEqual([row.scroll.restored.kind,row.scroll.restored.leftPointing,row.scroll.restored.samePage,row.scroll.restored.offset],['hand',false,true,row.scroll.onCard],'left tracking recovery returns the same content to the wrist');
  assert.deepEqual([row.scroll.leftFallback.kind,row.scroll.leftFallback.leftPointing,row.scroll.leftStick],['fallback',true,row.scroll.onCard],'left-only fallback frees its ray without stealing its thumbstick');
  assert.ok(row.scroll.down&&row.scroll.afterDown>row.scroll.leftStick&&row.scroll.closed&&!row.scroll.shadeClosed,'left-only fallback can scroll with the on-card button and close');
  assert.ok(await page.evaluate(()=>test.aimBubble(0)&&test.click(test.bubble())));
  await page.waitForFunction(()=>test.button('Enlarge image')?.userData.imageState==='ready');
  assert.ok(await page.evaluate(()=>{
   const r=test.runtime,offset=r.xrContent.offset;
   return test.click(test.button('Enlarge image'))&&r.xrContent.focus===0&&r.readingShade.visible&&test.click(test.button('Back to content'))&&r.xrContent.focus===-1&&r.xrContent.offset===offset&&r.readingShade.visible;
  }),'the wrist photograph and Back to content retain the reading state');
  assert.ok(await page.evaluate(()=>{
   const r=test.runtime;test.event('squeezestart','right');test.tick(3);
   return !r.currentPage&&r.hudMount==='hand'&&r.menuOpen&&!r.readingShade.visible&&test.click(test.button('Close menu'));
  }),'grip returns from content to the wrist menu');
  const changed=await page.evaluate(()=>test.click(test.runtime.descriptionLabel)&&test.click(test.button('Visit second scene')));
  assert.equal(changed,true,'the right ray follows an authored scene link from the wrist card');
  await page.waitForFunction(()=>{test.tick();return test.runtime.active?.id==='second'&&!!test.button('Retry scene');},{},{timeout:45000,polling:35});
  assert.ok(await page.evaluate(()=>!test.runtime.currentPage&&!test.runtime.readingShade.visible&&test.runtime.hudMount==='hand'),'a failed content scene link opens an undimmed retry on the wrist');
  failSecond=false;
  assert.ok(await page.evaluate(()=>test.click(test.button('Retry scene'))),'the right ray can retry the linked scene');
  await page.waitForFunction(()=>{test.tick();return test.runtime.active?.id==='second'&&test.runtime.ready;},{},{timeout:45000,polling:35});
  row.afterRecovery=await page.evaluate(()=>test.snapshot());assert.ok(Object.values(row.afterRecovery.identities).every(Boolean));
  assert.ok(await page.evaluate(()=>test.runtime.ready&&!test.runtime.readingShade.visible));
  assert.ok(await page.evaluate(()=>!test.runtime.menuOpen||test.click(test.button('Close menu'))),'the retry result leaves the wrist navigation usable');
  assert.ok(await page.evaluate(()=>test.aimBubble(0)&&test.click(test.bubble())));
  assert.ok(await page.evaluate(()=>test.runtime.currentPage?.id==='bubble-page'&&test.click(test.button('Close content'))&&!test.runtime.currentPage),'the same bubble opens on a new scene and closes via the right ray');
  assert.ok(await page.evaluate(()=>test.aimBubble(0)&&test.click(test.bubble())&&test.runtime.readingShade.visible));
  assert.ok(await page.evaluate(async()=>{const r=test.runtime;await r.renderer.xr.getSession().end();return !r.currentPage&&!r.readingShade.visible&&!r.hud.visible;}),'leaving XR clears the open wrist content and reading shade');
  const ignored=messages.filter(s=>s.startsWith("THREE.TSL: Return statement used in an inline 'Fn()'. Define a layout struct to allow return values.")||/^\[\.WebGL-[^\]]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/.test(s)||s==='Failed to load resource: the server responded with a status of 404 (Not Found)');row.ignoredObserverWarnings=ignored;assert.deepEqual(errors,[]);assert.deepEqual(messages.filter(s=>!ignored.includes(s)),[],'no unexpected GPU/browser errors');
  await page.evaluate(()=>test.runtime.dispose());await page.close();page=undefined;
 }
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('PASS actual projection-layer textures: binocular wrist menus, pitched content and reading shade, focused photo, right-stick and single-controller scrolling, scene retry, and retained renderer/session. '+output);
}catch(error){report.error=String(error);report.stack=error.stack;if(page)report.state=await page.evaluate(()=>window.test?.snapshot()).catch(()=>null);await fs.writeFile(path.join(output,'failure.json'),JSON.stringify(report,null,2));throw error;}
finally{if(page)await page.evaluate(async()=>{await test.runtime.renderer.xr.getSession()?.end();test.runtime.dispose();}).catch(()=>{});await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
