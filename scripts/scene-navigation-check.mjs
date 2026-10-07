import {chromium,_electron as electron} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {blankProject,newScene} from '../shared/project.mjs';import {radFixture,floorGlb} from '../tests/fixtures.mjs';
const root=path.resolve('test-output','scene-navigation-'+Date.now()),project=path.join(root,'project'),out=path.join(root,'export');
await fs.mkdir(path.join(project,'config'),{recursive:true});await fs.mkdir(out);
const p=blankProject(),a=newScene('a','First','main.rad');a.collider='floor.glb';a.modes.push('explore');
a.viewpoints.push({id:'hidden',name:'Private entry',listed:false,position:[4,1.7,-2],rotation:[0,.4,0]});
a.hotspots=[{id:'hidden-link',label:'Entry',position:[0,1,0],kind:'viewpoint',target:'hidden'}];
const b=structuredClone(a);b.id='b';b.name='Second';
const c=structuredClone(a);c.id='c';c.name='Limited';c.modes=['jumps'];
const bad=structuredClone(a);bad.id='bad';bad.name='Failed';bad.source='main.rad';
p.scenes=[a,b,c,bad];p.startScene='a';
await fs.writeFile(path.join(project,'config/tour.json'),JSON.stringify(p));await fs.writeFile(path.join(project,'config/hosting.json'),'{}');
const fixture=radFixture();await fs.writeFile(path.join(project,'main.rad'),fixture.rad);await fs.writeFile(path.join(project,'floor.glb'),floorGlb());
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 const choose=async folder=>app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},folder);
 await choose(project);await page.getByRole('button',{name:'Open',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 await page.getByRole('button',{name:'views',exact:true}).click();await page.locator('.viewpoint-card').filter({hasText:'Private entry'}).click();
 await page.getByLabel('Listed viewpoint').check();await page.getByLabel('Listed viewpoint').uncheck();
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Saved project',{exact:true}).waitFor({state:'attached'});
 await choose(out);await page.getByRole('button',{name:'Export tour ↗'}).click();await page.getByRole('button',{name:'Choose folder & export'}).click();await page.locator('.modal-shade').waitFor({state:'hidden',timeout:120000});
 await choose(project);await page.getByRole('button',{name:'Open',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 assert.equal(await page.evaluate(()=>window.tourRuntime.active.viewpoints.find(v=>v.id==='hidden').listed),false);
 assert.equal(JSON.parse(await fs.readFile(path.join(out,'config/tour.json'),'utf8')).scenes[0].viewpoints.find(v=>v.id==='hidden').listed,false);
 console.log('PASS: native Listed control, save/reopen and folder export',root);
}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(win=>win.destroy())).catch(()=>{});await app.close();}
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs'),{server,url}=await startServer({root:out});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour ↗'}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 assert.equal(await page.locator('.tour-viewpoint').count(),1);assert.equal(await page.locator('.tour-viewpoint').filter({hasText:'Private entry'}).count(),0);
 await page.evaluate(async()=>{
  const r=window.tourRuntime,require=(value,message)=>{if(!value)throw Error(message);};
  r.renderer.setAnimationLoop(null);
  for(const mode of ['fly','explore','jumps']){
   r.setMode(mode);await r.selectScene('b');require(r.mode===mode&&r.ready,mode+' preserved into second scene');
   await r.selectScene('a');require(r.mode===mode&&r.ready,mode+' preserved back to first scene');
  }
  r.setMode('fly');await Promise.all([r.selectScene('b'),r.selectScene('a')]);require(r.active.id==='a'&&r.mode==='fly'&&r.ready,'Rapid selections preserve mode');
  r.project.scenes.find(s=>s.id==='bad').source='missing.rad';await r.selectScene('bad');require(!r.ready&&r.mode==='fly','Failure preserves selected mode');
  r.active.source='main.rad';await r.selectScene('bad');require(r.ready&&r.mode==='fly','Retry preserves mode');
  await r.selectScene('c');require(r.mode==='jumps'&&r.ready,'Disabled mode falls back to enabled mode');
  await r.selectScene('a','hidden');require(r.currentViewpoint==='hidden','Unlisted scene entry remains reachable');
  r.setMode('explore');await r.selectScene('b','hidden');require(r.mode==='explore'&&Math.abs(r.rig.position.x-4)<.03,'Walk scene links ground at explicit entry');
  r.setMode('fly');r.activate(r.bubbles.children[0]);require(r.currentViewpoint==='hidden','Unlisted viewpoint bubble remains reachable');
  const target=r.project.scenes.find(s=>s.id==='a');target.entry='hidden';
  r.setMode('jumps');await r.selectScene('a');require(r.currentViewpoint==='hidden','Ordinary scene arrival uses unlisted entry');
  r.setMode('explore');const second=r.project.scenes.find(s=>s.id==='b');second.collider='';
  await r.selectScene('b');require(r.mode==='jumps'&&r.ready,'Missing collider falls back without collision-free walking');second.collider='floor.glb';
  await r.selectScene('a');r.setMode('explore');require(r.mode==='explore','Walk active before invalid destination');second.viewpoints[0].position=[30,1.7,30];await r.selectScene('b');
  require(r.mode==='jumps'&&r.ready,'Invalid walking start falls back to enabled Viewpoints');second.viewpoints[0].position=[0,1.7,3];
  await r.selectScene('a');
  target.viewpoints.forEach(v=>v.listed=false);await r.selectScene('a');require(r.ready&&r.currentViewpoint==='hidden','All unlisted scenes remain usable');
  target.viewpoints[0].listed=true;
  const xr=r.renderer.xr,original=xr.isPresenting,button=r.button,labels=[];
  xr.isPresenting=true;r.menuOpen=true;r.menuTab='views';r.button=function(text,...args){labels.push(text);return button.call(this,text,...args);};
  try{r.refreshHud();require(labels.some(t=>t.includes('Starting view'))&&!labels.some(t=>t.includes('Private entry')),'XR menu filters unlisted views');}
  finally{xr.isPresenting=original;r.button=button;r.menuOpen=false;r.refreshHud();}
 });
 assert.equal(await page.locator('.tour-viewpoint').count(),1);
 await page.screenshot({path:path.join(root,'visitor.png')});
 console.log('PASS: exported scene-mode continuity, rapid loads, failure/retry, fallback, unlisted links/entries and XR menu filtering');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
