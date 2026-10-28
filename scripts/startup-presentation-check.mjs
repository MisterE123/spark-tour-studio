import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {radPointsFixture} from '../tests/fixtures.mjs';

const root=path.resolve('test-output','startup presentation '+Date.now());
await fs.mkdir(path.join(root,'config'),{recursive:true});
const project=blankProject(),scene=newScene('entry','Authored starting view','scene.rad');
scene.viewpoints[0].position=[30,1.7,10];scene.viewpoints[0].rotation=[0,0,0];
scene.viewpoints[0].type='orbit';project.cover='cover.svg';
scene.viewpoints[0].orbit={center:[30,1.7,7],radius:3};scene.viewpoints[0].autoAnimate=true;
scene.background={type:'panorama',source:'sky.svg',yawDegrees:0};
project.scenes=[scene];project.startScene=scene.id;
const fixture=radPointsFixture([[30,1.7,7]],{chunkFilename:'scene.radc'});
const image='<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#415f74"/></svg>';
for(const [name,bytes] of [['config/tour.json',JSON.stringify(project)],['config/hosting.json','{}'],['scene.rad',fixture.rad],['scene.radc',fixture.chunk],['cover.svg',image],['sky.svg',image]])await fs.writeFile(path.join(root,name),bytes);
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs');
const {server,url}=await startServer({root:path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'),resolve:name=>/^(config\/|scene\.rad|cover\.svg|sky\.svg)/.test(name)?{root,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let releaseChunk=()=>{},releaseSky=()=>{},page;const errors=[];
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});
 page.on('pageerror',error=>errors.push(error.message));
 const chunkGate=new Promise(resolve=>releaseChunk=resolve),skyGate=new Promise(resolve=>releaseSky=resolve);let chunkRequested=false,skyRequested=false;
 await page.route('**/scene.radc',async route=>{chunkRequested=true;await chunkGate;await route.continue();});
 await page.route('**/sky.svg',async route=>{skyRequested=true;await skyGate;await route.continue();});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();
 const deadline=Date.now()+10000;while(!chunkRequested||!skyRequested){if(Date.now()>deadline)throw Error('Expected normal scene and background requests');await page.waitForTimeout(20);}
 const early=await page.evaluate(()=>{const r=window.tourRuntime;return {position:r.camera.getWorldPosition(r.rig.position.clone()).toArray(),loading:r.loading?.phase,display:r.spark.display.numSplats};});
 assert.ok(Math.abs(early.position[0]-30)<.001&&Math.abs(early.position[2]-10)<.001,'first paging uses the authored camera before background preparation finishes');
 assert.equal(early.display,0);releaseSky();
 await page.waitForFunction(()=>window.tourRuntime?.loading?.phase==='Preparing first view…');
 const held=await page.evaluate(()=>{const r=window.tourRuntime;return {position:r.rig.position.toArray(),loading:!!r.loading,display:r.spark.display.numSplats};});
 await page.waitForTimeout(200);
 assert.deepEqual(await page.evaluate(()=>window.tourRuntime.rig.position.toArray()),held.position,'authored orbit waits while the initial view is covered');
 assert.equal(held.loading,true);assert.equal(held.display,0);assert.ok(await page.locator('.scene-loading-cover').isVisible());
 await page.screenshot({path:path.join(root,'preparing.png')});
 releaseChunk();await page.waitForFunction(()=>!window.tourRuntime.loading&&window.tourRuntime.spark.display.numSplats>0);
 assert.equal(await page.locator('.scene-loading').count(),0);
 const revealed=await page.evaluate(()=>{const r=window.tourRuntime;return {position:r.rig.position.toArray(),display:r.spark.display.numSplats,first:!!r.firstDisplay};});
 assert.equal(revealed.first,false);assert.ok(revealed.display>0);
 await page.waitForFunction(position=>window.tourRuntime.rig.position.distanceTo({x:position[0],y:position[1],z:position[2]})>.001,revealed.position);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'revealed.png')});
 await fs.writeFile(path.join(root,'result.json'),JSON.stringify({early,held,revealed,errors},null,2));
 console.log('PASS entry camera before paging, visible loading cover during actual cold data, paused authored animation and first-frame reveal. '+root);
}catch(error){if(page){await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});console.error(await page.evaluate(()=>({text:document.body.innerText,ready:!!window.tourRuntime})).catch(()=>({})));}console.error(errors);throw error;}
finally{releaseChunk();releaseSky();await browser.close();await new Promise(resolve=>server.close(resolve));}
