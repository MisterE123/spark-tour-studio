import {_electron as electron,chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {blankProject,newScene,ProjectSchema} from '../shared/project.mjs';
import {defaultPerformance} from '../shared/performance.mjs';
import {radFixture,plyFixture,floorGlb} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{radMeta}=require('../desktop/export.cjs');
const root=path.resolve('test-output','advanced-import-'+Date.now()),folder=path.join(root,'project'),out=path.join(root,'export');
await fs.mkdir(path.join(folder,'config'),{recursive:true});await fs.mkdir(out);
const x=1024.125,backgroundX=1024.625;
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2z2QAAAAASUVORK5CYII=','base64');
const thumbnail='data:image/png;base64,'+pixel.toString('base64');
async function writeRad(name,center){
 const fixture=radFixture(name+'.radc');
 // The fixture stores f32 source positions. Packed streaming rounds these to
 // float16; extended streaming must retain the actual source coordinate.
 const payload=8+Math.ceil(fixture.chunk.readUInt32LE(4)/8)*8+8;
 fixture.chunk.writeFloatLE(center,payload);
 await fs.writeFile(path.join(folder,name+'.rad'),fixture.rad);
 await fs.writeFile(path.join(folder,name+'.radc'),fixture.chunk);
 return fixture;
}
const original=await writeRad('original',x);await writeRad('background',backgroundX);
const relinkedX=x+.375;await writeRad('relinked',relinkedX);
await fs.writeFile(path.join(folder,'floor.glb'),floorGlb());await fs.writeFile(path.join(folder,'image.png'),pixel);
const wav=Buffer.alloc(46);wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);
await fs.writeFile(path.join(folder,'audio.wav'),wav);
const p=blankProject(),a=newScene('authored','Authored scene','original.rad'),b=newScene('other','Other scene','original.rad');
a.transform={position:[-x*1.1,.2,-.1],rotation:[0,0,0],scale:1.1};a.collider='floor.glb';a.colliderTransform.position=[x,0,0];a.modes.push('explore');a.walkHeight=1.6;
a.background={type:'splat',source:'background.rad',transform:{position:[-backgroundX,0,-2],rotation:[0,0,0],scale:1}};
a.audio={source:'audio.wav',loop:true,volume:.25};a.thumbnail='image.png';a.thumbnailMode='custom';
a.viewpoints[0]={...a.viewpoints[0],type:'photosphere',position:[x,1.7,3],description:'A saved starting description',thumbnail,listed:true};
a.viewpoints.push({id:'private',name:'Private orbit',type:'orbit',position:[x+.5,1.7,3],rotation:[0,0,0],orbit:{center:[x+.5,1.7,0],radius:3,azimuthBounds:[-45,45],elevationBounds:[-15,35]},listed:false,description:'A private entry',audio:{source:'audio.wav',loop:false,volume:.4},thumbnail});
a.hotspots=[{id:'info',kind:'page',label:'History',target:'content-info',position:[x-.5,1.7,0],size:.3,createdAt:1234},{id:'view-link',kind:'viewpoint',label:'Old view label',target:'private',position:[x,1.7,0]},{id:'scene-link',kind:'scene',label:'Old scene label',target:'other',viewpoint:'start',position:[x+.5,1.7,0]}];
b.transform=structuredClone(a.transform);b.viewpoints[0]={...b.viewpoints[0],position:[x,1.7,3],thumbnail};
p.title='Precision and scene replacement';p.scenes=[a,b];p.startScene=a.id;p.bubbles={occlusion:false,translucency:.6,size:1,distanceFade:0};p.performance=defaultPerformance();
p.pages=[{id:'content-info',title:'History',html:'',blocks:[{type:'text',text:'Existing authored content',url:''},{type:'image',text:'An existing caption',url:'image.png'}]}];
await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(ProjectSchema.parse(p)));await fs.writeFile(path.join(folder,'config/hosting.json'),JSON.stringify({assetBaseUrl:'./',sceneUrls:{authored:'original.rad'}}));
const source=path.join(root,'Updated scan.ply'),ply=plyFixture();
const plyOffset=ply.indexOf(Buffer.from('end_header\n'))+'end_header\n'.length;
for(let i=0;i<128;i++)ply.writeFloatLE(ply.readFloatLE(plyOffset+i*14*4)+x,plyOffset+i*14*4);
await fs.writeFile(source,ply);

