import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {blankProject,newScene} from '../shared/project.mjs';
import {PerformanceSettingsSchema} from '../shared/performance.mjs';
import {floorGlb} from '../tests/fixtures.mjs';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

const require=createRequire(import.meta.url);
const {exportTour}=require('../desktop/export.cjs');
const {startServer}=require('../desktop/server.cjs');
const output=path.resolve('test-output','radix-walking-detail-'+Date.now());
const projectRoot=path.join(output,'project'),destination=path.join(output,'export');
const scan=path.join(projectRoot,'scan');
await fs.mkdir(scan,{recursive:true});

// The two walking targets have distinct real SOG chunks. Repeating a coarse
// range at the rear crosses the minimum visitor budget without a large asset.
const {files}=sogLodFixture(),decode=bytes=>JSON.parse(new TextDecoder().decode(bytes));
const original=decode(files['lod-meta.json']),filenames=[],children=[],counts=[0,0,0];
for(const [group,z,repeat] of [['first',0,1],['second',-6,1],['rear',20,800]]){
 const leaf=structuredClone(original.tree);
 leaf.bound.min[2]+=z;leaf.bound.max[2]+=z;
 if(group==='rear')leaf.lods={'2':leaf.lods['2']};
 for(const [level,range] of Object.entries(leaf.lods)){
  const name=original.filenames[range.file],folder=path.posix.dirname(name)+'/';
  range.file=filenames.push(group+'/'+name)-1;
  counts[Number(level)]+=repeat*range.count;
  await fs.mkdir(path.join(scan,group,folder),{recursive:true});
  for(const [ref,bytes] of Object.entries(files)){
   if(!ref.startsWith(folder))continue;
   let content=bytes;
   if(ref===name){
    const meta=decode(bytes);
    for(const limits of [meta.means.mins,meta.means.maxs]){
     const position=Math.sign(limits[2])*Math.expm1(Math.abs(limits[2]))+z;
     limits[2]=Math.sign(position)*Math.log1p(Math.abs(position));
    }
    content=JSON.stringify(meta);
   }
   await fs.writeFile(path.join(scan,group,ref),content);
  }
 }
 for(let i=0;i<repeat;i++)children.push(leaf);
}
function subtree(leaves){
 if(leaves.length===1)return leaves[0];
 const middle=Math.floor(leaves.length/2),left=subtree(leaves.slice(0,middle)),right=subtree(leaves.slice(middle));
 const bound={min:left.bound.min.map((v,i)=>Math.min(v,right.bound.min[i])),max:left.bound.max.map((v,i)=>Math.max(v,right.bound.max[i]))};
 return {bound,children:[left,right]};
}
const tree=subtree(children);
await fs.writeFile(path.join(scan,'lod-meta.json'),JSON.stringify({...original,tree,filenames,counts,count:counts.reduce((a,b)=>a+b)}));
await fs.writeFile(path.join(projectRoot,'floor.glb'),floorGlb());
const scene=newScene('walking','Walking detail','scan/lod-meta.json');
scene.collider='floor.glb';scene.modes=['jumps','explore'];scene.viewpoints[0].position=[0,1.7,6];
const settings=PerformanceSettingsSchema.parse({adaptiveDetail:true,adaptiveTargetFps:60,pixelRatio:.5,maxSh:0,radix:{
 selectedSplatBudget:200000,residentSplatBudget:200000,lodRangeMax:2,lodBaseDistance:2,lodMultiplier:1.6,lodUpdateDistance:.1
}});
const project={...blankProject(),startScene:scene.id,scenes:[scene],performance:{defaultPresetId:'walking',presets:[{id:'walking',name:'Walking',settings}]}};
await exportTour({project,hosting:{assetBaseUrl:'./',sceneUrls:{}},projectRoot,sources:{},destination,
 dist:path.resolve(process.env.RADIX_VIEWER_DIST||'dist'),portable:true,omitSplats:false,websiteOnly:true});
