import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
import {radFixture} from '../tests/fixtures.mjs';

// Native chooser cancellation must leave the current authoring session intact.
// Everything, including the externally referenced source, is a disposable fixture.
const root=path.resolve('test-output','editor-save-cancel-'+Date.now()),folder=path.join(root,'project'),copy=path.join(root,'copy'),source=path.join(root,'external source');
for(const dir of [path.join(folder,'config'),copy,source])await fs.mkdir(dir,{recursive:true});
const fixture=radFixture('scene.radc');await fs.writeFile(path.join(source,'scene.rad'),fixture.rad);await fs.writeFile(path.join(source,'scene.radc'),fixture.chunk);
const thumbnail='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD+8AAAAASUVORK5CYII=';
const project=blankProject(),sources={'imports/scene':{dir:source,kind:'rad'}},hosting={assetBaseUrl:'./',sceneUrls:{}};
project.scenes=['a','b'].map((id,index)=>{const scene=newScene(id,'Scene '+id,'imports/scene/scene.rad');scene.modes=['fly'];scene.viewpoints[0].position=[index*8,1.7,index*6+3];scene.viewpoints[0].thumbnail=thumbnail;scene.hotspots=[{id:'story-'+id,label:'Story '+id,position:[0,1.7,0],kind:'page',target:'story-'+id}];return scene;});
project.startScene='a';project.pages=['a','b'].map(id=>({id:'story-'+id,title:'Story '+id,html:'',blocks:[{type:'text',text:'Unchanged history '+id,url:''}]}));
for(const [name,value] of [['config/tour.json',project],['config/hosting.json',hosting],['.sources.json',sources]])await fs.writeFile(path.join(folder,name),JSON.stringify(value));
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'],app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
let closed=false;app.on('close',()=>{closed=true;});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 await app.evaluate(({dialog},folder)=>{globalThis.__saveCancel={files:[folder],calls:[],prompts:[]};dialog.showOpenDialog=async(_window,options)=>{const state=globalThis.__saveCancel,files=state.files;state.files=[];state.calls.push(options.title);return {filePaths:files,canceled:!files.length};};dialog.showMessageBox=async(_window,options)=>{globalThis.__saveCancel.prompts.push(options);throw Error('Unexpected native prompt: '+options.message);};},folder);
 const menu=async(group,label)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const choose=files=>app.evaluate(({},files)=>globalThis.__saveCancel.files=files,files);
 const state=()=>page.evaluate(()=>structuredClone(window.__studioCloseState()));
 const rendered=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const label=()=>page.getByLabel('Label',{exact:true});
 const disk=async()=>Promise.all(['config/tour.json','config/hosting.json','.sources.json'].map(name=>fs.readFile(path.join(folder,name),'utf8')));
 const camera=()=>page.evaluate(()=>{const rt=window.tourRuntime;return {scene:rt.active.id,mode:rt.mode,position:rt.camera.position.toArray(),rotation:rt.camera.quaternion.toArray(),rig:rt.rig.position.toArray(),base:rt.base};});
 await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.ready);await page.locator('.object-row strong').getByText('Scene b',{exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.active?.id==='b');await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row strong').getByText('Story b',{exact:true}).click();await label().fill('Unsaved revised story');await expect(page.locator('.project-name span')).toHaveText('Unsaved changes');
 // Existing recovery must neither be removed nor spuriously reopened by Cancel.
 await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(path.join(folder,'autosave.json'),'utf8')).project.scenes[1].hotspots[0].label;}catch{return '';}}).toBe('Unsaved revised story');
 const before=await state(),beforeDisk=await disk(),recovery=await fs.readFile(path.join(folder,'autosave.json'),'utf8'),beforeCamera=await camera();
 await page.evaluate(()=>{const rt=window.tourRuntime;window.__saveCancelRuntime={rt,camera:rt.camera,rig:rt.rig,renderer:rt.renderer,canvas:rt.renderer.domElement};});
 await choose([]);await menu('File','Save as');await expect.poll(()=>state().then(s=>s.pending)).toBe(0);await rendered();
 assert.deepEqual(await state(),before,'Cancel keeps the exact dirty project and hosting snapshot');await expect(page.locator('.project-name span')).toHaveText('Unsaved changes');await expect(label()).toHaveValue('Unsaved revised story');await expect(page.locator('.inspector-tabs button.active')).toHaveText('Bubble');await expect(page.getByRole('heading',{name:'Recover unsaved changes?',exact:true})).toHaveCount(0);assert.deepEqual(await disk(),beforeDisk);assert.equal(await fs.readFile(path.join(folder,'autosave.json'),'utf8'),recovery);assert.deepEqual(await camera(),beforeCamera);
 assert.equal(await page.evaluate(()=>{const prior=window.__saveCancelRuntime,rt=window.tourRuntime;return prior.rt===rt&&prior.camera===rt.camera&&prior.rig===rt.rig&&prior.renderer===rt.renderer&&prior.canvas===rt.renderer.domElement;}),true);
 await page.locator('.workspace-toolbar').getByRole('button',{name:'Undo',exact:true}).click();await expect(label()).toHaveValue('Story b');await page.locator('.workspace-toolbar').getByRole('button',{name:'Redo',exact:true}).click();await expect(label()).toHaveValue('Unsaved revised story');
 console.log('PASS canceled dirty Save As preserves edits, Undo/Redo, scene/bubble selection, camera, source mappings, saved files and recovery without a recovery dialog.');
 await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.locator('.project-name span')).toHaveText('Saved project');await expect.poll(()=>state().then(s=>s.pending)).toBe(0);const saved=await state(),savedDisk=await disk(),savedCamera=await camera();assert.equal(JSON.parse(savedDisk[0]).scenes[1].hotspots[0].label,'Unsaved revised story');
 await choose([]);await menu('File','Save as');await expect.poll(()=>state().then(s=>s.pending)).toBe(0);await rendered();assert.deepEqual(await state(),saved,'Cancel also preserves an already-clean project');assert.deepEqual(await disk(),savedDisk);assert.deepEqual(await camera(),savedCamera);await expect(label()).toHaveValue('Unsaved revised story');await expect(page.locator('.workspace-toolbar').getByRole('button',{name:'Undo',exact:true})).toBeEnabled();await expect(page.getByRole('heading',{name:'Recover unsaved changes?',exact:true})).toHaveCount(0);
 await choose([]);assert.equal(await page.evaluate(()=>{const state=window.__studioCloseState();return window.studio.save(state.project,state.hosting,true);}),null,'The Save As bridge reports cancellation explicitly');
 await choose([copy]);await menu('File','Save as');await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(path.join(copy,'config/tour.json'),'utf8'));}catch{return null;}}).toEqual(saved.project);await expect(page.locator('.project-name span')).toHaveText('Saved project');assert.deepEqual(JSON.parse(await fs.readFile(path.join(copy,'.sources.json'),'utf8')),sources);assert.deepEqual(await disk(),savedDisk,'Successful Save As leaves the original saved project intact');
 const response=await page.evaluate(async()=>{const rt=window.tourRuntime;return {status:(await fetch(new URL('imports/scene/scene.rad',rt.base))).status};});assert.equal(response.status,200);assert.deepEqual(await fs.readFile(path.join(source,'scene.rad')),fixture.rad);
 console.log('PASS clean cancellation returns null; ordinary Save and successful Save As still persist edits and external mappings.');
 const prompts=await app.evaluate(()=>globalThis.__saveCancel.prompts);assert.deepEqual(prompts,[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({root,status:'passed',checks:['dirty cancellation preserves session and files','Undo and Redo survive cancellation','camera and renderer identity unchanged','existing recovery stays intact without dialog','clean cancellation and null bridge contract','ordinary Save and successful Save As','external source mapping and bytes intact']},null,2));
 const close=app.waitForEvent('close');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());await close;console.log(JSON.stringify({root,status:'passed'}));
}finally{if(!closed)await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
