import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,expect} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {PerformanceSettingsSchema,defaultPerformance} from '../shared/performance.mjs';
import {radFixture} from '../tests/fixtures.mjs';
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs'),root=path.resolve('test-output','adaptive detail '+Date.now());await fs.mkdir(path.join(root,'config'),{recursive:true});
const project=blankProject(),settings=PerformanceSettingsSchema.parse({lodSplatCount:100000,lodSplatScale:.8});project.scenes=[newScene('a','Adaptive detail fixture','scene.rad')];project.startScene='a';project.performance=defaultPerformance();project.performance.defaultSettings=settings;
await fs.writeFile(path.join(root,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(root,'config/hosting.json'),'{}');await fs.writeFile(path.join(root,'scene.rad'),radFixture().rad);
const {server,url}=await startServer({root:path.resolve('dist'),resolve:name=>name.startsWith('config/')||name==='scene.rad'?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1280,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.spark.display.numSplats>0);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Advanced performance',{exact:true}).click();await page.locator('.performance-controls details').evaluateAll(details=>details.forEach(d=>d.open=true));
 const automatic=page.getByLabel('Automatically adjust detail for smoother movement',{exact:true}),target=page.getByLabel('Target frame rate',{exact:true});await expect(automatic).not.toBeChecked();await expect(target).toBeDisabled();await expect(target).toHaveValue('60');
 await automatic.check();await target.fill('45');await expect(target).toHaveValue('45');await automatic.uncheck();assert.deepEqual(await page.evaluate(()=>{const s=window.tourRuntime.performanceSettings;return [Object.hasOwn(s,'adaptiveDetail'),Object.hasOwn(s,'adaptiveTargetFps')];}),[false,false],'disabling removes opt-in metadata so older builds can still read the settings');await expect(target).toBeDisabled();await expect(target).toHaveValue('60');await automatic.check();await target.fill('45');
 assert.deepEqual(await page.evaluate(()=>[window.tourRuntime.performanceSettings.adaptiveDetail,window.tourRuntime.performanceSettings.adaptiveTargetFps]),[true,45]);await page.getByRole('button',{name:'Close settings',exact:true}).click();
 const result=await page.evaluate(()=>{
  const r=window.tourRuntime;r.renderer.setAnimationLoop(null);r.renderer.render=()=>{};r.spark.autoUpdate=false;r.navigator?.takeControl();r.applyPerformance({...r.performanceSettings,adaptiveTargetFps:60});r.fadeUntil=0;r.flight=undefined;r.blocked=false;
  const owner=r.spark,mesh=r.mesh,canvas=r.renderer.domElement,saved=JSON.stringify(r.performanceSettings),authored=JSON.stringify(r.project.performance),pager=r.spark.pager;pager.isFetching=()=>true;pager.isPending=()=>true;
  let time=r.last;const samples=[];const drive=(seconds,fps)=>{const step=1000/fps;for(let elapsed=0;elapsed<seconds*1000;elapsed+=step){time+=step;r.frame(time);}samples.push({seconds,fps,scale:r.adaptiveDetailScale,effective:r.spark.lodSplatScale});return r.adaptiveDetailScale;};
  r.blocked=true;drive(30,10);const covered=r.adaptiveDetailScale;r.blocked=false;
  const displayed=r.spark.display.numSplats;r.spark.display.numSplats=0;drive(20,10);const empty=r.adaptiveDetailScale;r.spark.display.numSplats=displayed;
  drive(5,10);const settling=r.adaptiveDetailScale;drive(3,10);const reduced=r.adaptiveDetailScale;drive(50,10);const minimum=r.adaptiveDetailScale;drive(16,60);const recovered=r.adaptiveDetailScale;
  const identity=r.spark===owner&&r.mesh===mesh&&r.renderer.domElement===canvas,unchanged=JSON.stringify(r.performanceSettings)===saved&&JSON.stringify(r.project.performance)===authored,continuous=pager.isFetching()&&pager.isPending();
  r.applyPerformance({...r.performanceSettings});drive(10,3);const severe3=r.adaptiveDetailScale;drive(50,2);const severe2=r.adaptiveDetailScale;
  r.applyPerformance({...r.performanceSettings});drive(20,60);time+=500;r.frame(time);drive(15,60);const isolated=r.adaptiveDetailScale;
  // XR bookkeeping is mocked only inside this test. The actual runtime frame
  // loop and quality hook still run; no real headset session is requested.
  r.applyPerformance({...r.performanceSettings,adaptiveTargetFps:30});const xr=r.renderer.xr,session={frameRate:90,visibilityState:'visible',inputSources:[],end(){throw Error('Adaptive detail must not end XR');}};xr.isPresenting=true;xr.getSession=()=>session;xr.getCamera=()=>r.camera;xr.updateCamera=()=>{};r.fadeUntil=0;drive(8,60);const xrReduced=r.adaptiveDetailScale;
  session.visibilityState='visible-blurred';const beforeFocusLoss=r.adaptiveDetailScale;drive(20,10);const focusPreserved=r.adaptiveDetailScale===beforeFocusLoss;
  const xrIdentity=xr.getSession()===session&&r.renderer.domElement===canvas&&r.spark===owner;
  r.applyPerformance({...r.performanceSettings,adaptiveDetail:false});const disabled=r.adaptiveDetailScale===1&&r.spark.lodSplatScale===.8;
  return {covered,empty,settling,reduced,minimum,recovered,continuous,identity,unchanged,severe3,severe2,isolated,xrReduced,focusPreserved,xrIdentity,disabled,samples};
 });
 assert.equal(result.covered,1);assert.equal(result.empty,1);assert.equal(result.settling,1);assert.ok(result.reduced<1);assert.equal(result.minimum,.25);assert.ok(result.recovered>.25&&result.recovered<=.55);assert.ok(result.continuous&&result.identity&&result.unchanged,'continuous streaming adapts without scene/renderer replacement or authored changes');assert.ok(result.severe3<1);assert.equal(result.severe2,.25);assert.equal(result.isolated,1,'an isolated500ms screenshot-style pause does not reduce detail');assert.ok(result.xrReduced<1,'XR respects 90 Hz refresh, even with a 30 FPS desktop goal');assert.ok(result.focusPreserved&&result.xrIdentity&&result.disabled);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({testOnlyControlledFrameSamples:true,result,errors},null,2));console.log('PASS actual rendered RAD fixture, visitor tuning controls, loading/empty gates, continuous-stream slow cadence, bounded reduction/recovery, authored settings preservation and stable XR identity/focus. '+root);
}catch(error){console.error(error);await page.screenshot({path:path.join(root,'failure.png')});throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
