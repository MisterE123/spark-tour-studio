// Read-only diagnostic against an existing project. All reports are written to
// ignored test-output; neither project configuration nor scene assets change.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {radFixture} from '../tests/fixtures.mjs';

const option=name=>{const i=process.argv.indexOf(name);return i<0?undefined:process.argv[i+1];};
const projectOption=option('--project');
if(!projectOption)throw Error('Usage: node scripts/real-walk-click-check.mjs --project PROJECT_FOLDER [--scene NAME_OR_ID] [--label LABEL] [--pitch -.1] [--assert]');
const projectRoot=await fs.realpath(path.resolve(projectOption)),project=JSON.parse(await fs.readFile(path.join(projectRoot,'config/tour.json'),'utf8'));
const sceneOption=option('--scene'),scene=sceneOption?project.scenes.find(item=>item.id===sceneOption||item.name===sceneOption):project.scenes.find(item=>item.id===project.startScene)||project.scenes[0];
assert.ok(scene,'Requested scene does not exist');assert.ok(scene.collider,'Requested scene has no collider');
const label=(option('--label')||'current').replace(/[^a-z0-9_-]/gi,'-'),seconds=Math.max(.25,Math.min(10,Number(option('--seconds'))||2)),headings=Math.max(1,Math.min(24,Number(option('--headings'))||8));
const angles=option('--heading')===undefined?Array.from({length:headings},(_,i)=>i*360/headings):[Number(option('--heading'))];assert.ok(angles.every(Number.isFinite),'Heading must be a finite number of degrees');
const output=path.resolve('test-output',`real walking ${label} ${Date.now()}`),dist=path.resolve(option('--dist')||(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist'));
await fs.mkdir(output,{recursive:true});
const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs'),placeholder=process.argv.includes('--placeholder'),rad=placeholder?radFixture().rad:undefined;
const servedProject={...project,startScene:scene.id};
const running=await startServer({root:dist,control:async({name,req,res})=>{
 if(name==='config/tour.json'){const text=JSON.stringify(servedProject);res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(text),'Cache-Control':'no-cache'}).end(req.method==='HEAD'?undefined:text);return true;}
 if(rad&&name===scene.source){res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Length':rad.length}).end(req.method==='HEAD'?undefined:rad);return true;}
 return false;
},resolve:name=>/^(config|colliders|imports|media|pages|assets\/converted)\//.test(name)?{root:projectRoot,relative:name}:undefined});

let browser,page;const results=[];
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(120000);
 await page.goto(running.url+'?diagnostics=1&pitch='+encodeURIComponent(option('--pitch')||'-.5'));await page.getByRole('button',{name:'Enter tour',exact:true}).click();
 await page.waitForFunction(()=>window.tourRuntime?.ready&&!!window.tourRuntime.world,{},{timeout:180000});
 await page.evaluate(async()=>{const r=window.tourRuntime;r.applyPerformance({...r.performanceSettings,lodSplatCount:300000});r.setMode('explore',true,true);await r.modeTransition;r.showCollider(true);r.renderer.setAnimationLoop(null);window.clicks=[];
 const find=r.routes.find.bind(r.routes);r.routes.find=(start,end)=>{window.clicks.push({stage:'find',start,end});find(start,end);};
 r.routes.worker.addEventListener('message',e=>{if(e.data.type==='error')window.clicks.push({stage:'error',...e.data});});
 const walk=r.walkTo.bind(r);r.walkTo=(point,...args)=>{window.clicks.push({stage:'walkTo',point:point.toArray()});walk(point,...args);};
 });
 for(const heading of angles){
  await page.evaluate(heading=>{const r=window.tourRuntime;r.routes.cancel();window.clicks=[];r.rig.rotation.y=heading*Math.PI/180;r.camera.rotation.x=Number(new URLSearchParams(location.search).get('pitch')||-.5);r.frame(r.last+20);},heading);
  // Let the visible paged splat selection settle before using its picker.
  await page.waitForTimeout(450);
  await page.evaluate(()=>{const r=window.tourRuntime,rect=r.renderer.domElement.getBoundingClientRect();r.click({clientX:rect.x+rect.width*.5,clientY:rect.y+rect.height*.55});});
  await page.waitForTimeout(1000);
  await page.waitForFunction(()=>{const r=window.tourRuntime;return !r.pagedCollider?.leases.size&&(!r.routes.navigating||r.routes.points.length>0);},{},{timeout:30000}).catch(()=>{});
  const result=await page.evaluate(heading=>{const r=window.tourRuntime;return {heading,log:window.clicks.filter(item=>['walkTo','find','error'].includes(item.stage)),points:r.routes.points.length,revision:r.routes.revision,preparing:r.routes.preparing,body:r.body.translation(),status:r.status,paged:!!r.pagedCollider,aligned:r.pagedNavigationAligned,detail:r.pagedCollider?.manifest.detail};},heading);results.push(result);console.log(JSON.stringify(result));
 }
 if(process.argv.includes('--assert'))for(const heading of [0,45,90,135,180])assert.ok(results.find(result=>result.heading===heading)?.points>2,'Reachable graveyard heading '+heading+' starts a route');
 // Exercise actual movement after a previously failing northbound click.
 await page.evaluate(async()=>{const r=window.tourRuntime,Vector=r.rig.position.constructor;r.routes.cancel();r.rig.rotation.y=Math.PI;r.camera.rotation.x=-.1;r.frame(r.last+20);const rect=r.renderer.domElement.getBoundingClientRect();window.travelStart={...r.body.translation()};r.click({clientX:rect.x+rect.width/2,clientY:rect.y+rect.height*.55});});
 await page.waitForFunction(()=>window.tourRuntime.routes.points.length>2);
 const moved=await page.evaluate(async()=>{const r=window.tourRuntime;for(let batch=0;batch<30;batch++){for(let i=0;i<10;i++)r.frame(r.last+20);await r.pagedCollider.flush();}return Math.hypot(r.body.translation().x-window.travelStart.x,r.body.translation().z-window.travelStart.z);});assert.ok(moved>.5,'Resolved path actually moves the walking capsule');console.log('PASS: previously failing click starts walking',moved);
 if(process.argv.includes('--screenshot'))await page.screenshot({path:path.join(output,'clicks.png'),timeout:15000});await fs.writeFile(path.join(output,'clicks.json'),JSON.stringify(results,null,2));console.log(output);
}finally{await browser?.close();await new Promise(resolve=>running.server.close(resolve));}