const launchArgs=['--disable-background-timer-throttling','--disable-renderer-backgrounding'];
const app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),args:launchArgs}:{args:['.',...launchArgs]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
let replacementSource;
async function waitStream(page,extended){
 await page.evaluate(()=>window.tourRuntime.performanceTransition);
 await page.waitForFunction(expected=>{
  const r=window.tourRuntime,paged=r?.mesh?.paged,bg=r?.backgroundLayer?.mesh?.paged;
  const loaded=splats=>{const pager=splats?.pager,entry=pager?.getSplatsChunk(splats,0);return pager?.extSplats===expected&&entry&&pager.packedTexture.value.image.data[entry.page*pager.pageSplats*4]!==0;};
  return r?.ready&&r.spark.pagedExtSplats===expected&&r.spark.display.numSplats>0&&loaded(paged)&&loaded(bg);
 },extended,{timeout:60000,polling:100});
}
async function poolPositions(page){return page.evaluate(()=>{
 const half=h=>{const sign=(h&32768)?-1:1,exponent=(h>>>10)&31,fraction=h&1023;return exponent===0?sign*2**-14*fraction/1024:exponent===31?sign*(fraction?NaN:Infinity):sign*2**(exponent-15)*(1+fraction/1024);};
 const read=mesh=>{const splats=mesh.paged,pager=splats.pager,entry=pager.getSplatsChunk(splats,0),words=pager.packedTexture.value.image.data,offset=entry.page*pager.pageSplats*4;return pager.extSplats?new Float32Array(new Uint32Array([words[offset]]).buffer)[0]:half(words[offset+1]&65535);};
 const r=window.tourRuntime;return {foreground:read(r.mesh),background:read(r.backgroundLayer.mesh)};
});}
try{
 const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 const choose=async(files,canceled=false)=>app.evaluate(({dialog},{files,canceled})=>{dialog.showOpenDialog=async(_window,options)=>{globalThis.lastAdvancedPicker=options;return {filePaths:files,canceled};};},{files,canceled});
 const menu=async(group,label)=>{await page.getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 await choose([folder]);await menu('File','Open project');await waitStream(page,false);
 const packed=await poolPositions(page);assert.notEqual(packed.foreground,x);assert.notEqual(packed.background,backgroundX);
 await page.evaluate(()=>{const r=window.tourRuntime;r.setMode('fly');r.rig.position.x+=.15;r.camera.rotation.x=.12;window.__advancedContinuity={renderer:r.renderer,canvas:r.renderer.domElement,camera:r.camera,rig:r.rig,xr:r.renderer.xr,session:r.renderer.xr.getSession(),spark:r.spark,position:r.rig.position.toArray(),quaternion:r.rig.quaternion.toArray(),cameraPosition:r.camera.position.toArray(),cameraQuaternion:r.camera.quaternion.toArray(),mode:r.mode};});
 await menu('Tools','Performance presets');const precision=page.getByLabel('Extended splat precision (ExtSplats)',{exact:true});await precision.check();await waitStream(page,true);
 const extended=await poolPositions(page);assert.equal(extended.foreground,x);assert.equal(extended.background,backgroundX);
 await page.evaluate(()=>{const r=window.tourRuntime,b=window.__advancedContinuity,same=(ok,label)=>{if(!ok)throw Error('Precision reload changed '+label);};same(r.renderer===b.renderer,'renderer');same(r.renderer.domElement===b.canvas,'canvas');same(r.camera===b.camera,'camera');same(r.rig===b.rig,'rig');same(r.renderer.xr===b.xr&&r.renderer.xr.getSession()===b.session,'XR manager/session identity');same(r.spark!==b.spark,'streaming resource owner');same(r.mode===b.mode,'movement mode');for(const [now,before,label] of [[r.rig.position.toArray(),b.position,'rig position'],[r.rig.quaternion.toArray(),b.quaternion,'rig rotation'],[r.camera.position.toArray(),b.cameraPosition,'camera position'],[r.camera.quaternion.toArray(),b.cameraQuaternion,'camera rotation']])same(now.every((n,i)=>Math.abs(n-before[i])<1e-8),label);});
 // Both formats must be recreated safely, rather than merely changing a flag.
 await precision.uncheck();await waitStream(page,false);assert.notEqual((await poolPositions(page)).foreground,x);await precision.check();await waitStream(page,true);
 await page.getByRole('button',{name:'Save preset',exact:true}).click();await page.getByRole('button',{name:'Close settings',exact:true}).click();
 console.log('PASS: live foreground/background ExtSplats preserves f32 positions, renderer, canvas, camera, rig, mode and XR manager/session identity.');

 // Cancelling the native picker cannot modify the scene or enqueue a replacement.
 const cancelledBefore=await page.evaluate(()=>({project:structuredClone(window.tourRuntime.project),hosting:structuredClone(window.tourRuntime.hosting)}));const jobsBefore=(await page.evaluate(()=>window.studio.getImportQueue())).jobs.length;
 await menu('Tools','Re-import scene PLY');await choose([],true);await page.getByRole('button',{name:'Choose PLY & queue',exact:true}).click();await page.getByRole('dialog',{name:'Import queue',exact:true}).waitFor();
 assert.equal((await page.evaluate(()=>window.studio.getImportQueue())).jobs.length,jobsBefore);assert.deepEqual(await page.evaluate(()=>({project:structuredClone(window.tourRuntime.project),hosting:structuredClone(window.tourRuntime.hosting)})),cancelledBefore);await page.getByRole('button',{name:'Close settings',exact:true}).click();

 // Pause first so the queued state and edits made during conversion are observable.
 await page.evaluate(()=>window.studio.importQueueAction('pause'));await menu('Tools','Re-import scene PLY');await page.getByLabel('LoD method',{exact:true}).selectOption('quick');await page.getByLabel('Maximum SH degree',{exact:true}).selectOption('1');await choose([source]);await page.getByRole('button',{name:'Choose PLY & queue',exact:true}).click();
 // Poll native IPC from Node: browser waitForFunction treats an async predicate's
 // Promise as a truthy value before the queue snapshot has resolved.
 await expect.poll(()=>page.evaluate(async()=>{const q=await window.studio.getImportQueue();return q.paused&&q.jobs.some(j=>j.replaceSceneId==='authored'&&j.state==='queued');}),{timeout:30000,intervals:[100]}).toBe(true);
 const queued=(await page.evaluate(()=>window.studio.getImportQueue())).jobs.at(-1);assert.equal(queued.replaceSceneId,'authored');assert.equal(queued.expectedSource,'original.rad');assert.equal(queued.kind,'ply');assert.deepEqual(queued.options,{method:'quick',maxSh:1});assert.deepEqual((await app.evaluate(()=>globalThis.lastAdvancedPicker)).properties,['openFile']);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row').filter({hasText:'History'}).click();await page.getByLabel('Label',{exact:true}).fill('History edited while queued');
 await page.getByRole('tab',{name:'Scenes',exact:true}).click();await page.locator('.object-row strong').getByText('Authored scene',{exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Authored scene edited while queued');
 await page.getByRole('tab',{name:'Views',exact:true}).click();await page.locator('.object-row strong').getByText('Private orbit',{exact:true}).click();await page.getByLabel('Description · shown below the view',{exact:true}).fill('Description edited while queued');
 const authoredBefore=await page.evaluate(()=>({scene:structuredClone(window.tourRuntime.project.scenes.find(s=>s.id==='authored')),pages:structuredClone(window.tourRuntime.project.pages)}));
 await menu('Tools','Import queue');await page.getByRole('button',{name:'Resume queue',exact:true}).click();
 await expect.poll(()=>page.evaluate(async id=>{const q=await window.studio.getImportQueue(),j=q.jobs.find(j=>j.id===id);if(j?.state==='failed')throw Error(j.error);return !q.activeId&&j?.state==='completed'&&j.acknowledged&&window.tourRuntime.active?.source!==j.expectedSource&&window.tourRuntime.ready;},queued.id),{timeout:120000,intervals:[200]}).toBe(true);
 const completed=(await page.evaluate(()=>window.studio.getImportQueue())).jobs.find(j=>j.id===queued.id);assert.equal(completed.state,'completed');assert.equal(completed.acknowledged,true);
 const after=await page.evaluate(()=>({scene:structuredClone(window.tourRuntime.project.scenes.find(s=>s.id==='authored')),pages:structuredClone(window.tourRuntime.project.pages),count:window.tourRuntime.project.scenes.length,hosting:structuredClone(window.tourRuntime.hosting)}));replacementSource=after.scene.source;assert.match(replacementSource,/^assets\/converted\/[^/]+\/source-lod\.rad$/);assert.deepEqual(after.scene,{...authoredBefore.scene,source:replacementSource});assert.deepEqual(after.pages,authoredBefore.pages);assert.equal(after.count,2);assert.equal(after.hosting.sceneUrls.authored,replacementSource);
 const meta=await radMeta(path.join(folder,replacementSource));assert.ok(meta.lodTree&&meta.count>=128&&meta.chunks.length);assert.ok(meta.maxSh<=1);for(const chunk of meta.chunks){assert.ok(chunk.filename);assert.equal((await fs.stat(path.join(folder,path.dirname(replacementSource),chunk.filename))).size,chunk.bytes);}
 assert.deepEqual(await fs.readFile(source),ply);assert.deepEqual(await fs.readFile(path.join(folder,'original.radc')),original.chunk);
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await waitStream(page,true);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime.ready&&window.tourRuntime.active.source==='original.rad'&&window.tourRuntime.hosting.sceneUrls.authored==='original.rad');assert.deepEqual(await page.evaluate(()=>structuredClone(window.tourRuntime.project.scenes.find(s=>s.id==='authored'))),authoredBefore.scene);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(ref=>window.tourRuntime.ready&&window.tourRuntime.active.source===ref&&window.tourRuntime.hosting.sceneUrls.authored===ref,replacementSource);await waitStream(page,true);
 // A later explicit source edit must replace the conversion's hosting override,
 // or the inspector would show one RAD while Spark kept streaming the old one.
 await page.getByRole('tab',{name:'Scenes',exact:true}).click();await page.locator('.object-row strong').getByText(after.scene.name,{exact:true}).click();
 if(!await page.getByLabel('RAD source / URL',{exact:true}).isVisible())await page.getByText('Source asset',{exact:true}).click();
 await choose([path.join(folder,'relinked.rad')]);await page.getByRole('button',{name:'Relink RAD',exact:true}).click();
 await page.waitForFunction(previous=>{const r=window.tourRuntime;return r.ready&&r.active.source!==previous&&r.hosting.sceneUrls.authored===r.active.source;},replacementSource);
 await waitStream(page,true);assert.equal((await poolPositions(page)).foreground,relinkedX);
 const relinkedSource=await page.evaluate(()=>window.tourRuntime.active.source);assert.deepEqual(await page.evaluate(()=>structuredClone(window.tourRuntime.active)),{...after.scene,source:relinkedSource});
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(ref=>window.tourRuntime.ready&&window.tourRuntime.active.source===ref&&window.tourRuntime.hosting.sceneUrls.authored===ref,replacementSource);await waitStream(page,true);
 assert.deepEqual(await page.evaluate(()=>structuredClone(window.tourRuntime.active)),after.scene);
 await page.getByLabel('RAD source / URL',{exact:true}).fill('original.rad');await page.waitForFunction(()=>window.tourRuntime.ready&&window.tourRuntime.active.source==='original.rad'&&window.tourRuntime.hosting.sceneUrls.authored==='original.rad');await waitStream(page,true);assert.equal((await poolPositions(page)).foreground,x);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(ref=>window.tourRuntime.ready&&window.tourRuntime.active.source===ref&&window.tourRuntime.hosting.sceneUrls.authored===ref,replacementSource);await waitStream(page,true);assert.deepEqual(await page.evaluate(()=>structuredClone(window.tourRuntime.active)),after.scene);
 console.log('PASS: subsequent RAD relink and typed source edits change actual streamed data and hosting overrides; undo restores the conversion and annotations.');
 await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Project saved.',{exact:true}).waitFor();
 let saved=JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8'));assert.equal(saved.performance.presets.find(v=>v.id===saved.performance.defaultPresetId).settings.pagedExtSplats,true);assert.deepEqual(saved.scenes.find(s=>s.id==='authored'),after.scene);
 await page.evaluate(()=>{window.__advancedReopen=window.tourRuntime.active;});await choose([folder]);await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime.active!==window.__advancedReopen&&window.tourRuntime.ready);await waitStream(page,true);assert.equal(await page.evaluate(()=>window.tourRuntime.active.source),replacementSource);
 await page.screenshot({path:path.join(root,'editor.png')});await choose([out]);await page.getByRole('button',{name:'Export tour',exact:true}).click();await page.getByRole('button',{name:'Choose folder & export',exact:true}).click();await page.getByText(/^Export complete:/).waitFor({timeout:120000});
 saved=JSON.parse(await fs.readFile(path.join(out,'config/tour.json'),'utf8'));assert.equal(saved.performance.presets.find(v=>v.id===saved.performance.defaultPresetId).settings.pagedExtSplats,true);assert.deepEqual(saved.scenes.find(s=>s.id==='authored'),after.scene);assert.deepEqual(saved.pages,authoredBefore.pages);await fs.access(path.join(out,replacementSource));for(const chunk of meta.chunks)await fs.access(path.join(out,path.dirname(replacementSource),chunk.filename));assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: native cancelled picker, queued replacement metadata, actual PLY conversion, edits while queued, annotations/media/settings preservation, save/reopen and portable export: '+root);
}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(window=>window.destroy())).catch(()=>{});await app.close();}

const {startServer}=require('../desktop/server.cjs'),{server,url}=await startServer({root:out});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const external=[];await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(url)||u.startsWith('blob:')||u.startsWith('data:'))return route.continue();external.push(u);return route.abort();});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();await waitStream(page,true);assert.equal(await page.evaluate(()=>window.tourRuntime.active.source),replacementSource);assert.equal((await poolPositions(page)).background,backgroundX);assert.deepEqual(external,[]);await page.screenshot({path:path.join(root,'viewer.png')});
 console.log('PASS: portable viewer uses extended foreground/background streaming with external networking blocked.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
