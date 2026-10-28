import {_electron as electron,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankProject,newScene} from '../shared/project.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const output=path.resolve('test-output','input-focus-'+Date.now()),folder=path.join(output,'project');
await fs.mkdir(path.join(folder,'config'),{recursive:true});
const project=blankProject(),scene=newScene('garden','Garden','scene.rad');
scene.modes=['fly'];scene.hotspots=[{id:'story',label:'A garden story',position:[0,1.7,0],kind:'page',target:'story'}];
project.scenes=[scene];project.startScene=scene.id;project.pages=[{id:'story',title:'A garden story',html:'',blocks:[{type:'text',text:'A place to remember.',url:''}]}];
await fs.writeFile(path.join(folder,'scene.rad'),radFixture().rad);
await fs.writeFile(path.join(folder,'config','tour.json'),JSON.stringify(project));
await fs.writeFile(path.join(folder,'config','hosting.json'),JSON.stringify({assetBaseUrl:'./',sceneUrls:{}}));
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'];
const app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(output,'profile')},timeout:60000});
const report={checks:[]};
try{
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(25000);page.on('pageerror',error=>errors.push(error.message));
 await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},folder);
 await page.locator('.empty-state').getByRole('button',{name:'Open project',exact:true}).click();
 await page.waitForFunction(()=>{const r=window.tourRuntime;if(r)r.frame(r.last+20);return r?.ready&&!r.loading;});
 await page.evaluate(()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);window.inputIdentity={renderer:r.renderer,canvas:r.renderer.domElement,camera:r.camera,rig:r.rig};});
 const canvas=page.locator('.stage canvas'),position=()=>page.evaluate(()=>window.tourRuntime.rig.position.toArray());
 const frames=()=>page.evaluate(()=>{for(let i=0;i<10;i++)window.tourRuntime.frame(window.tourRuntime.last+20);});
 const viewport=async()=>{const bounds=await page.locator('.canvas-wrap').boundingBox();await page.mouse.click(bounds.x+bounds.width*.45,bounds.y+bounds.height*.4);await expect(canvas).toBeFocused();};
 const menu=async(group,item)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();if(item)await page.getByRole('menuitem',{name:item,exact:true}).click();};
 const stopped=async(name,focus,key='w')=>{
  await viewport();await page.keyboard.down(key);await frames();const before=await position();await focus();
  const focused=await position();await frames();assert.deepEqual(await position(),focused,name+' clears previously held movement');
  assert.deepEqual(await page.evaluate(()=>[...window.tourRuntime.keys]),[],name+' clears the held keyboard set');
  await page.keyboard.up(key);await frames();assert.deepEqual(await position(),focused,name+' stays stopped after release');
  report.checks.push({name,before,focused,after:await position()});
 };

 await stopped('Scene name',()=>page.getByLabel('Name',{exact:true}).click());
 await page.keyboard.type(' amended');await frames();await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Garden amended');
 await page.keyboard.press('Control+s');await expect.poll(()=>page.evaluate(()=>window.__studioCloseState().dirty)).toBe(false);
 report.checks.push({name:'Typing and Save shortcut stay available'});
 await stopped('Numeric speed input',()=>page.getByLabel('Scene speed multiplier',{exact:true}).focus(),'ArrowUp');
 const number=page.getByLabel('Scene speed multiplier',{exact:true}),numberBefore=Number(await number.inputValue());
 await page.keyboard.press('ArrowUp');await expect(number).toHaveValue(String(Number((numberBefore+.05).toFixed(2))));
 await stopped('Walking height slider',()=>page.getByLabel('Walking view height',{exact:true}).focus());
 const slider=page.getByLabel('Walking view height',{exact:true}),sliderBefore=Number(await slider.inputValue());
 await page.keyboard.press('ArrowRight');assert.ok(Number(await slider.inputValue())>sliderBefore,'slider arrows still change the slider');
 await stopped('Editor menu button',()=>menu('Edit'),'ArrowUp');
 await page.keyboard.press('ArrowDown');await expect(page.getByRole('menuitem',{name:'Undo',exact:true})).toBeFocused();await page.keyboard.press('Escape');
 await stopped('Browser tab list',()=>page.getByRole('tab',{name:'Scenes',exact:true}).focus());
 await stopped('Panel resize separator',()=>page.getByRole('separator',{name:'Resize browser panel',exact:true}).focus(),'ArrowRight');
 const separator=page.getByRole('separator',{name:'Resize browser panel',exact:true}),widthBefore=Number(await separator.getAttribute('aria-valuenow'));
 await page.keyboard.press('ArrowRight');assert.ok(Number(await separator.getAttribute('aria-valuenow'))>widthBefore,'panel resize arrows still work');

 await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row strong').getByText('A garden story',{exact:true}).click();
 const rich=page.locator('.bubble-content [contenteditable="true"]');
 await stopped('Rich story text',()=>rich.click());await page.keyboard.type(' Text');await expect(rich).toContainText('Text');
 await viewport();await page.keyboard.down('w');await frames();await menu('Tools','Tour settings');const settings=await position();await frames();
 assert.deepEqual(await position(),settings,'settings suspend movement');await page.keyboard.up('w');await page.getByRole('button',{name:'Close settings',exact:true}).click();await frames();assert.deepEqual(await position(),settings,'settings close does not restart released movement');
 report.checks.push({name:'Settings block and release'});

 for(const key of ['w','ArrowUp','a','ArrowLeft']){
  await viewport();const before=await position();await page.keyboard.down(key);await frames();const moving=await position();assert.notDeepEqual(moving,before,key+' moves again after returning to the viewport');
  await page.keyboard.up(key);await frames();assert.deepEqual(await position(),moving,key+' release stops movement');report.checks.push({name:'Viewport movement and release: '+key,before,after:moving});
 }
 await viewport();const bounds=await page.locator('.canvas-wrap').boundingBox(),beforePan=await position();await page.mouse.move(bounds.x+bounds.width*.45,bounds.y+bounds.height*.4);await page.mouse.down({button:'right'});await page.mouse.move(bounds.x+bounds.width*.45+50,bounds.y+bounds.height*.4+30,{steps:4});await page.mouse.up({button:'right'});await frames();assert.notDeepEqual(await position(),beforePan,'right drag still pans');
 report.checks.push({name:'Viewport right drag pan'});
 await page.evaluate(()=>{const r=window.tourRuntime;window.retainedTouch=[.35,-.4];r.setTouch(...window.retainedTouch);r.setTouchLift(.3);});
 await page.getByLabel('Label',{exact:true}).focus();assert.deepEqual(await page.evaluate(()=>window.tourRuntime.touch.toArray()),[.35,-.4],'keyboard focus does not clear joystick axes');assert.equal(await page.evaluate(()=>window.tourRuntime.touchLift),.3);
 await page.evaluate(()=>{window.tourRuntime.setTouch(0,0);window.tourRuntime.setTouchLift(0);});report.checks.push({name:'Focus reset leaves touch movement untouched'});
 assert.ok(await page.evaluate(()=>{const r=window.tourRuntime,i=window.inputIdentity;return r.renderer===i.renderer&&r.renderer.domElement===i.canvas&&r.camera===i.camera&&r.rig===i.rig;}),'the runtime identity is unchanged');
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(output,'focus-controls.png')});await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));
 console.log('PASS held movement clears on actual input, rich text, menu, tab and resize focus; typing/Save, slider and menu keys, settings, fresh WASD/arrows, right pan and touch intent remain. '+output);
}finally{
 await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();}).catch(()=>{});await app.close();
}
