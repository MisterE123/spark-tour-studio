import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

// Real TourRuntime, local SOGS paging and Radix rendering. No user's project,
// running Studio or conversion process is opened, changed or stopped.
const {startServer}=createRequire(import.meta.url)('../desktop/server.cjs');
const output=path.resolve('test-output','scene performance '+Date.now());await fs.mkdir(output,{recursive:true});
for(const[name,bytes]of Object.entries(sogLodFixture().files)){const file=path.join(output,'scan',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
await fs.writeFile(path.join(output,'index.html'),'<!doctype html><link rel="icon" href="data:,"><style>html,body,#stage{width:100%;height:100%;margin:0;overflow:hidden}</style><div id="stage"></div><script type="module" src="./harness.js"></script>');
await fs.writeFile(path.join(output,'harness.ts'),String.raw`
import {TourRuntime} from '../../src/runtime';
import {blankProject,newScene,ProjectSchema} from '../../shared/project.mjs';
import {PerformanceSettingsSchema} from '../../shared/performance.mjs';
const state=window.test={ready:false,statuses:[],changes:[],assetSettings:[]};
const runtime=state.runtime=await TourRuntime.create(document.querySelector('#stage'));
const createAsset=runtime.backend.createAsset.bind(runtime.backend);runtime.backend.createAsset=(...args)=>{state.assetSettings.push(structuredClone(runtime.backend.settings));return createAsset(...args);};
runtime.onStatus=(text,error)=>state.statuses.push({text,error});
const base=state.base=PerformanceSettingsSchema.parse({pixelRatio:1,radix:{lodBaseDistance:120,lodMultiplier:1.5,lodRangeMin:4,lodRangeMax:6,selectedSplatBudget:200000,residentSplatBudget:600000}});
runtime.applyPerformance(base);
const a=newScene('a','Aerial','scan/lod-meta.json'),b=newScene('b','Room','scan/lod-meta.json');
a.performance={radix:{lodBaseDistance:700,lodMultiplier:3,lodRangeMin:2}};
a.viewpoints[0].performance={radix:{lodBaseDistance:850,lodRangeMax:1}};
a.viewpoints.push({...structuredClone(a.viewpoints[0]),id:'plain',name:'Inherit scene',performance:undefined},{...structuredClone(a.viewpoints[0]),id:'detail',name:'Detailed view',performance:{radix:{lodBaseDistance:920,lodMultiplier:4}}});
for(const scene of[a,b]){scene.modes=['jumps','fly'];scene.background={type:'solid',color:'#183340'};}
const project=state.project=ProjectSchema.parse({...blankProject(),scenes:[a,b],startScene:'a'});
state.projectBefore=JSON.stringify(project);state.baseBefore=JSON.stringify(base);
state.identity={renderer:runtime.renderer,canvas:runtime.renderer.domElement,camera:runtime.camera,rig:runtime.rig};
runtime.subscribePerformance(settings=>state.changes.push({settings:structuredClone(settings),base:structuredClone(runtime.basePerformanceSettings)}));
state.snapshot=()=>({effective:runtime.performanceSettings,base:runtime.basePerformanceSettings,scene:runtime.active?.id,viewpoint:runtime.currentViewpoint,quality:runtime.quality,editing:runtime.editing,shown:runtime.getRenderStats().shown,ready:runtime.ready,history:runtime.framePerformance.snapshot(performance.now()),identity:{renderer:runtime.renderer===state.identity.renderer,canvas:runtime.renderer.domElement===state.identity.canvas,camera:runtime.camera===state.identity.camera,rig:runtime.rig===state.identity.rig}});
await runtime.load(project,{assetBaseUrl:'./',sceneUrls:{}},location.href);
state.ready=true;
`);
await build({entryPoints:{harness:path.join(output,'harness.ts'),'navigation.worker':'src/navigation.worker.ts','paged-physics.worker':'src/paged-physics.worker.ts'},outdir:output,bundle:true,splitting:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent',plugins:[{name:'isolated-urls',setup(builder){
 builder.onResolve({filter:/^@dimforge\/rapier3d-compat\?url&no-inline$/},()=>({path:'physics-url',namespace:'fixture'}));
 builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default "./unused-physics.mjs"',loader:'js'}));
 builder.onLoad({filter:/[\\/](walking-routes|paged-collider)\.ts$/},async({path:source})=>({contents:(await fs.readFile(source,'utf8')).replaceAll('./navigation.worker.ts','./navigation.worker.js').replaceAll('./paged-physics.worker.ts','./paged-physics.worker.js'),loader:'ts',resolveDir:path.dirname(source)}));
 }}]});
