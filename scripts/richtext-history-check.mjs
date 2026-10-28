import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
import {plainTextDocument,richTextPlainText} from '../shared/rich-text.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const root=path.resolve('test-output','richtext-history-'+Date.now()),folder=path.join(root,'project'),secondFolder=path.join(root,'second-project');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD+8AAAAASUVORK5CYII=','base64'),image=path.join(root,'History image.png');
await fs.mkdir(root,{recursive:true});await fs.writeFile(image,png);
const project=blankProject(),scene=newScene('a','Text history','main.rad'),thumbnail='data:image/png;base64,'+png.toString('base64');
scene.viewpoints=['one','two'].map(id=>({...structuredClone(scene.viewpoints[0]),id:'view-'+id,name:'View '+id,thumbnail,extendedDescription:{enabled:true,richText:plainTextDocument('Original view '+id),links:[]}}));scene.entry=scene.viewpoints[0].id;
scene.hotspots=['one','two'].map((id,i)=>({id,label:'Bubble '+id,position:[i,1.7,0],kind:'page',target:id}));
project.scenes=[scene];project.startScene='a';project.pages=['one','two'].map(id=>({id,title:'Bubble '+id,html:'',blocks:[0,1].map(()=>({type:'text',text:'Original story '+id,url:'',richText:plainTextDocument('Original story '+id)}))}));
for(const [index,target] of [folder,secondFolder].entries()){const copy=structuredClone(project);copy.title=index?'Second text project':'First text project';await fs.mkdir(path.join(target,'config'),{recursive:true});await fs.writeFile(path.join(target,'config/tour.json'),JSON.stringify(copy));await fs.writeFile(path.join(target,'config/hosting.json'),'{}');await fs.writeFile(path.join(target,'main.rad'),radFixture().rad);}
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'],app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
const checks=[];
try{
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 const state=()=>page.evaluate(()=>structuredClone(window.__studioCloseState().project));
 const menu=async(group,label)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const open=async target=>{await app.evaluate(({dialog},target)=>dialog.showOpenDialog=async()=>({filePaths:[target],canceled:false}),target);await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.ready&&window.tourRuntime.active?.id==='a');};
 const bubble=async name=>{await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row strong').getByText(name,{exact:true}).click();};
 const view=async name=>{await page.getByRole('tab',{name:'Views',exact:true}).click();await page.locator('.object-row strong').getByText(name,{exact:true}).click();};
 const text=()=>page.getByRole('textbox',{name:'Bubble rich text',exact:true}).first();
 const story=()=>page.getByRole('textbox',{name:'Viewpoint extended description',exact:true});
 const keys=async(editor,key)=>{await editor.focus();await page.keyboard.press(key);};
 const cleanHistory=async editor=>expect.poll(()=>editor.evaluate(element=>({undo:element.editor.can().undo(),redo:element.editor.can().redo()}))).toEqual({undo:false,redo:false});
 const check=message=>{checks.push(message);console.log('PASS '+message);};

 await open(folder);await bubble('Bubble one');await expect(text()).toHaveText('Original story one');await text().fill('Edited unique story one');await expect.poll(async()=>(await state()).pages[0].blocks[0].text).toBe('Edited unique story one');
 await keys(text(),'Control+z');await expect(text()).toHaveText('Original story one');await keys(text(),'Control+y');await expect(text()).toHaveText('Edited unique story one');
 check('Typing prop echoes preserve ordinary native text Undo and Redo.');

 await menu('Edit','Undo');await menu('Edit','Redo');await cleanHistory(text());await keys(text(),'Control+a');await page.locator('.bubble-content .rich-text-editor').first().getByRole('button',{name:'Bold',exact:true}).click();await expect(text().locator('strong')).toHaveText('Edited unique story one');await keys(text(),'Control+z');await expect(text().locator('strong')).toHaveCount(0);await keys(text(),'Control+y');await expect(text().locator('strong')).toHaveText('Edited unique story one');
 await menu('Edit','Undo');await menu('Edit','Redo');await cleanHistory(text());await keys(text(),'Control+a');const richEditor=page.locator('.bubble-content .rich-text-editor').first();await richEditor.getByRole('button',{name:'Insert or edit link',exact:true}).click();await richEditor.getByRole('textbox',{name:'Link destination',exact:true}).fill('https://example.com/history');await richEditor.getByRole('button',{name:'Apply',exact:true}).click();await expect(text().locator('a')).toHaveAttribute('href','https://example.com/history');await keys(text(),'Control+z');await expect(text().locator('a')).toHaveCount(0);await expect(text()).toHaveText('Edited unique story one');await keys(text(),'Control+y');await expect(text().locator('a')).toHaveAttribute('href','https://example.com/history');
 check('Formatting and normalized link attributes keep native text Undo and Redo.');

 await bubble('Bubble two');await expect(text()).toHaveText('Original story two');await cleanHistory(text());const beforeSecond=await state();await keys(text(),'Control+z');await expect(text()).toHaveText('Original story two');assert.deepEqual(await state(),beforeSecond,'No history from the previous bubble may enter the selected bubble');
 await text().fill('Edited story two');await keys(text(),'Control+z');await expect(text()).toHaveText('Original story two');await keys(text(),'Control+y');await expect(text()).toHaveText('Edited story two');
 check('Switching bubbles clears foreign text history while new local Undo and Redo work.');

 await text().fill('Project history replacement');await menu('Edit','Undo');await expect(text()).toHaveText('Edited story two');await cleanHistory(text());const afterProjectUndo=await state();await keys(text(),'Control+y');await keys(text(),'Control+z');assert.deepEqual(await state(),afterProjectUndo,'Local history must not replay snapshots across project Undo');
 await text().fill('Fresh text after project Undo');await keys(text(),'Control+z');await expect(text()).toHaveText('Edited story two');
 check('Project Undo silently rebases text history; subsequent typing remains undoable.');

 await bubble('Bubble one');await text().fill('Original story one');await menu('Edit','Undo');await menu('Edit','Redo');await expect(text()).toHaveText('Original story one');await cleanHistory(text());await text().fill('Wrong removed-block redo');await keys(text(),'Control+z');await expect(text()).toHaveText('Original story one');await expect.poll(()=>text().evaluate(element=>element.editor.can().redo())).toBe(true);
 await page.locator('.bubble-content .block').first().getByRole('button',{name:'Remove content block',exact:true}).click();await expect(text()).toHaveText('Original story one');await cleanHistory(text());const afterBlockRemoval=await state();await keys(text(),'Control+y');assert.deepEqual(await state(),afterBlockRemoval,'Equal-content block shifted into an index cannot inherit the removed block history');
 check('Removing a block cannot attach its Redo to an equal-content successor.');

 await view('View one');await expect(story()).toHaveText('Original view one');await story().fill('Edited unique view one');await view('View two');await expect(story()).toHaveText('Original view two');await cleanHistory(story());const beforeViewUndo=await state();await keys(story(),'Control+z');assert.deepEqual(await state(),beforeViewUndo);await story().fill('Edited view two');await keys(story(),'Control+z');await expect(story()).toHaveText('Original view two');await keys(story(),'Control+y');await expect(story()).toHaveText('Edited view two');
 check('Viewpoint descriptions have separate histories and working local Undo/Redo.');

 await bubble('Bubble two');await text().evaluate(element=>{const editor=element.editor;editor.commands.setTextSelection(editor.state.doc.content.size-1);editor.view.focus();});await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='history-drop';input.hidden=true;document.body.append(input);});await page.locator('#history-drop').setInputFiles(image);await page.evaluate(()=>{const input=document.querySelector('#history-drop'),data=new DataTransfer();data.items.add(input.files[0]);document.querySelector('.bubble-content .rich-text-editor').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));input.remove();});await expect.poll(async()=>(await state()).pages[1].blocks[0].richText.doc.content[1]?.type).toBe('image');
 let current=await state();await expect(text()).toHaveAttribute('contenteditable','true');await expect.poll(()=>text().evaluate(element=>element.editor.can().undo())).toBe(true);assert.equal(current.pages[1].blocks[0].richText.doc.content[0].content[0].text,'Edited story two');assert.match(richTextPlainText(current.pages[1].blocks[0].richText).trimEnd(),/History image$/);await keys(text(),'Control+z');await expect.poll(async()=>(await state()).pages[1].blocks[0].richText.doc.content.some(node=>node.type==='image')).toBe(false);await keys(text(),'Control+y');await expect.poll(async()=>(await state()).pages[1].blocks[0].richText.doc.content[1]?.type).toBe('image');
 check('Imported image keeps the captured end caret and native text Undo/Redo.');

 await page.getByRole('button',{name:'Save',exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.__studioCloseState().dirty)).toBe(false);const saved=await state();await page.getByTitle('Preview visitor experience',{exact:true}).click();await expect(text()).toHaveAttribute('contenteditable','false');await page.getByTitle('Preview visitor experience',{exact:true}).click();await expect(text()).toHaveAttribute('contenteditable','true');assert.deepEqual(await state(),saved);assert.equal(await page.evaluate(()=>window.__studioCloseState().dirty),false);
 check('Preview transitions neither emit phantom text changes nor dirty the saved tour.');

 await text().fill('History from first project');await open(secondFolder);await bubble('Bubble two');await expect(text()).toHaveText('Original story two');await cleanHistory(text());const reopened=await state();await keys(text(),'Control+z');await keys(text(),'Control+y');assert.deepEqual(await state(),reopened,'Reusing document IDs in another project cannot reuse text history');assert.equal(reopened.title,'Second text project');
 check('Opening a project with matching scene/page/view IDs starts independent text histories.');
 await page.screenshot({path:path.join(root,'final.png')});assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'result.json'),JSON.stringify({root,checks,errors},null,2));console.log(JSON.stringify({root,checks:checks.length}));
}finally{await app.evaluate(({app})=>app.exit(0)).catch(()=>{});await app.close().catch(()=>{});}
