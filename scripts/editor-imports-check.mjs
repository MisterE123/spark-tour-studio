import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
import {defaultPerformance,presetFile} from '../shared/performance.mjs';
import {plainTextDocument,richTextReferences,richTextPlainText} from '../shared/rich-text.mjs';
import {radFixture,floorGlb} from '../tests/fixtures.mjs';

// Delays below live only in this isolated native fixture. Real IPC handlers,
// file reads/copies, project writes and export are exercised without product
// timers or replacing the actual import result with a renderer-side mock.
const root=path.resolve('test-output','editor-imports-'+Date.now()),folder=path.join(root,'project'),copy=path.join(root,'saved-as'),output=path.join(root,'export');
await fs.mkdir(path.join(folder,'config'),{recursive:true});await fs.mkdir(copy);await fs.mkdir(output);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD+8AAAAASUVORK5CYII=','base64'),image=path.join(root,'Chosen.png'),dropImage=path.join(root,'Dropped.png'),failedImage=path.join(root,'Failed.png'),audio=path.join(root,'Sound.wav'),background=path.join(root,'Background.rad'),collider=path.join(root,'floor.glb'),presetPath=path.join(root,'preset.json'),badPreset=path.join(root,'bad-preset.json');
const rad=radFixture();
for(const file of [image,dropImage,failedImage])await fs.writeFile(file,png);
const wav=Buffer.alloc(46);wav.write('RIFF');wav.writeUInt32LE(38,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(2,40);await fs.writeFile(audio,wav);
await fs.writeFile(background,rad.rad);await fs.writeFile(collider,floorGlb());
const importedPreset=presetFile({name:'Imported field detail',settings:{...defaultPerformance().presets[0].settings,lodSplatCount:300000,pixelRatio:1.1}});await fs.writeFile(presetPath,JSON.stringify(importedPreset));await fs.writeFile(badPreset,'{"version":999}');
const project=blankProject();project.title='Serialized imports';project.startScene='a';project.scenes=['a','b'].map(id=>{const scene=newScene(id,id==='a'?'Original scene':'Other scene','scene.rad');scene.viewpoints[0].thumbnail='data:image/png;base64,'+png.toString('base64');scene.hotspots=[{id:id+'-bubble',label:id==='a'?'Picture and story':'Other story',position:[0,1,0],kind:'page',target:id+'-page'}];return scene;});
project.pages=[{id:'a-page',title:'Picture and story',html:'',blocks:[{type:'image',text:'A chosen photograph',url:''},{type:'text',text:'Original history.',url:'',richText:plainTextDocument('Original history.')}]},{id:'b-page',title:'Other story',html:'',blocks:[{type:'text',text:'Keep this history unchanged.',url:'',richText:plainTextDocument('Keep this history unchanged.')}]}];
await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(folder,'config/hosting.json'),'{}');await fs.writeFile(path.join(folder,'scene.rad'),rad.rad);
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'],app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 await app.evaluate(({dialog})=>{
  const nativeFs=process.mainModule.require('node:fs/promises'),copyFile=nativeFs.copyFile,readFile=nativeFs.readFile,rename=nativeFs.rename;
  globalThis.__importCheck={dialogs:[],dialog:null,file:null,saves:0};dialog.showMessageBox=async()=>({response:1,checkboxChecked:false});
  dialog.showOpenDialog=async(_win,options)=>{const state=globalThis.__importCheck,next=state.dialog;if(!next)throw Error('Unexpected test dialog: '+options?.title);state.dialog=null;state.dialogs.push(options?.title||'');state.activeDialog=next;next.entered=true;if(next.hold)await new Promise(resolve=>next.release=resolve);return {filePaths:next.files,canceled:!next.files.length};};
  const wait=async file=>{const gate=globalThis.__importCheck.file;if(gate?.source===String(file)&&!gate.entered){gate.entered=true;await new Promise(resolve=>gate.release=resolve);if(gate.fail)throw Error('Fixture image read failed.');}};
  nativeFs.copyFile=async function(from,...args){await wait(from);return copyFile.call(this,from,...args);};
  nativeFs.readFile=async function(from,...args){await wait(from);return readFile.call(this,from,...args);};
  nativeFs.rename=async function(from,...args){if(String(from).endsWith('tour.json.tmp'))globalThis.__importCheck.saves++;return rename.call(this,from,...args);};
 });
 const choose=(files,hold=false)=>app.evaluate(({},data)=>{globalThis.__importCheck.dialog={files:data.files,hold:data.hold,entered:false};globalThis.__importCheck.activeDialog=null;}, {files,hold});
 const releaseDialog=()=>app.evaluate(()=>globalThis.__importCheck.activeDialog.release());
 const heldDialog=()=>expect.poll(()=>app.evaluate(()=>globalThis.__importCheck.activeDialog?.entered)).toBe(true);
 const gateFile=(source,fail=false)=>app.evaluate(({},data)=>{globalThis.__importCheck.file={...data,entered:false};},{source,fail});
 const heldFile=()=>expect.poll(()=>app.evaluate(()=>globalThis.__importCheck.file?.entered)).toBe(true);
 const releaseFile=()=>app.evaluate(()=>globalThis.__importCheck.file.release());
 const state=()=>page.evaluate(()=>structuredClone(window.__studioCloseState().project));
 const dirty=()=>page.evaluate(()=>window.__studioCloseState().dirty);
 const menu=async(group,label)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const inspector=label=>page.locator('.inspector-tabs').getByRole('button',{name:label,exact:true}).click();
 const preview=()=>page.getByTitle('Preview visitor experience',{exact:true}).click();
 const selectScene=async name=>{await page.getByRole('tab',{name:'Scenes',exact:true}).click();await page.locator('.object-row strong').getByText(name,{exact:true}).click();await page.waitForFunction(name=>window.tourRuntime?.ready&&window.tourRuntime.active?.name===name,name);};
 const selectBubble=async name=>{await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row strong').getByText(name,{exact:true}).click();await expect(page.getByLabel('Label',{exact:true})).toHaveValue(name);};
 const save=async()=>{await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(dirty).toBe(false);assert.deepEqual(JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8')),await state(),'Save writes exactly the latest imported metadata');};
 const locked=async()=>{
  await expect(page.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  const before=await app.evaluate(()=>({saves:globalThis.__importCheck.saves,dialogs:globalThis.__importCheck.dialogs.length}));
  await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:'File',exact:true}).click();for(const label of ['New project','Open project','Save','Save as','Export tour'])await expect(page.getByRole('menuitem',{name:label,exact:true})).toBeDisabled();await page.keyboard.press('Escape');
  await page.locator('.workspace-state').click();for(const key of ['Control+s','Control+Shift+s','Control+o'])await page.keyboard.press(key);
  assert.deepEqual(await app.evaluate(()=>({saves:globalThis.__importCheck.saves,dialogs:globalThis.__importCheck.dialogs.length})),before,'Held imports cannot be interrupted by Save, Save As or Open shortcuts');
 };
 const drop=async(file,selector)=>{await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='fixture-drop-input';input.hidden=true;document.body.append(input);});await page.locator('#fixture-drop-input').setInputFiles(file);await page.evaluate(selector=>{const input=document.querySelector('#fixture-drop-input'),data=new DataTransfer();data.items.add(input.files[0]);document.querySelector(selector).dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));input.remove();},selector);};

 await choose([folder]);await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.active?.id==='a');await selectBubble('Picture and story');const otherPage=(await state()).pages[1];
 // Choose-image stays bound to the original content even if Preview is opened.
 await choose([image],true);await page.locator('.image-picker').getByRole('button',{name:'Choose image file…',exact:true}).click();await heldDialog();await locked();await preview();await releaseDialog();await expect.poll(async()=>(await state()).pages[0].blocks[0].url).toMatch(/Chosen\.png$/);await expect.poll(dirty).toBe(true);const chosen=(await state()).pages[0].blocks[0].url;assert.deepEqual((await state()).pages[1],otherPage);await preview();await save();
 console.log('PASS held choose-image serializes Save/Save As/Open, safely commits after Preview, and saves the exact original page binding.');

 // The rich editor must not use a destroyed TipTap instance when another scene
 // replaces it. Its original selection, text and captured callback are retained.
 const editor=page.locator('.bubble-content [contenteditable=true]');await editor.evaluate(element=>{const editor=element.editor;editor.commands.setTextSelection(editor.state.doc.content.size-1);editor.view.focus();});await expect.poll(()=>editor.evaluate(element=>element.editor.state.selection.from===element.editor.state.doc.content.size-1)).toBe(true);await gateFile(dropImage);await drop(dropImage,'.bubble-content .rich-text-editor');await heldFile();await locked();await selectScene('Other scene');await selectBubble('Other story');await preview();await releaseFile();await expect.poll(async()=>richTextReferences((await state()).pages[0].blocks[1].richText).length).toBe(1);let current=await state();const dropped=richTextReferences(current.pages[0].blocks[1].richText)[0].ref;assert.match(dropped,/^media\/.+\.png$/);assert.equal(richTextPlainText(current.pages[0].blocks[1].richText),'Original history.\nDropped');assert.equal(current.pages[0].blocks[1].richText.doc.content[0].content[0].text,'Original history.');assert.equal(current.pages[0].blocks[1].richText.doc.content[1].type,'image','The image inserts after the captured end-of-document caret');assert.deepEqual(current.pages[1],otherPage);assert.deepEqual(await fs.readFile(path.join(folder,dropped)),png);await preview();await save();
 console.log('PASS real file drop survives a scene/bubble change and Preview, keeps the original rich-text document/caret target, and copies bytes before clean Save.');

 await selectScene('Original scene');await selectBubble('Picture and story');const beforeCancel=await state();await choose([]);await page.locator('.image-picker').getByRole('button',{name:'Choose image file…',exact:true}).click();await heldDialog();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.deepEqual(await state(),beforeCancel);assert.equal(await dirty(),false);
 await gateFile(failedImage,true);await drop(failedImage,'.bubble-content .rich-text-editor');await heldFile();await locked();await releaseFile();await expect(page.locator('.rich-text-editor [role=alert]')).toContainText('Fixture image read failed.');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.deepEqual(await state(),beforeCancel);assert.equal(await dirty(),false);
 console.log('PASS canceled chooser and failed file drop unlock without binding, document, dirty-state or save changes.');

 // A failure must remain visible even if the inspector owning its local error
 // message was replaced while the native file copy was in progress.
 await gateFile(failedImage,true);await drop(failedImage,'.bubble-content .rich-text-editor');await heldFile();await selectScene('Other scene');await inspector('Scene');await releaseFile();await expect(page.locator('.statusbar [role=status]')).toContainText('Fixture image read failed.');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.deepEqual(await state(),beforeCancel);assert.equal(await dirty(),false);await selectScene('Original scene');await selectBubble('Picture and story');
 console.log('PASS a failed import still reports globally after its inspector/scene changes, unlocks and preserves the original project.');

 await menu('Tools','Performance presets');await choose([presetPath]);await gateFile(presetPath);await page.getByRole('button',{name:'Import preset…',exact:true}).click();await heldFile();await page.getByRole('button',{name:'Close settings',exact:true}).click();await locked();await preview();await releaseFile();await expect.poll(async()=>(await state()).performance?.presets.at(-1)?.name).toBe(importedPreset.name);current=await state();assert.deepEqual(current.performance.presets.at(-1).settings,importedPreset.settings);assert.equal(current.performance.defaultPresetId,current.performance.presets.at(-1).id);await menu('Tools','Performance presets');await expect(page.getByLabel('Resolution cap',{exact:true})).toBeEnabled();await page.getByRole('button',{name:'Close settings',exact:true}).click();await preview();await save();
 await menu('Tools','Performance presets');const beforeBad=await state();await choose([badPreset]);await page.getByRole('button',{name:'Import preset…',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'version'}).first()).toBeVisible();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.deepEqual(await state(),beforeBad);assert.equal(await dirty(),false);await choose([]);await page.getByRole('button',{name:'Import preset…',exact:true}).click();await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.deepEqual(await state(),beforeBad);await page.getByRole('button',{name:'Close settings',exact:true}).click();
 console.log('PASS held preset read commits after its panel closes and Preview opens; Preview tuning remains available; malformed/canceled reads unlock cleanly.');

 await inspector('Scene');await page.getByText('Scene audio',{exact:true}).click();await choose([audio],true);await page.getByRole('button',{name:'Choose audio file…',exact:true}).click();await heldDialog();await locked();await selectScene('Other scene');await preview();await releaseDialog();await expect.poll(async()=>(await state()).scenes[0].audio?.source).toMatch(/Sound\.wav$/);assert.equal((await state()).scenes[1].audio,undefined);await preview();await save();
 await selectScene('Original scene');await inspector('Scene');await page.getByText('Background',{exact:true}).click();await page.getByLabel('Background type',{exact:true}).selectOption('splat');await save();await choose([background],true);await page.getByRole('button',{name:'Choose background RAD…',exact:true}).click();await heldDialog();await locked();await selectScene('Other scene');await preview();await releaseDialog();await expect.poll(async()=>(await state()).scenes[0].background?.source).toMatch(/Background\.rad$/);assert.equal((await state()).scenes[1].background,undefined);await preview();await save();
 console.log('PASS scene audio and background RAD imports use the same serialization and original-scene targeting while Preview stays navigable.');

 // Existing native collider import intentionally commits through the busy lock.
 await selectScene('Original scene');await inspector('Mesh');await choose([collider],true);await page.getByRole('button',{name:'Import / relink collider',exact:true}).click();await heldDialog();await locked();await preview();await releaseDialog();await expect.poll(async()=>(await state()).scenes[0].collider).toMatch(/floor\.glb$/);await preview();await save();
 const latest=await state();await choose([copy]);await menu('File','Save as');await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(path.join(copy,'config/tour.json'),'utf8'));}catch{return null;}}).toEqual(latest);await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();assert.equal(await dirty(),false);
 await choose([output]);await page.getByRole('button',{name:'Export tour',exact:true}).click();await page.getByRole('button',{name:'Choose folder & export',exact:true}).click();await expect.poll(async()=>{try{return JSON.parse(await fs.readFile(path.join(output,'config/tour.json'),'utf8'));}catch{return null;}},{timeout:120000}).toEqual(latest);await expect(page.getByRole('button',{name:'Choose folder & export',exact:true})).toHaveCount(0);
 // Save As preserves the working project's existing referenced-source model;
 // it copies owned media and .sources bindings, not every external file. The
 // portable export must materialize them all into its own folder.
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(copy,'.sources.json'),'utf8')),JSON.parse(await fs.readFile(path.join(folder,'.sources.json'),'utf8')));assert.deepEqual(await fs.readFile(path.join(copy,dropped)),png);
 await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.active?.id==='a');
 for(const [ref,expected] of [[chosen,png],[dropped,png],[latest.scenes[0].audio.source,wav],[latest.scenes[0].background.source,rad.rad],[latest.scenes[0].collider,floorGlb()]]){const served=await page.evaluate(async ref=>{const response=await fetch(new URL(ref,window.tourRuntime.base));if(!response.ok)throw Error('Saved project asset failed: '+response.status);return [...new Uint8Array(await response.arrayBuffer())];},ref);assert.deepEqual(Buffer.from(served),expected,'Save As project resolves exact imported bytes: '+ref);assert.deepEqual(await fs.readFile(path.join(output,ref)),expected,'Portable export owns exact imported bytes: '+ref);}
 for(const destination of [copy,output])assert.deepEqual(JSON.parse(await fs.readFile(path.join(destination,'config/tour.json'),'utf8')).performance,latest.performance);
 assert.deepEqual(await fs.readFile(image),png);assert.deepEqual(await fs.readFile(dropImage),png);assert.deepEqual(await fs.readFile(background),rad.rad);assert.deepEqual(errors,[]);await page.screenshot({path:path.join(root,'serialized-imports.png')});
 console.log('PASS native collider result still commits while locked; completed bindings, preset metadata and exact file bytes survive Save As and portable export. '+root);
}finally{await app.evaluate(()=>{globalThis.__importCheck?.activeDialog?.release?.();globalThis.__importCheck?.file?.release?.();}).catch(()=>{});await app.close();}