const {server,url}=await startServer({root:output}),errors=[],requests=[];let browser;
const report={output,cases:[]};
try{
 browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL==='bundled'?undefined:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge',headless:true,timeout:30000,args:['--enable-webgl','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
 const page=await browser.newPage({viewport:{width:800,height:600}});page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()));
 await page.goto(url+'index.html?radixBackend=webgpu-gl');await page.waitForFunction(()=>window.test?.ready&&test.runtime.ready);
 const snapshot=()=>page.evaluate(()=>test.snapshot()),record=async name=>{const state=await snapshot();assert.ok(Object.values(state.identity).every(Boolean),name+': renderer/camera/rig identity');report.cases.push({name,state});return state;};
 let state=await record('Entry viewpoint overrides scene defaults before creating the pager');assert.equal(state.scene,'a');assert.equal(state.effective.radix.lodBaseDistance,850);assert.equal(state.effective.radix.lodMultiplier,3);assert.deepEqual([state.effective.radix.lodRangeMin,state.effective.radix.lodRangeMax],[1,1]);assert.equal(state.base.radix.lodBaseDistance,120);assert.ok(state.shown>0);assert.equal(await page.evaluate(()=>test.assetSettings[0].lodBaseDistance),850,'the asset constructor receives the authored entry policy before metadata/paging');
 assert.deepEqual(await page.evaluate(()=>[JSON.stringify(test.base)===test.baseBefore,JSON.stringify(test.project)===test.projectBefore]),[true,true],'resolution must not mutate authored settings/project');
 await page.evaluate(()=>{test.mesh=test.runtime.mesh;test.runtime.jump('plain',false);});state=await record('A sibling view without overrides inherits only the scene policy');assert.equal(state.effective.radix.lodBaseDistance,700);assert.deepEqual([state.effective.radix.lodRangeMin,state.effective.radix.lodRangeMax],[2,6]);assert.equal(await page.evaluate(()=>test.runtime.mesh===test.mesh),true);
 await page.evaluate(()=>test.runtime.jump('detail',false));state=await record('Another view applies its own policy without replacing resources');assert.equal(state.effective.radix.lodBaseDistance,920);assert.equal(state.effective.radix.lodMultiplier,4);assert.equal(state.base.radix.lodBaseDistance,120);
 await page.evaluate(()=>{const runtime=test.runtime;test.pose={position:runtime.rig.position.toArray(),rotation:runtime.rig.quaternion.toArray()};runtime.updateScene({...runtime.active,viewpoints:runtime.active.viewpoints.map(view=>view.id==='detail'?{...view,performance:{radix:{lodBaseDistance:970}}}:view)});});state=await record('Editing the active view policy applies live without a camera jump');assert.equal(state.effective.radix.lodBaseDistance,970);assert.equal(state.effective.radix.lodMultiplier,3);assert.deepEqual(await page.evaluate(()=>[test.runtime.mesh===test.mesh,JSON.stringify(test.runtime.rig.position.toArray())===JSON.stringify(test.pose.position),JSON.stringify(test.runtime.rig.quaternion.toArray())===JSON.stringify(test.pose.rotation)]),[true,true,true]);
 await page.evaluate(()=>{const runtime=test.runtime;runtime.updateScene({...runtime.active,viewpoints:runtime.active.viewpoints.map(view=>view.id==='detail'?{...view,performance:undefined}:view)});});state=await record('Removing the selected view policy restores inherited scene values live');assert.equal(state.effective.radix.lodBaseDistance,700);assert.equal(state.viewpoint,'detail');
 await page.evaluate(()=>{test.runtime.setMode('fly');});state=await record('Leaving a view for Drone restores scene policy');assert.equal(state.viewpoint,'');assert.equal(state.effective.radix.lodBaseDistance,700);assert.equal(state.effective.radix.lodMultiplier,3);
 await page.evaluate(()=>{test.runtime.updateScene(test.project.scenes[0]);test.runtime.jump('detail',false);test.runtime.keys.add('KeyW');});await page.waitForFunction(()=>test.runtime.currentViewpoint==='');await page.evaluate(()=>test.runtime.keys.clear());state=await record('Actual Drone keyboard movement clears the selected view policy');assert.equal(state.effective.radix.lodBaseDistance,700);assert.equal(state.effective.radix.lodMultiplier,3);
 await page.evaluate(()=>{test.runtime.setMode('jumps');test.runtime.jump('plain',false);});
 await page.evaluate(()=>test.runtime.selectScene('b'));await page.waitForFunction(()=>test.runtime.ready);state=await record('Room inherits tour settings without aerial leakage');assert.equal(state.effective.radix.lodBaseDistance,120);assert.equal(state.effective.radix.lodMultiplier,1.5);
 await page.evaluate(()=>test.runtime.selectScene('a','detail'));await page.waitForFunction(()=>test.runtime.ready);state=await record('Scene-link destination view policy is active before its pager starts');assert.equal(state.viewpoint,'detail');assert.equal(state.effective.radix.lodBaseDistance,920);assert.equal(await page.evaluate(()=>test.assetSettings.at(-1).lodBaseDistance),920);
 await page.evaluate(()=>test.runtime.applyPerformance({...test.runtime.basePerformanceSettings,radix:{...test.runtime.basePerformanceSettings.radix,lodBaseDistance:50,lodMultiplier:2}}));state=await record('Visitor tuning preserves the view without writing its policy into the baseline');assert.equal(state.effective.radix.lodBaseDistance,920);assert.equal(state.effective.radix.lodMultiplier,4);assert.equal(state.base.radix.lodBaseDistance,50);assert.equal(state.base.radix.lodMultiplier,2);
 await page.evaluate(()=>test.runtime.jump('plain',false));
 await page.evaluate(()=>test.runtime.applyPerformance({...test.runtime.basePerformanceSettings,pixelRatio:.9,radix:{...test.runtime.basePerformanceSettings.radix,lodBaseDistance:35,lodMultiplier:1.2,selectedSplatBudget:300000}}));
 state=await record('Visitor preset changes base while aerial distances stay authored');assert.equal(state.effective.radix.lodBaseDistance,700);assert.equal(state.base.radix.lodBaseDistance,35);assert.equal(state.effective.radix.selectedSplatBudget,300000);assert.equal(state.effective.pixelRatio,.9);
 await page.evaluate(()=>test.runtime.setQuality(.5));state=await record('Detail multiplier changes base budget without capturing current scene distances');assert.equal(state.base.radix.selectedSplatBudget,150000);assert.equal(state.base.radix.lodBaseDistance,35);assert.equal(state.effective.radix.lodBaseDistance,700);assert.equal(state.quality,.5);
 await page.evaluate(()=>{const runtime=test.runtime;test.mesh=runtime.mesh;test.pose={position:runtime.rig.position.toArray(),rotation:runtime.rig.quaternion.toArray()};runtime.setEditing(true);runtime.updateScene({...runtime.active,performance:{radix:{lodBaseDistance:950,lodRangeMax:1}}});});
 state=await record('Live authoring updates override without replacing scene/camera');assert.equal(state.effective.radix.lodBaseDistance,950);assert.equal(state.effective.radix.lodRangeMin,1);assert.equal(state.effective.radix.lodRangeMax,1);assert.deepEqual(await page.evaluate(()=>[test.runtime.mesh===test.mesh,JSON.stringify(test.runtime.rig.position.toArray())===JSON.stringify(test.pose.position),JSON.stringify(test.runtime.rig.quaternion.toArray())===JSON.stringify(test.pose.rotation)]),[true,true,true]);
 await page.evaluate(()=>{const runtime=test.runtime;runtime.setEditing(false);runtime.updateScene({...runtime.active,performance:undefined});});
 state=await record('Preview and removing scene override restore current visitor/tour baseline');assert.equal(state.effective.radix.lodBaseDistance,35);assert.equal(state.effective.radix.lodMultiplier,1.2);assert.equal(state.effective.radix.selectedSplatBudget,150000);assert.equal(state.quality,.5);
 await page.evaluate(()=>test.runtime.updateScene({...test.project.scenes[1],performance:{radix:{lodBaseDistance:999}}}));assert.equal((await snapshot()).effective.radix.lodBaseDistance,35,'editing another scene must not change active scene performance');
 await page.evaluate(()=>test.runtime.selectScene('b'));await page.waitForFunction(()=>test.runtime.ready);state=await record('Subsequent scene uses current baseline including quality multiplier');assert.equal(state.effective.radix.lodBaseDistance,35);assert.equal(state.effective.radix.selectedSplatBudget,150000);assert.equal(state.quality,.5);
 const cadence=await page.evaluate(()=>{const runtime=test.runtime;runtime.renderer.setAnimationLoop(null);runtime.framePerformance.reset();runtime.flight=undefined;runtime.fadeUntil=0;let time=performance.now();runtime.last=time;for(const ms of[16,16,180,16])runtime.frame(time+=ms);const sampled=runtime.framePerformance.snapshot(time);Object.defineProperty(document,'hidden',{configurable:true,value:true});runtime.frame(time+=5000);delete document.hidden;runtime.frame(time+=16);runtime.frame(time+=16);return {sampled,resumed:runtime.framePerformance.snapshot(time)};});assert.equal(cadence.sampled.sampleCount,3);assert.equal(cadence.sampled.worstFrameMs,180,'sampler retains the actual long interval instead of locomotion\'s capped50ms');assert.equal(cadence.sampled.spikeCount,1);assert.ok(Math.abs(cadence.sampled.averageFps-3000/212)<1e-6,'averageFPS derives from totalframes/time, not averagingFPS');assert.equal(cadence.resumed.sampleCount,4);assert.equal(cadence.resumed.worstFrameMs,180,'hidden five-second gap is excluded');report.cadence=cadence;
 await page.evaluate(()=>test.runtime.unload());state=await record('Unload restores base settings without stale scene overrides');assert.equal(state.scene,undefined);assert.deepEqual(state.effective,state.base);assert.equal(state.ready,false);
 report.requests=requests;assert.deepEqual(errors,[]);assert.ok(requests.every(request=>request.startsWith(url)||request.startsWith('blob:'+url)||request.startsWith('data:')),'all runtime and assets remain locally served');assert.ok(!requests.some(request=>request.endsWith('unused-physics.mjs')),'viewpoint performance changes do not initialize collision physics');
 report.notifications=await page.evaluate(()=>test.changes.length);assert.ok(report.notifications>=7,'effective settings changes notify settings UI');report.errors=errors;report.pass=true;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('PASS: '+report.cases.length+' source scene-performance cases; '+output);
}catch(error){report.error=String(error);report.errors=errors;await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));throw error;}
finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
