import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium,expect} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {plainTextDocument} from '../shared/rich-text.mjs';
import {floorGlb} from '../tests/fixtures.mjs';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

const output=path.resolve(process.env.SPARK_TEST_VIEWER_OUTPUT||path.join('test-output','mobile-viewer-'+Date.now()));await fs.mkdir(output,{recursive:true});
const project=blankProject();project.title='The grounds and aerial tour';project.startScene='a';
const first=newScene('a','North graveyard and the surrounding grounds','scan/lod-meta.json'),second=newScene('b','Inside the historic church','scan/lod-meta.json');
second.modes=['fly'];
first.viewpoints=Array.from({length:12},(_,i)=>({...first.viewpoints[0],id:i?'view-'+i:'start',name:'The grounds · view '+(i+1),description:'Explore the church and its surrounding landscape.',position:[i*.1,1.7,3]}));
first.collider='floor.glb';first.modes=['jumps','fly','explore'];
for(const view of first.viewpoints)view.extendedDescription={enabled:true,richText:plainTextDocument(('The church and its grounds have a long history.\n\n').repeat(12)),links:[{id:'interior',label:'Explore the interior',sceneId:'b'}]};
project.scenes=[first,second];
const {files}=sogLodFixture();
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs'),server=await startServer({root:path.resolve(process.env.SPARK_TEST_VIEWER_ROOT||'dist')}),url=server.url+'?diagnostics=1&radixBackend=webgpu-gl';
const browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const checks=[];
async function serveFixture(page,tour=project){
 await page.route('**/config/tour.json',route=>route.fulfill({json:tour}));
 await page.route('**/config/hosting.json',route=>route.fulfill({json:{}}));
 await page.route('**/floor.glb',route=>route.fulfill({contentType:'model/gltf-binary',body:floorGlb()}));
 await page.route('**/scan/**',route=>{
  const file=new URL(route.request().url()).pathname.split('/scan/')[1],body=files[file];
  return body?route.fulfill({contentType:file.endsWith('.json')?'application/json':'image/webp',body:Buffer.from(body)}):route.fulfill({status:404});
 });
}
async function observeSceneClicks(page){
 await page.evaluate(()=>{
  const runtime=window.tourRuntime,click=runtime.click.bind(runtime);
  window.sceneClicks=0;
  runtime.click=event=>{window.sceneClicks++;return click(event);};
 });
}
try{
 for(const [name,size] of [['portrait',{width:390,height:844}],['landscape',{width:844,height:390}],['small-phone',{width:320,height:568}]]){
  const context=await browser.newContext({viewport:size,hasTouch:true,isMobile:true,deviceScaleFactor:1});
  const page=await context.newPage();page.setDefaultTimeout(60000);
  await serveFixture(page);
  await page.goto(url);await page.getByRole('heading',{name:project.title,exact:true}).waitFor();
  await page.getByRole('button',{name:'Enter tour',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(output,name+'-title.png')});
  await page.getByRole('button',{name:'Enter tour',exact:true}).click();
  await page.waitForFunction(()=>window.tourRuntime?.ready&&!window.tourRuntime.loading);
  await page.getByRole('button',{name:'About this view',exact:true}).waitFor();
  const toggle=page.getByRole('button',{name:'Tour controls',exact:true}),toggleBox=await toggle.boundingBox(),glyphBox=await toggle.locator('svg').boundingBox();assert.ok(Math.abs(toggleBox.x+toggleBox.width/2-glyphBox.x-glyphBox.width/2)<.5);assert.ok(Math.abs(toggleBox.y+toggleBox.height/2-glyphBox.y-glyphBox.height/2)<.5);
  assert.equal(await page.locator('.viewer-header,.navigation-coach,.viewer-bottom').count(),0);
  assert.equal(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight*.45)?.tagName),'CANVAS');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByRole('button',{name:'Next viewpoint',exact:true}).click();
  await page.waitForFunction(()=>window.tourRuntime.currentViewpoint==='view-1');
  await page.screenshot({path:path.join(output,name+'-scene.png')});
  await page.getByRole('button',{name:'About this view',exact:true}).click();
  const details=page.getByRole('complementary',{name:'Viewpoint details',exact:true});await details.waitFor();
  const detailsBox=await details.boundingBox();assert.ok(detailsBox.y>=0&&detailsBox.y+detailsBox.height<=size.height);
  await details.getByRole('button',{name:'Explore the interior',exact:true}).scrollIntoViewIfNeeded();
  await details.getByRole('button',{name:'Collapse viewpoint details',exact:true}).click();
  await page.getByRole('button',{name:'About this view',exact:true}).waitFor();
  await page.getByRole('button',{name:'Tour controls',exact:true}).click();
  const menu=page.getByRole('dialog',{name:'Tour controls',exact:true});await menu.waitFor();assert.equal(await page.evaluate(()=>window.tourRuntime.blocked),true);
  assert.ok(await menu.locator('.mobile-tour-menu-scroll').evaluate(el=>el.scrollWidth<=el.clientWidth));
  const home=menu.getByRole('button',{name:'Home',exact:true});
  const homeBox=await home.boundingBox();assert.ok(homeBox.y>=0&&homeBox.y+homeBox.height<=size.height);
  assert.equal(await home.textContent(),'');
  assert.equal(await page.getByLabel('Touch movement pad',{exact:true}).count(),0);
  await page.screenshot({path:path.join(output,name+'-menu.png')});
  await menu.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Viewing settings',exact:true});await settings.waitFor();
  await settings.getByLabel('Mobile controls',{exact:true}).selectOption('off');await settings.getByLabel('Mobile controls',{exact:true}).selectOption('on');
  await expect(settings).toBeVisible();
  await page.screenshot({path:path.join(output,name+'-settings.png')});
  await observeSceneClicks(page);
  const outside={x:Math.floor(size.width/2),y:size.height-4};
  await page.touchscreen.tap(outside.x,outside.y);
  await expect(settings).toBeHidden();await expect(toggle).toBeFocused();
  await page.waitForFunction(()=>!window.tourRuntime.blocked);
  assert.equal(await page.evaluate(()=>window.sceneClicks),0,'the tap that dismisses Settings never reaches the tour');
  await page.touchscreen.tap(size.width/2,Math.floor(size.height*.45));
  await page.waitForFunction(()=>window.sceneClicks===1);
  await page.getByRole('button',{name:'Tour controls',exact:true}).click();
  await menu.getByRole('button',{name:'Drone',exact:true}).click();
  await page.waitForFunction(()=>window.tourRuntime.mode==='fly'&&!window.tourRuntime.blocked);
  const pad=page.getByLabel('Touch movement pad',{exact:true});await pad.waitFor();
  assert.equal(await pad.textContent(),'');
  const padBox=await pad.boundingBox(),upBox=await page.getByRole('button',{name:'Fly up',exact:true}).boundingBox();
  assert.ok(padBox.y+padBox.height<=size.height&&padBox.y>=size.height-110);
  assert.ok(upBox.y>=size.height-120&&upBox.x>size.width/2);
  const before=await page.evaluate(()=>window.tourRuntime.rig.position.toArray());
  const touch=await context.newCDPSession(page);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:padBox.x+padBox.width*.5,y:padBox.y+padBox.height*.2,radiusX:2,radiusY:2}]});
  await page.waitForTimeout(350);assert.equal(await pad.getAttribute('data-active'),'true');const heldKnob=await pad.locator('.touch-stick').boundingBox();assert.ok(heldKnob.y+heldKnob.height/2<padBox.y+padBox.height/2-6);await page.screenshot({path:path.join(output,name+'-joystick-held.png')});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();await page.waitForTimeout(50);assert.equal(await pad.getAttribute('data-active'),'false');const restingKnob=await pad.locator('.touch-stick').boundingBox();assert.ok(Math.abs(restingKnob.x+restingKnob.width/2-padBox.x-padBox.width/2)<.5&&Math.abs(restingKnob.y+restingKnob.height/2-padBox.y-padBox.height/2)<.5);assert.equal(await page.evaluate(()=>window.tourRuntime.touch.length()),0);
  const after=await page.evaluate(()=>window.tourRuntime.rig.position.toArray());assert.ok(after.some((n,i)=>Math.abs(n-before[i])>.02));
  await page.screenshot({path:path.join(output,name+'-drone.png')});
  await page.getByRole('button',{name:'Tour controls',exact:true}).click();await menu.getByRole('button',{name:'Walk',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime.mode==='explore'&&!window.tourRuntime.preparingMode&&!window.tourRuntime.blocked);
  for(const label of ['Jump','Crouch']){const box=await page.getByRole('button',{name:label,exact:true}).boundingBox();assert.ok(box.y>=size.height-120&&box.y+box.height<=size.height&&box.width>=44&&box.height>=44);}
  await page.screenshot({path:path.join(output,name+'-walk.png')});
  await page.getByRole('button',{name:'Tour controls',exact:true}).click();
  await menu.getByLabel('Scenes',{exact:true}).selectOption('b');
  await page.waitForFunction(()=>window.tourRuntime.active?.id==='b'&&window.tourRuntime.ready&&!window.tourRuntime.loading);
  assert.equal(await page.getByRole('button',{name:'Choose viewpoint',exact:true}).count(),0);
  await page.getByRole('button',{name:'Tour controls',exact:true}).click();assert.equal(await menu.getByRole('group',{name:'Viewpoints',exact:true}).count(),0);await page.getByRole('button',{name:'Close tour controls',exact:true}).press('Escape');await menu.waitFor({state:'hidden'});
  assert.equal(await page.getByRole('button',{name:'Tour controls',exact:true}).evaluate(el=>document.activeElement===el),true);
  assert.equal(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight*.45)?.tagName),'CANVAS');
  checks.push('Mobile '+name+': clear central view, story, controls, outside Settings tap and focus, restored scene interaction, touch movement, scene change and keyboard recovery');
  console.log('PASS '+checks.at(-1));
  await context.close();
 }
 // A user-opened story remains open across orientation changes.
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await serveFixture(page);
 await page.goto(url);await page.getByRole('button',{name:'Enter tour',exact:true}).click();await page.getByRole('button',{name:'About this view',exact:true}).click();await page.setViewportSize({width:844,height:390});await page.getByRole('complementary',{name:'Viewpoint details',exact:true}).waitFor();
 await page.screenshot({path:path.join(output,'landscape-story.png')});checks.push('Expanded story survives orientation change');console.log('PASS '+checks.at(-1));await page.close();
 const desktop=await browser.newPage({viewport:{width:1440,height:900}});
 await serveFixture(desktop);
 await desktop.goto(url);await desktop.getByRole('button',{name:'Enter tour',exact:true}).click();await desktop.waitForFunction(()=>window.tourRuntime?.ready);
 const tools=desktop.getByRole('navigation',{name:'Tour tools'}),navigation=desktop.getByRole('navigation',{name:'Tour navigation'}),dock=desktop.getByRole('navigation',{name:'Scene movement'});
 const home=tools.getByRole('button',{name:'Home'}),settingsButton=tools.getByRole('button',{name:'Settings'}),settings=desktop.getByRole('dialog',{name:'Viewing settings'});
 await expect(home).toBeVisible();assert.equal(await home.textContent(),'');
 await expect(navigation.getByRole('combobox',{name:'Scenes'})).toHaveValue('a');
 await expect(dock.getByRole('group',{name:'Movement mode'})).toBeVisible();
 await expect(dock.getByRole('group',{name:'Viewpoints'})).toBeVisible();
 assert.ok((await dock.boundingBox()).width<=900,'the dock stays compact even with many viewpoints');
 const viewpoint=dock.getByRole('button',{name:'The grounds · view 2',exact:true});
 await viewpoint.click();
 await desktop.waitForFunction(()=>window.tourRuntime.currentViewpoint==='view-1');
 await expect(viewpoint).toHaveAttribute('aria-pressed','true');
 await desktop.screenshot({path:path.join(output,'desktop-scene.png')});
 await settingsButton.focus();await desktop.keyboard.press('Enter');
 await expect(settings.getByRole('button',{name:'Close settings'})).toBeFocused();
 await desktop.keyboard.press('Tab');assert.ok(await settings.evaluate(el=>el.contains(document.activeElement)));
 await desktop.keyboard.press('Escape');await expect(settings).toBeHidden();await expect(settingsButton).toBeFocused();
 await settingsButton.click();await desktop.screenshot({path:path.join(output,'desktop-settings.png')});
 await observeSceneClicks(desktop);
 await desktop.mouse.click(700,400);await expect(settings).toBeHidden();await expect(settingsButton).toBeFocused();
 await desktop.waitForFunction(()=>!window.tourRuntime.blocked);
 assert.equal(await desktop.evaluate(()=>window.sceneClicks),0);
 await desktop.mouse.click(700,400);await desktop.waitForFunction(()=>window.sceneClicks===1);
 await navigation.getByRole('combobox',{name:'Scenes'}).selectOption('b');
 await desktop.waitForFunction(()=>window.tourRuntime.active?.id==='b'&&window.tourRuntime.ready);
 await expect(dock.getByRole('group',{name:'Viewpoints'})).toHaveCount(0);
 await home.click();await expect(desktop.getByRole('button',{name:'Enter tour'})).toBeVisible();
 const titleSettings=desktop.getByRole('button',{name:'Settings',exact:true});
 await titleSettings.click();await desktop.mouse.click(700,400);await expect(settings).toBeHidden();await expect(titleSettings).toBeFocused();
 checks.push('Desktop: icon-only Home, grouped navigation, scene and viewpoint actions, Settings focus, Escape and outside dismissal, scene interaction resumes');console.log('PASS '+checks.at(-1));
 await desktop.close();

 for(const [configuration,mobile] of [['missing',false],['unsupported',false],['denied',false],['insecure',false],['supported',false],['supported',true],['unsupported',true]]){
  const context=await browser.newContext(mobile?{viewport:{width:390,height:844},hasTouch:true,isMobile:true}:{viewport:{width:1280,height:800}});
  await context.addInitScript(configuration=>{
   window.xrChecks=[];
   window.xrSupported=configuration==='supported'||configuration==='insecure';
   const xr=new EventTarget();
   xr.isSessionSupported=async mode=>{window.xrChecks.push(mode);if(configuration==='denied')throw new Error('Capability denied');return window.xrSupported;};
   Object.defineProperty(navigator,'xr',{value:configuration==='missing'?undefined:xr});
   if(configuration==='insecure')Object.defineProperty(window,'isSecureContext',{value:false});
  },configuration);
  const page=await context.newPage();await serveFixture(page);await page.goto(url);
  await page.getByRole('button',{name:'Enter tour',exact:true}).click();
  await page.waitForFunction(()=>window.tourRuntime?.ready);
  if(mobile)await page.getByRole('button',{name:'Tour controls',exact:true}).click();
  const vr=page.getByRole('button',{name:'Enter VR',exact:true});
  if(configuration==='supported')await expect(vr).toBeVisible();else await expect(vr).toHaveCount(0);
  const queries=await page.evaluate(()=>window.xrChecks);
  assert.deepEqual(queries,['missing','insecure'].includes(configuration)?[]:['immersive-vr']);
  if(configuration==='supported'&&mobile)await page.screenshot({path:path.join(output,'portrait-vr-supported.png')});
  if(configuration==='supported'&&!mobile){
   await page.evaluate(()=>{window.xrSupported=false;navigator.xr.dispatchEvent(new Event('devicechange'));});
   await expect(vr).toHaveCount(0);
   await page.evaluate(()=>{window.xrSupported=true;navigator.xr.dispatchEvent(new Event('devicechange'));});
   await expect(vr).toBeVisible();
  }
  checks.push((mobile?'Mobile':'Desktop')+' Enter VR visibility with '+configuration+' WebXR');console.log('PASS '+checks.at(-1));
  await context.close();
 }
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed:checks},null,2));
}finally{await browser.close();server.server.closeAllConnections();await new Promise(resolve=>server.server.close(resolve));}
