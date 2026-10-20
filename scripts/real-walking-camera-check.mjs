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
if(!projectOption)throw Error('Usage: node scripts/real-walking-camera-check.mjs --project PROJECT_FOLDER [--scene NAME_OR_ID] [--label LABEL] [--placeholder] [--seconds 2]');
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
let browser,page;const errors=[],requests={rad:0,collision:0};
try{
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{const url=request.url();if(/\.rad[c]?($|\?)/.test(url))requests.rad++;if(/\/colliders\//.test(url))requests.collision++;});
 await page.goto(running.url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();
 await page.waitForFunction(()=>window.tourRuntime?.ready&&!!window.tourRuntime.world,{},{timeout:180000});
 await page.evaluate(async()=>{const r=window.tourRuntime;r.renderer.setAnimationLoop(null);r.setMode('explore',true,true);await r.modeTransition;r.renderer.setAnimationLoop(null);r.routes.cancel();r.speed=2;});
 assert.equal(await page.evaluate(()=>window.tourRuntime.mode),'explore','Authored walking start must activate');
 await page.screenshot({path:path.join(output,'starting-view.png')});
 const starting=await page.evaluate(()=>{const r=window.tourRuntime;r.renderer.render=()=>{};r.keys.clear();r.blocked=false;r.camera.rotation.x=0;r.routes.cancel();const body={...r.body.translation()};window.realWalkStart=body;return {body,eye:r.camera.getWorldPosition(r.rig.position.clone()).toArray(),viewHeight:r.viewHeight,stepHeight:r.stepHeight,collider:r.active.collider,hasSmoothing:!!r.walkCamera};});
 const walks=[];
 for(const heading of angles){
  const result=await page.evaluate(async({heading,seconds})=>{
   const r=window.tourRuntime,p=r.pagedCollider,start=window.realWalkStart,Vector=r.rig.position.constructor;
   r.keys.clear();r.routes.cancel();r.setTouch(0,0);r.rig.rotation.y=heading*Math.PI/180;r.camera.rotation.x=0;
   r.placeFeet(new Vector(start.x,start.y-(r.crouched?.57:.87),start.z));
   if(p){p.focus(r.camera.getWorldPosition(new Vector()),r.body.translation());await p.flush();}
   const records=[],hz=60,frames=Math.ceil(seconds*hz);r.setTouch(0,-1);
   for(let frame=0;frame<frames;frame++){
    const before={...r.body.translation()},eyeBefore=r.camera.getWorldPosition(new Vector()).y;
    r.frame(r.last+1000/hz);const body={...r.body.translation()},eye=r.camera.getWorldPosition(new Vector()).y;
    records.push({frame,body:[body.x,body.y,body.z],eye,dy:body.y-before.y,eyeDy:eye-eyeBefore,travel:Math.hypot(body.x-before.x,body.z-before.z),grounded:r.walking?r.walking.grounded:r.character.computedGrounded(),allowed:!p||p.allows(body,r.crouched?.3:.6,.24),velocityY:r.walking?r.walking.velocityY:r.velocityY,jumping:r.walking?.jumping,stepPlan:!!r.walking?.plan});
    // Give real streamed physics workers an opportunity to finish without
    // treating asynchronous network preparation as a blocked stair decision.
    if(frame%6===5){await new Promise(resolve=>setTimeout(resolve,0));if(p){p.focus(r.camera.getWorldPosition(new Vector()),body);await p.flush();}}
   }
   const movingBody={...r.body.translation()},movingContacts=[];
   for(let i=0;i<r.character.numComputedCollisions();i++){
    const hit=r.character.computedCollision(i);if(!hit)continue;const n=hit.normal1,horizontal=Math.hypot(n.x,n.z),foot=movingBody.y-r.capsule.halfHeight()-r.capsule.radius()-.015;
    const probe=horizontal?{x:hit.witness1.x-n.x/horizontal*.005,y:foot+r.stepHeight+.03,z:hit.witness1.z-n.z/horizontal*.005}:undefined;
    const cast=origin=>r.world.castRayAndGetNormal({origin,dir:{x:0,y:-1,z:0}},5,true,undefined,undefined,r.capsule,undefined,collider=>collider.handle===hit.collider.handle);
    const top=probe?cast(probe):undefined,high=probe?cast({...probe,y:probe.y+3}):undefined;
    movingContacts.push({normal:{...n},witness:{...hit.witness1},probe,top:top?{pointY:probe.y-top.timeOfImpact,distance:top.timeOfImpact,normal:{...top.normal}}:null,highTop:high?{pointY:probe.y+3-high.timeOfImpact,distance:high.timeOfImpact,normal:{...high.normal}}:null});
   }
   r.setTouch(0,0);
   for(let frame=0;frame<30;frame++){r.frame(r.last+1000/hz);if(frame%6===5)await new Promise(resolve=>setTimeout(resolve,0));}
   let maxStall=0,stall=0,reversals=0,eyeReversals=0,previousSign=0,previousEyeSign=0;
   for(const record of records){stall=record.travel<.0005?stall+1:0;maxStall=Math.max(maxStall,stall);if(Math.abs(record.dy)>.001){const sign=Math.sign(record.dy);if(previousSign&&sign!==previousSign)reversals++;previousSign=sign;}if(Math.abs(record.eyeDy)>.001){const sign=Math.sign(record.eyeDy);if(previousEyeSign&&sign!==previousEyeSign)eyeReversals++;previousEyeSign=sign;}}
   const end=r.body.translation(),contacts=[];
   for(let i=0;i<r.character.numComputedCollisions();i++){const hit=r.character.computedCollision(i);if(hit)contacts.push({normal:{...hit.normal1},witness:{...hit.witness1}});}
   const floorProbes=[{x:0,z:0},{x:.15,z:0},{x:-.15,z:0},{x:0,z:.15},{x:0,z:-.15}].map(offset=>{const origin={x:end.x+offset.x,y:end.y,z:end.z+offset.z},hit=r.world.castRayAndGetNormal({origin,dir:{x:0,y:-1,z:0}},3,true,undefined,undefined,r.capsule);return {offset,hit:hit?{distance:hit.timeOfImpact,normal:{...hit.normal}}:null};});
   return {heading,displacement:Math.hypot(end.x-start.x,end.z-start.z),bodyRise:end.y-start.y,maxBodyDelta:Math.max(...records.map(record=>Math.abs(record.dy))),maxEyeDelta:Math.max(...records.map(record=>Math.abs(record.eyeDy))),maxStallSeconds:maxStall/hz,verticalReversals:reversals,eyeReversals,unsafeFrames:records.filter(record=>!record.allowed).length,movingContact:{body:movingBody,contacts:movingContacts},finalContact:{body:{...end},grounded:r.walking?r.walking.grounded:r.character.computedGrounded(),velocityY:r.walking?r.walking.velocityY:r.velocityY,support:r.walking?.support(r.world,r.capsule,end,1.1),contacts,floorProbes},records};
  },{heading,seconds});
  walks.push(result);console.log(JSON.stringify({...result,records:undefined,finalContact:undefined,movingContact:undefined}));
 }
 assert.deepEqual(errors,[],'Real project must not produce uncaught runtime errors');
 assert.ok(walks.every(walk=>walk.records.every(record=>[...record.body,record.eye].every(Number.isFinite))),'Walking and camera positions stay finite');
 assert.ok(walks.every(walk=>walk.unsafeFrames===0),'Every accepted walking capsule remains in verified navigable space');
 if(process.argv.includes('--assert-smooth'))assert.ok(walks.every(walk=>walk.records.every(record=>!record.grounded&&!record.stepPlan||Math.abs(record.eyeDy)<=2.5/60+.005)),'Grounded terrain eye movement respects the smoothing speed cap');
 const report={label,scene:{id:scene.id,name:scene.name,source:scene.source,collider:scene.collider,transform:scene.transform,colliderTransform:scene.colliderTransform},placeholder,seconds,starting,requests,errors,walks};
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify(report,null,2));console.log(`PASS: read-only real-project walking diagnostic. ${output}`);
}catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),errors,text:page?await page.locator('body').innerText().catch(()=>undefined):undefined},null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>running.server.close(resolve));}
