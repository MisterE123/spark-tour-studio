import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const root=path.resolve('test-output','content-dialog-'+Date.now());
await fs.mkdir(path.join(root,'config'),{recursive:true});
const project=blankProject(),scene=newScene('a','Dialog controls','scene.rad'),second=newScene('b','Linked scene','scene.rad');
scene.viewpoints[0].autoAnimate=true;second.viewpoints[0].position=[4,1.7,3];
scene.hotspots=[{id:'info',label:'A local story',position:[0,1.7,0],kind:'page',target:'info'},{id:'custom',label:'Custom story',position:[1,1.7,0],kind:'page',target:'custom'}];
project.scenes=[scene,second];project.startScene='a';project.pages=[
 {id:'info',title:'A local story',html:'',blocks:[{type:'text',text:'A story to explore. '.repeat(200),url:''},{type:'link',text:'First link',url:'https://example.com/first'},{type:'link',text:'Last link',url:'https://example.com/last'}]},
 {id:'custom',title:'Custom story',html:'custom.html',blocks:[]}
];
const html=`<!doctype html><html><body><h1>Local page</h1><script>function act(viewpointId){parent.postMessage({type:'spark-tour-action',action:'scene',sceneId:'b',viewpointId},'*');}</script><button onclick="act('missing')">Invalid destination</button><button onclick="act(0)">Malformed destination</button><button onclick="act('start')">Valid destination</button></body></html>`;
for(const [name,bytes] of [['config/tour.json',JSON.stringify(project)],['config/hosting.json','{}'],['scene.rad',radFixture().rad],['custom.html',html]])await fs.writeFile(path.join(root,name),bytes);
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs');
const {server,url}=await startServer({root:path.resolve('dist'),resolve:name=>name.startsWith('config/')||['scene.rad','custom.html'].includes(name)?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page;const errors=[],external=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{if(route.request().url().startsWith(url))return route.continue();external.push(route.request().url());return route.abort();});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 await page.evaluate(()=>{
  const opener=document.createElement('button');opener.id='dialog-test-opener';opener.textContent='Open story';opener.style.cssText='position:fixed;left:0;top:0;z-index:100';
  opener.onclick=()=>{const r=window.tourRuntime;r.activate(r.bubbles.children.find(bubble=>bubble.userData.id==='info'));};document.body.append(opener);
 });
 await page.getByRole('button',{name:'Open story',exact:true}).click();await page.getByRole('dialog',{name:'A local story'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Close content',exact:true}).evaluate(element=>element===document.activeElement),true,'focus enters the story');
 await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('link',{name:'Last link',exact:true}).evaluate(element=>element===document.activeElement),true,'reverse Tab wraps within the story');
 await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'Close content',exact:true}).evaluate(element=>element===document.activeElement),true,'Tab wraps to Close');
 await page.keyboard.press('Tab');assert.equal(await page.getByRole('region',{name:'Story content',exact:true}).evaluate(element=>element===document.activeElement),true,'long stories have a keyboard scrolling surface');
 await page.keyboard.press('ArrowDown');await page.waitForFunction(()=>document.querySelector('.content-body').scrollTop>0);
 await page.keyboard.press('Tab');assert.equal(await page.getByRole('link',{name:'First link',exact:true}).evaluate(element=>element===document.activeElement),true,'story links stay keyboard accessible');
 await page.evaluate(()=>document.getElementById('dialog-test-opener').focus());assert.equal(await page.getByRole('button',{name:'Close content',exact:true}).evaluate(element=>element===document.activeElement),true,'focus cannot move behind the modal');
 const blocked=await page.evaluate(()=>{
  const r=window.tourRuntime,automatic=r.navigator.automatic,before=r.rig.position.toArray(),keys=[];
  for(const [key,code] of [['ArrowDown','ArrowDown'],['w','KeyW'],[' ','Space']]){const event=new KeyboardEvent('keydown',{key,code,bubbles:true,cancelable:true});document.querySelector('.content-body').dispatchEvent(event);keys.push({key,prevented:event.defaultPrevented});}
  return {automatic,before,after:r.rig.position.toArray(),stillAutomatic:r.navigator.automatic,pendingJump:r.jumpRequested,keys:[...r.keys],events:keys};
 });
 assert.equal(blocked.stillAutomatic,blocked.automatic,'story keys do not take control of the authored view');assert.deepEqual(blocked.before,blocked.after);assert.equal(blocked.pendingJump,false);assert.deepEqual(blocked.keys,[]);assert.ok(blocked.events.every(event=>!event.prevented),'arrows and Space remain available to story scrolling');
 await page.screenshot({path:path.join(root,'keyboard-story.png')});await page.keyboard.press('Escape');await page.getByRole('dialog',{name:'A local story'}).waitFor({state:'hidden'});
 assert.equal(await page.getByRole('button',{name:'Open story',exact:true}).evaluate(element=>element===document.activeElement),true,'closing restores the opener');
 assert.equal(await page.evaluate(()=>window.tourRuntime.blocked),false);
 await page.evaluate(()=>{const r=window.tourRuntime;r.activate(r.bubbles.children.find(bubble=>bubble.userData.id==='custom'));});
 const custom=page.frameLocator('.custom-content-frame');await custom.getByRole('heading',{name:'Local page'}).waitFor();
 await custom.getByRole('button',{name:'Invalid destination',exact:true}).click();await custom.getByRole('button',{name:'Malformed destination',exact:true}).click();
 assert.equal(await page.evaluate(()=>window.tourRuntime.active.id),'a');assert.equal(await page.getByRole('dialog',{name:'Custom story'}).count(),1,'invalid frame destinations do not close the page');
 await page.evaluate(()=>window.postMessage({type:'spark-tour-action',action:'close'},'*'));await page.waitForTimeout(30);assert.equal(await page.getByRole('dialog',{name:'Custom story'}).count(),1,'messages must originate from the content frame');
 await custom.getByRole('button',{name:'Valid destination',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime.active.id==='b'&&window.tourRuntime.ready);
 assert.equal(await page.getByRole('dialog',{name:'Custom story'}).count(),0);assert.ok(Math.abs(await page.evaluate(()=>window.tourRuntime.rig.position.x)-4)<.001);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({blocked,errors,external},null,2));
 console.log('PASS story keyboard focus, Tab cycling, Escape and opener restoration, navigation isolation and validated iframe destinations. '+root);
}catch(error){if(page)await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