const {url,server}=await startServer({root:destination});
const errors=[],requests=[],checks=[];
let browser,page;
try{
 const channel=process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge';
 browser=await chromium.launch({...(process.env.SPARK_BROWSER_EXECUTABLE?{executablePath:process.env.SPARK_BROWSER_EXECUTABLE}:{channel:channel==='bundled'?undefined:channel}),
  headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-webgpu-adapter=swiftshader']});
 page=await browser.newPage({viewport:{width:1200,height:700}});
 page.on('pageerror',error=>errors.push(error.message));
 page.on('response',response=>{if(response.ok()&&response.url().endsWith('.webp'))requests.push(new URL(response.url()).pathname);});
 await page.goto(url+'?diagnostics=1&radixBackend=webgpu-gl');
 await page.getByRole('button',{name:'Enter tour',exact:true}).click();
 await page.waitForFunction(()=>window.tourRuntime?.ready);
 await page.getByRole('button',{name:'Walk',exact:true}).click();
 await page.waitForFunction(()=>window.tourRuntime.mode==='explore'&&!window.tourRuntime.preparingMode);
 await page.evaluate(()=>{
  const r=window.tourRuntime;
  r.renderer.setAnimationLoop(null);
  const stream=r.mesh.stream;
  const groupLeaf=group=>Array.from(stream.desired.keys()).find(leaf=>{
   const f=stream.tree.file[leaf*stream.tree.levels+2];
   return stream.tree.files[f].includes('/'+group+'/');
  });
  const first=groupLeaf('first'),second=groupLeaf('second');
  const probe=window.walkProbe={time:Math.max(performance.now(),r.last),authored:JSON.stringify(r.basePerformanceSettings)};
  probe.snapshot=()=>({
   backend:r.backend.stats.backend,mode:r.mode,z:r.rig.position.z,scale:r.adaptiveDetailScale,
   budget:stream.settings.splatBudget,selected:stream.stats.selected,shown:stream.stats.shown,loading:stream.stats.loading,
   desired:[stream.desired[first],stream.desired[second]],levels:[stream.shown[first],stream.shown[second]],
   presented:r.backend.hasPresented(r.mesh)&&r.backend.drawnCollection===r.backend.node.collection,
   visible:r.backend.stats.visible,errors:stream.stats.failed,authoredSame:JSON.stringify(r.basePerformanceSettings)===probe.authored,
  });
  const cadence=()=>1000/11*r.adaptiveDetailScale**.65;
  probe.frame=async()=>{probe.time+=cadence();r.frame(probe.time);await new Promise(resolve=>setTimeout(resolve,5));};
  // Feed elapsed frame intervals to the normal controller, keeping the real
  // renderer, pager and Walk physics for the ensuing camera motion and draws.
  for(let i=0;i<1200;i++){const frameMs=cadence();probe.time+=frameMs;r.updateAdaptivePerformance(probe.time,frameMs,false,false,0);}
  r.last=probe.time;
 });
 async function until(label,condition,arg){
  const deadline=Date.now()+30000;
  do{
   const state=await page.evaluate(async()=>{await window.walkProbe.frame();return window.walkProbe.snapshot();});
   if(condition(state,arg)){checks.push({label,...state});return state;}
  }while(Date.now()<deadline);
  throw Error(label+' timed out: '+JSON.stringify(await page.evaluate(()=>window.walkProbe.snapshot())));
 }
 const stable=s=>s.presented&&s.selected===s.shown&&s.loading===0&&s.errors===0;
 const approached=group=>requests.some(ref=>ref.endsWith('/'+group+'/0_0/means_l.webp'));
 const start=await until('collapsed budget before approaching either target',s=>s.scale===.25&&s.budget===50000&&stable(s));
 assert.equal(start.backend,'webgpu-gl');assert.deepEqual(start.levels,[2,2]);assert.equal(approached('first'),false);assert.equal(approached('second'),false);
 for(const [group,other,stopZ] of [['first','second',.85],['second','first',-5.15]]){
  await page.keyboard.down('w');
  try{await until('walk to '+group,s=>s.z<=stopZ);}finally{await page.keyboard.up('w');}
  const idx=group==='first'?0:1;
  const at=await until('present fine detail at '+group,s=>s.levels[idx]===0&&s.desired[idx]===0&&stable(s));
  assert.ok(approached(group),group+' must download its distinct finest-level image');
  assert.ok(at.levels[1-idx]!==0,other+' must offer the detail allowance to the nearby target');
  assert.ok(at.visible>0);assert.equal(at.budget,50000);assert.equal(at.scale,.25);assert.equal(at.authoredSame,true);
  if(group==='first')assert.equal(approached('second'),false,'the second finest chunk must still be cold');
 }
 await page.evaluate(()=>{
  const r=window.tourRuntime,base=r.basePerformanceSettings;
  r.applyPerformance({...base,adaptiveDetail:false,radix:{...base.radix,selectedSplatBudget:50000}});
 });
 const fixed=await until('fixed budget restores full coarse coverage',s=>s.scale===1&&s.budget===50000&&s.shown===51328&&stable(s));
 assert.deepEqual(fixed.levels,[2,2]);assert.equal(fixed.selected,counts[2]);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'results.json'),JSON.stringify({browser:browser.version(),rendering:'software ANGLE',checks,requests,errors},null,2));
 console.log('PASS exported viewer streamed and drew new nearby detail along a keyboard-driven Walk at a collapsed desktop budget, then restored fixed-budget coverage. '+output);
}catch(error){
 const state=await page?.evaluate(()=>window.walkProbe?.snapshot()??{status:window.tourRuntime?.status,mode:window.tourRuntime?.mode}).catch(()=>null);
 await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),state,checks,requests,errors},null,2));
 throw error;
}finally{
 await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
