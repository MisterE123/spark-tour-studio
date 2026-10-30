import {_electron as electron,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {blankProject,newScene,ProjectSchema,HostingSchema} from '../shared/project.mjs';
import {plainTextDocument} from '../shared/rich-text.mjs';
import {radFixture,floorGlb} from '../tests/fixtures.mjs';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

// Synthetic authoring data only. An explicit package must be the experimental
// editor, never the stable release. Development uses the current local build.
const explicit=process.env.SPARK_RADIX_EDITOR_EXE?path.resolve(process.env.SPARK_RADIX_EDITOR_EXE):undefined;
if(explicit&&path.relative(path.resolve('release'),explicit).split(path.sep)[0]!=='..')throw Error('Choose the experimental editor; the stable release is excluded.');
const root=path.resolve('test-output','radix-invalid-scenes-'+Date.now()),folder=path.join(root,'project'),replacementFolder=path.join(root,'replacement SOGS #100% 東');
await fs.mkdir(path.join(folder,'config'),{recursive:true});
const fixture=sogLodFixture();
async function writeSog(destination){for(const [name,bytes] of Object.entries(fixture.files)){const target=path.join(destination,name);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);}}
await writeSog(path.join(folder,'valid'));await writeSog(replacementFolder);
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD+8AAAAASUVORK5CYII=','base64'),thumbnail='data:image/png;base64,'+pixel.toString('base64');
const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
const definitions=[['legacy','Legacy RAD','legacy.rad'],['second-rad','Second legacy RAD','second.rad?revision=2'],['unknown','Unsupported PLY','unsupported.ply'],['empty','No source',''],['walk-only','Walk-only legacy RAD','walk-only.rad'],['missing','Missing SOGS','missing/lod-meta.json'],['valid','Working SOGS','valid/lod-meta.json'],['blocked-override','SOGS with RAD override','valid/lod-meta.json'],['allowed-override','RAD with SOGS override','override-source.rad']];
const project=blankProject();project.title='Unsupported scenes remain editable';project.startScene='legacy';
project.scenes=definitions.map(([id,name,source])=>{
 const scene=newScene(id,name,source);scene.thumbnailMode='custom';scene.thumbnail='photo.png';scene.transform={position:[.3,0,-.2],rotation:[0,.2,0],scale:1.15};scene.colliderTransform={position:[.2,0,.1],rotation:[0,.1,0],scale:1.1};scene.speedMultiplier=1.4;scene.vrScale=1.2;scene.walkHeight=1.8;scene.walkStepHeight=.3;scene.bubbles={occlusion:false,fadeDistance:45,sizeMultiplier:.9};scene.background={type:'solid',color:'#223344'};
 scene.viewpoints[0]={...scene.viewpoints[0],thumbnail,description:'Original starting caption',extendedDescription:{enabled:true,richText:plainTextDocument('The original viewpoint history.'),links:[{id:'detail',label:'View the detailed scene',sceneId:'valid',viewpointId:'start'}]}};
 scene.viewpoints.push({id:'private',name:'Private entry',listed:false,type:'photosphere',position:[.1,1.8,3.2],rotation:[0,.1,0],thumbnail,description:'An unlisted entry point'});
 scene.hotspots=[{id:'info',kind:'page',label:'History',position:[0,1.7,0],target:'history',size:.3},{id:'scene-link',kind:'scene',label:'',position:[.4,1.7,0],target:'valid',viewpoint:'private'}];
 if(['legacy','second-rad','unknown','empty','walk-only','blocked-override'].includes(id)){
  scene.modes=['jumps','fly','explore'];scene.collider=`unused-${id}-floor.glb`;scene.background={type:'splat',source:`unused-${id}-background/lod-meta.json`,transform:{position:[0,0,0],rotation:[0,0,0],scale:1}};scene.audio={source:`unused-${id}-audio.wav`,loop:true,volume:.4};
 }
 if(id==='walk-only'){scene.modes=['explore'];scene.walkHeight=2.2;}
 return scene;
});
project.pages=[{id:'history',title:'History',html:'',blocks:[{type:'text',text:'Retained bubble content.',url:'',richText:plainTextDocument('Retained bubble content.')},{type:'image',text:'Original photograph',url:'photo.png'}]}];
project.branding={name:'Independent author',favicon:'photo.png',showStudioCredit:false};
const normalized=ProjectSchema.parse(project),hosting=HostingSchema.parse({assetBaseUrl:'./',collisionBaseUrl:'./',sceneUrls:{'blocked-override':'blocked-override.rad','allowed-override':'valid/lod-meta.json',unused:'https://cdn.example/untouched.rad'}});
await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(normalized));await fs.writeFile(path.join(folder,'config/hosting.json'),JSON.stringify(hosting));await fs.writeFile(path.join(folder,'photo.png'),pixel);
for(const name of ['legacy.rad','second.rad','walk-only.rad','override-source.rad','blocked-override.rad'])await fs.writeFile(path.join(folder,name),radFixture().rad);
await fs.writeFile(path.join(folder,'unsupported.ply'),'This retained source is intentionally unsupported by Radix.');
for(const scene of normalized.scenes.filter(scene=>scene.collider)){await fs.writeFile(path.join(folder,scene.collider),floorGlb());await writeSog(path.dirname(path.join(folder,scene.background.source)));await fs.writeFile(path.join(folder,scene.audio.source),wav);}
const result={root,editor:explicit||'development',checks:[],requests:[],failedResponses:[],pageErrors:[],console:[],performanceNotices:[],processEvents:[]};
const checked=text=>{result.checks.push(text);console.log(text);};
const allowedNotice=text=>text.startsWith('%cElectron Security Warning (Insecure Content-Security-Policy)')||text.startsWith("THREE.TSL: Return statement used in an inline 'Fn()'. Define a layout struct to allow return values.");
const performanceNotice=text=>/^\[\.WebGL-0x[0-9a-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/i.test(text);
// Track actual deleted handles without hiding WebGL errors or changing any
// rendering state. The earlier Radix regression was a stale texture binding.
const textureAudit=()=>{const deleted=new WeakSet(),p=WebGL2RenderingContext.prototype,remove=p.deleteTexture,bind=p.bindTexture;window.glAudit=[];p.deleteTexture=function(texture){if(texture)deleted.add(texture);return remove.call(this,texture);};p.bindTexture=function(target,texture){if(texture&&deleted.has(texture))window.glAudit.push(new Error('Deleted texture rebound').stack);return bind.call(this,target,texture);};};
let app,page;
try{
 const launchArgs=['--disable-background-timer-throttling','--disable-renderer-backgrounding','--enable-webgl','--enable-unsafe-swiftshader'];
 app=await electron.launch({...(explicit?{executablePath:explicit,args:launchArgs}:{args:[path.resolve('.'),...launchArgs]}),env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
 app.on('close',()=>result.processEvents.push('app closed'));page=await app.firstWindow();page.setDefaultTimeout(30000);
 page.on('crash',()=>result.processEvents.push('renderer crashed'));page.on('close',()=>result.processEvents.push('page closed'));page.on('pageerror',error=>result.pageErrors.push(error.message));
 page.on('request',request=>result.requests.push(request.url()));page.on('response',response=>{if(response.status()>=400)result.failedResponses.push({url:response.url(),status:response.status()});});
 page.on('console',message=>{if(['error','warning'].includes(message.type())){if(performanceNotice(message.text()))result.performanceNotices.push(message.text());else result.console.push({type:message.type(),text:message.text()});}});
 await page.waitForSelector('.studio');await page.addInitScript(textureAudit);await page.goto(page.url()+'?diagnostics=1&radixBackend=webgpu-gl');
 await app.evaluate(({dialog})=>{globalThis.__invalidScenesDialogs={next:null,calls:[]};dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});dialog.showOpenDialog=async(_win,options)=>{const state=globalThis.__invalidScenesDialogs;if(!state.next)throw Error('Unexpected chooser '+options?.title);const filePaths=state.next;state.next=null;state.calls.push({title:options?.title,filePaths});return {filePaths,canceled:!filePaths.length};};});
 const choose=files=>app.evaluate(({},files)=>{globalThis.__invalidScenesDialogs.next=files;},files);
 const state=()=>page.evaluate(()=>structuredClone(window.__studioCloseState()));
 const menu=async(group,item)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();};
 const closeSettings=async()=>{const button=page.getByRole('button',{name:'Close settings',exact:true});if(await button.count())await button.click();};
 const inspector=name=>page.locator('.inspector-tabs').getByRole('button',{name,exact:true}).click();
 const selectScene=async id=>{await closeSettings();await page.getByRole('tab',{name:'Scenes',exact:true}).click();const name=(await state()).project.scenes.find(scene=>scene.id===id).name;await page.locator('.object-row strong').getByText(name,{exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.tourRuntime?.active?.id)).toBe(id);};
 const unavailable=()=>page.locator('.scene-unavailable[aria-label="Scene rendering unavailable"]');
 const waitUnavailable=async()=>{await expect(unavailable()).toBeVisible();await expect(unavailable().getByRole('button',{name:'Replace scene splat',exact:true})).toBeEnabled();await expect.poll(()=>page.evaluate(()=>!!window.tourRuntime?.ready)).toBe(false);await expect(page.locator('.scene-loading')).toHaveCount(0);const issue=await page.evaluate(()=>{const r=window.tourRuntime;return {foreground:!!r.mesh,background:!!r.backgroundLayer.mesh,panorama:!!r.backgroundLayer.texture,collider:!!r.collider,physics:!!r.world,audio:!!r.audio.scene||!!r.audio.viewpoint};});assert.deepEqual(issue,{foreground:false,background:false,panorama:false,collider:false,physics:false,audio:false},'Unavailable source must leave no active scene rendering, physics or media resources');};
 const waitRendered=async id=>{await page.waitForFunction(id=>{const r=window.tourRuntime;return r?.active?.id===id&&r.ready&&!r.loading&&r.getRenderStats().shown>0;},id,{timeout:90000});await expect(unavailable()).toHaveCount(0);};
 const assertCameraDisabled=async()=>{for(const name of ['Capture viewpoint','Place bubble on scene','Add bubble ahead'])await expect(page.locator('.canvas-tools').getByRole('button',{name,exact:true})).toBeDisabled();};
 const assertIdentity=()=>page.evaluate(()=>{const saved=window.__invalidSceneIdentity,r=window.tourRuntime;return {runtime:r===saved.runtime,renderer:r.renderer===saved.renderer,canvas:r.renderer.domElement===saved.canvas,canvasCount:document.querySelectorAll('.stage canvas').length,frames:saved.frames};});
 const save=async()=>{await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(async()=>(await state()).dirty).toBe(false);const saved=await state();assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8')),saved.project);assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'config/hosting.json'),'utf8')),saved.hosting);return saved;};
 const noSceneIO=(from,id)=>{const scene=normalized.scenes.find(scene=>scene.id===id),names=[scene.source.split(/[?#]/)[0],scene.collider,scene.background?.source,scene.audio?.source,hosting.sceneUrls[id]].filter(Boolean);const requests=result.requests.slice(from).filter(url=>names.some(name=>{try{return decodeURIComponent(new URL(url).pathname).endsWith('/'+name);}catch{return false;}}));assert.deepEqual(requests,[],id+' must not request unsupported splats, backgrounds, media or collision');};

 await choose([folder]);await menu('File','Open project');await expect.poll(async()=>(await state()).project.scenes[0]?.id).toBe('legacy');await waitUnavailable();
 assert.deepEqual((await state()).project,normalized);assert.deepEqual((await state()).hosting,hosting);await assertCameraDisabled();
 await page.evaluate(()=>{const runtime=window.tourRuntime,renderer=runtime.renderer,original=renderer.render;window.__invalidSceneIdentity={runtime,renderer,canvas:renderer.domElement,frames:0};renderer.render=function(...args){window.__invalidSceneIdentity.frames++;return original.apply(this,args);};});
 const first=await assertIdentity();await page.waitForTimeout(3100);const alive=await assertIdentity();assert.ok(alive.frames>first.frames+1,'Unsupported scene keeps the actual renderer loop alive for three seconds');assert.deepEqual(result.processEvents,[]);
 noSceneIO(0,'legacy');checked('A retained RAD project opens with an editable unavailable-scene state, no unsupported source/background/collider/media requests and a live native renderer.');

 for(const id of ['second-rad','unknown','empty','blocked-override']){const before=result.requests.length;await selectScene(id);await waitUnavailable();await assertCameraDisabled();await page.waitForTimeout(120);noSceneIO(before,id);}
 await selectScene('valid');await waitRendered('valid');for(const name of ['Capture viewpoint','Place bubble on scene','Add bubble ahead'])await expect(page.locator('.canvas-tools').getByRole('button',{name,exact:true})).toBeEnabled();
 const cameraPose=()=>page.evaluate(()=>{const r=window.tourRuntime,pose=object=>({position:object.position.toArray(),quaternion:object.quaternion.toArray(),scale:object.scale.toArray()});return {camera:pose(r.camera),rig:pose(r.rig)};});
 const beforeWalkOnly=await cameraPose(),walkRequests=result.requests.length;await selectScene('walk-only');await waitUnavailable();await page.waitForTimeout(150);noSceneIO(walkRequests,'walk-only');assert.deepEqual(await cameraPose(),beforeWalkOnly,'An unavailable Walk-only scene cannot move the camera or rig to its different walking height');await assertCameraDisabled();
 const allowedBefore=result.requests.length;await selectScene('allowed-override');await waitRendered('allowed-override');assert.ok(!result.requests.slice(allowedBefore).some(url=>url.includes('override-source.rad')),'A supported hosting override replaces the retained RAD reference before loading');
 const returnedFrom=result.requests.length;await selectScene('legacy');await waitUnavailable();noSceneIO(returnedFrom,'legacy');const identity=await assertIdentity();assert.deepEqual({...identity,frames:0},{runtime:true,renderer:true,canvas:true,canvasCount:1,frames:0});assert.ok(identity.frames>alive.frames);
 checked('RAD, unknown, empty and RAD-overridden scenes stay editable; Walk-only height changes cannot move the camera; supported SOGS and SOGS hosting overrides render with the same renderer, runtime and canvas.');

 await inspector('Scene');await expect(page.getByLabel('Name',{exact:true})).toBeEnabled();await page.getByLabel('Name',{exact:true}).fill('Legacy RAD — editing retained');
 const transform=page.locator('details').filter({has:page.locator('summary').filter({hasText:/^Splat transform$/})});await transform.locator('summary').click();await expect(transform.getByLabel('Uniform scale',{exact:true})).toBeEnabled();await transform.getByLabel('Uniform scale',{exact:true}).fill('1.25');
 await inspector('View');await expect(page.getByLabel('Description · shown below the view',{exact:true})).toBeEnabled();await page.getByLabel('Description · shown below the view',{exact:true}).fill('Edited while the source cannot render.');
 await expect(page.getByRole('textbox',{name:'Viewpoint extended description',exact:true})).toBeEditable();
 const authored=await state();await page.getByTitle('Preview visitor experience',{exact:true}).click();await waitUnavailable();await expect(unavailable().getByRole('button',{name:'Replace scene splat',exact:true})).toBeEnabled();await page.getByTitle('Preview visitor experience',{exact:true}).click();assert.deepEqual((await state()).project,authored.project);assert.deepEqual((await state()).hosting,authored.hosting);
 const saved=await save();await choose([folder]);await menu('File','Open project');await waitUnavailable();assert.deepEqual((await state()).project,saved.project);assert.deepEqual((await state()).hosting,saved.hosting);await page.screenshot({path:path.join(root,'unsupported-editable.png')});
 checked('Scene numeric controls and viewpoint story authoring remain available; Preview, Save and reopen preserve all metadata, links, collider alignment and hosting without rendering an invalid source.');

 const beforeReplacement=await state();await unavailable().getByRole('button',{name:'Replace scene splat',exact:true}).click();await choose([path.join(replacementFolder,'lod-meta.json')]);await page.getByRole('button',{name:'Choose SOGS & replace',exact:true}).click();
 await expect.poll(async()=>{const queue=await page.evaluate(()=>window.studio.getImportQueue()),job=queue.jobs.find(job=>job.replaceSceneId==='legacy');if(job?.state==='failed')throw Error(job.error);return job?.state==='completed'&&job.acknowledged&&!queue.activeId;},{timeout:90000,intervals:[100,250]}).toBe(true);
 await closeSettings();await waitRendered('legacy');const afterReplacement=await state(),replacement=afterReplacement.project.scenes.find(scene=>scene.id==='legacy'),original=beforeReplacement.project.scenes.find(scene=>scene.id==='legacy');assert.notEqual(replacement.source,original.source);assert.deepEqual(replacement,{...original,source:replacement.source});assert.deepEqual(afterReplacement.project.pages,beforeReplacement.project.pages);assert.deepEqual(afterReplacement.hosting,{...beforeReplacement.hosting,sceneUrls:{...beforeReplacement.hosting.sceneUrls,legacy:replacement.source}});
 await inspector('Scene');await page.screenshot({path:path.join(root,'replaced-rendering.png')});checked('The unavailable-scene action queues normal SOGS replacement and preserves all annotations, authored views, transforms and hosting while restoring rendering.');

 await selectScene('missing');await waitUnavailable();await expect(unavailable().getByRole('button',{name:'Retry scene',exact:true})).toBeEnabled();assert.ok(result.failedResponses.some(response=>response.status===404&&response.url.includes('/missing/lod-meta.json')));await writeSog(path.join(folder,'missing'));await unavailable().getByRole('button',{name:'Retry scene',exact:true}).click();await waitRendered('missing');checked('A genuinely missing supported SOGS source offers Retry and recovers in the existing runtime once its files become available.');

 await selectScene('blocked-override');await waitUnavailable();await menu('Tools','Hosting & delivery');await page.getByLabel('SOGS with RAD override · URL override',{exact:true}).fill('valid/lod-meta.json');await closeSettings();await waitRendered('blocked-override');
 const finalSaved=await save();await choose([folder]);await menu('File','Open project');await waitRendered('legacy');assert.deepEqual((await state()).project,finalSaved.project);assert.deepEqual((await state()).hosting,finalSaved.hosting);await selectScene('second-rad');await waitUnavailable();
 const finalIdentity=await assertIdentity();assert.deepEqual({...finalIdentity,frames:0},{runtime:true,renderer:true,canvas:true,canvasCount:1,frames:0});assert.deepEqual(result.processEvents,[]);assert.deepEqual(await page.evaluate(()=>window.glAudit),[]);assert.deepEqual(result.pageErrors,[]);
 // The deliberately missing SOG source is the sole expected HTTP failure.
 assert.ok(result.failedResponses.every(response=>response.status===404&&response.url.includes('/missing/lod-meta.json')),JSON.stringify(result.failedResponses));
 const unexpected=result.console.filter(message=>!allowedNotice(message.text)&&!/^Failed to load resource: the server responded with a status of 404 \(Not Found\)$/.test(message.text));assert.deepEqual(unexpected,[]);
 for(const file of ['legacy.rad','second.rad','walk-only.rad','override-source.rad','blocked-override.rad'])assert.deepEqual(await fs.readFile(path.join(folder,file)),radFixture().rad);
 result.finalIdentity=finalIdentity;checked('Editing a blocking hosting override restores its SOGS scene; subsequent Save/reopen/unsupported selection retain all data and process/render-loop identity without graphics errors.');result.pass=true;
}catch(error){result.pass=false;result.error=error?.stack||String(error);if(page&&!page.isClosed()){await page.screenshot({path:path.join(root,'failure.png')}).catch(()=>{});result.failure=await page.evaluate(()=>({text:document.body.innerText,scene:window.tourRuntime?.active?.id,ready:window.tourRuntime?.ready})).catch(()=>null);}throw error;}
finally{await fs.writeFile(path.join(root,'result.json'),JSON.stringify(result,null,2));if(app){await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await app.close().catch(()=>{});}}
console.log(JSON.stringify({root,pass:result.pass,checks:result.checks}));
