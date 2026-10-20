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

 const start=await page.evaluate(()=>({...window.tourRuntime.body.translation()}));
 for(const radius of [2,4,6,8])for(const heading of [0,45,90,135,180,225,270,315]){
  const target={x:start.x+Math.sin(heading*Math.PI/180)*radius,y:start.y-.87,z:start.z+Math.cos(heading*Math.PI/180)*radius};
  await page.evaluate(target=>{const r=window.tourRuntime;r.routes.cancel();window.clicks=[];r.walkTo(new (r.rig.position.constructor)(target.x,target.y,target.z));},target);
  await page.waitForTimeout(80);await page.waitForFunction(()=>{const r=window.tourRuntime;return !r.pagedCollider.leases.size&&(!r.routes.navigating||r.routes.points.length>0);},{},{timeout:30000}).catch(()=>{});
  const result=await page.evaluate(({target,heading,radius})=>{const r=window.tourRuntime,path=r.routes.points.map(p=>({x:p.x,y:p.y,z:p.z}));let length=0;for(let i=1;i<path.length;i++)length+=Math.hypot(path[i].x-path[i-1].x,path[i].y-path[i-1].y,path[i].z-path[i-1].z);const end=path.at(-1),start=r.body.translation(),direct=end?Math.hypot(end.x-start.x,end.z-start.z):0;return {target,heading,radius,length,direct,ratio:direct?length/direct:0,path};},{target,heading,radius});results.push(result);if(result.ratio>1.3)console.log(JSON.stringify({...result,path:undefined}));
 }
 const baseline=option('--baseline');if(baseline){const before=JSON.parse(await fs.readFile(baseline,'utf8'));let improved=0;for(let i=0;i<before.length;i++){if(!before[i].path.length)continue;assert.ok(results[i].path.length,'existing route is retained');assert.ok(results[i].length<=before[i].length+.05,'a refinement cannot lengthen an existing route');if(results[i].length<before[i].length-.1)improved++;}if(process.argv.includes('--expect-improvement'))assert.ok(improved>0,'at least one observed detour improves');console.log('PASS: route comparison',improved,'improved');}
 if(process.argv.includes('--walk')){
  const target=results.find(result=>result.heading===135&&result.radius===4).target;
  await page.evaluate(target=>window.tourRuntime.walkTo(new (window.tourRuntime.rig.position.constructor)(target.x,target.y,target.z)),target);
  await page.waitForFunction(()=>window.tourRuntime.routes.points.length>1);
  const reached=await page.evaluate(async()=>{const r=window.tourRuntime,end=r.routes.points.at(-1).clone(),render=r.renderer.render;r.renderer.render=()=>{};try{for(let batch=0;batch<60&&r.routes.points.length;batch++){for(let i=0;i<10;i++)r.frame(r.last+20);await r.pagedCollider.flush();}const body=r.body.translation();return {distance:Math.hypot(body.x-end.x,body.z-end.z),remaining:r.routes.points.length};}finally{r.renderer.render=render;}});assert.ok(reached.distance<.3&&reached.remaining===0,'selected real route is physically walkable: '+JSON.stringify(reached));console.log('PASS: selected route arrival',reached);
 }
 await fs.writeFile(path.join(output,'routes.json'),JSON.stringify(results,null,2));console.log('Route audit',results.filter(r=>r.path.length).length,'max ratio',Math.max(...results.map(r=>r.ratio)),output);
}finally{await browser?.close();await new Promise(resolve=>running.server.close(resolve));}
