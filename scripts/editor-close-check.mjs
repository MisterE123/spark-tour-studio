import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
import {radFixture} from '../tests/fixtures.mjs';

// Held reads and copies exist only in this disposable native fixture. Close
// uses the real main handler, actual renderer transaction and on-disk project.
const root=path.resolve('test-output','editor-close-'+Date.now()),results=[];
await fs.mkdir(root,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD+8AAAAASUVORK5CYII=','base64');
async function run(name,check){
 const folder=path.join(root,name,'project'),prompts=path.join(root,name,'prompts.json'),image=path.join(root,name,'Chosen photo.png'),second=path.join(root,name,'Another photo.png');
 await fs.mkdir(path.join(folder,'config'),{recursive:true});await fs.writeFile(image,png);await fs.writeFile(second,png);await fs.writeFile(prompts,'[]');
 const project=blankProject(),scene=newScene('a','Close fixture','main.rad');scene.viewpoints[0].thumbnail='data:image/png;base64,'+png.toString('base64');scene.hotspots=[{id:'photo',label:'Photo',position:[0,1.7,0],kind:'page',target:'photo'}];project.scenes=[scene];project.startScene='a';project.pages=[{id:'photo',title:'Photo',html:'',blocks:[{type:'image',text:'A photograph',url:''}]}];
 await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(folder,'config/hosting.json'),'{}');await fs.writeFile(path.join(folder,'main.rad'),radFixture().rad);
 const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'],app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,name,'profile')},timeout:60000});
 let appClosed=false;app.on('close',()=>{appClosed=true;});
 try{
  const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
  await app.evaluate(({dialog},input)=>{
   const nativeFs=process.getBuiltinModule('fs/promises'),sync=process.getBuiltinModule('fs'),copy=nativeFs.copyFile;
   globalThis.__closeCheck={responses:[],prompts:input.prompts,nextFiles:[input.folder],gate:null,chooser:null};
   dialog.showOpenDialog=async()=>{const state=globalThis.__closeCheck;if(state.chooser){state.chooser.entered=true;await new Promise(resolve=>state.chooser.release=resolve);}const files=state.nextFiles;state.nextFiles=[];return {filePaths:files,canceled:!files.length};};
   dialog.showMessageBox=async(_win,options)=>{const state=globalThis.__closeCheck,entries=JSON.parse(sync.readFileSync(state.prompts,'utf8'));entries.push(options);const pending=state.prompts+'.tmp';sync.writeFileSync(pending,JSON.stringify(entries));sync.renameSync(pending,state.prompts);if(!state.responses.length)throw Error('Unexpected Close prompt: '+options.message);return {response:state.responses.shift()};};
   nativeFs.copyFile=async function(from,...args){const gate=globalThis.__closeCheck.gate;if(gate?.file===String(from)&&!gate.entered){gate.entered=true;await new Promise(resolve=>gate.release=resolve);if(gate.fail)throw Error('Fixture copy failed');}return copy.call(this,from,...args);};
  },{folder,prompts});
  const menu=async(group,label)=>{await page.getByRole('navigation',{name:'Editor menu',exact:true}).getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
  await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.ready&&window.__studioCloseState?.().pending===0);await page.getByRole('tab',{name:'Bubbles',exact:true}).click();await page.locator('.object-row strong').getByText('Photo',{exact:true}).click();
  const state=()=>page.evaluate(()=>structuredClone(window.__studioCloseState()));
  const responses=(...values)=>app.evaluate(({},values)=>globalThis.__closeCheck.responses.push(...values),values);
  const requestClose=()=>app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].close());
  const messages=async()=>JSON.parse(await fs.readFile(prompts,'utf8'));
  const waitPrompts=count=>expect.poll(async()=>(await messages()).length).toBe(count);
  const lock=value=>expect.poll(()=>page.locator('.studio').evaluate(element=>element.inert)).toBe(value);
  const gateFile=(file,fail=false)=>app.evaluate(({},data)=>globalThis.__closeCheck.gate={...data,entered:false}, {file,fail});
  const release=()=>app.evaluate(()=>globalThis.__closeCheck.gate.release());
  const drop=async file=>{await gateFile(file);await page.evaluate(()=>{const input=document.createElement('input');input.type='file';input.id='close-image-input';input.hidden=true;document.body.append(input);});await page.locator('#close-image-input').setInputFiles(file);await page.evaluate(()=>{const input=document.querySelector('#close-image-input'),data=new DataTransfer();data.items.add(input.files[0]);document.querySelector('.image-picker').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));input.remove();});await expect.poll(()=>app.evaluate(()=>globalThis.__closeCheck.gate.entered)).toBe(true);};
  const read=async()=>JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8'));
  await check({app,page,folder,image,second,project,state,responses,requestClose,messages,waitPrompts,lock,drop,release,read,menu});
  const result={name,status:'passed',prompts:(await messages()).map(message=>({message:message.message,buttons:message.buttons}))};results.push(result);console.log('PASS '+name);
 }catch(error){results.push({name,status:'failed',error:String(error)});throw error;}
 finally{if(!appClosed){await app.evaluate(()=>{globalThis.__closeCheck?.gate?.release?.();globalThis.__closeCheck?.chooser?.release?.();}).catch(()=>{});await app.evaluate(({app})=>app.exit(0)).catch(()=>{});}await app.close().catch(()=>{});await fs.writeFile(path.join(root,'result.json'),JSON.stringify({root,results},null,2));}
}

await run('cancel-wait-and-save',async({app,page,folder,image,second,state,responses,requestClose,waitPrompts,lock,drop,release,read})=>{
 assert.equal((await state()).dirty,false);await drop(image);assert.equal((await state()).dirty,false);assert.ok((await state()).pending>=2,'Both read and outer apply are pending');
 await responses(2);await requestClose();await waitPrompts(1);await lock(false);assert.ok((await state()).pending>=2);await release();await expect.poll(async()=>(await state()).pending).toBe(0);assert.equal((await state()).dirty,true);assert.match((await state()).project.pages[0].blocks[0].url,/^media\//);
 // A second X wakes the wait without canceling the import. Closing again and
 // choosing Save must still include the eventual authorized result.
 await drop(second);await responses(0,1);await requestClose();await waitPrompts(2);await lock(true);await requestClose();await waitPrompts(3);await lock(false);assert.ok((await state()).pending>=2);await responses(0);const closed=app.waitForEvent('close');await requestClose();await waitPrompts(4);await lock(true);await page.keyboard.press('Control+z');await release();await closed;
 const saved=await read(),ref=saved.pages[0].blocks[0].url;assert.match(ref,/^media\//);assert.deepEqual(await fs.readFile(path.join(folder,ref)),png);assert.notEqual(ref,'');assert.equal(saved.pages[0].blocks[0].text,'A photograph');
});

await run('clean-native-chooser-save',async({app,page,folder,image,responses,requestClose,waitPrompts,lock,state,read})=>{
 await app.evaluate(({},image)=>{globalThis.__closeCheck.nextFiles=[image];globalThis.__closeCheck.chooser={entered:false};},image);await page.locator('.image-picker').getByRole('button',{name:'Choose image file…',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.__closeCheck.chooser.entered)).toBe(true);assert.equal((await state()).dirty,false);await responses(0);const closed=app.waitForEvent('close');await requestClose();await waitPrompts(1);await lock(true);await app.evaluate(()=>globalThis.__closeCheck.chooser.release());await closed;
 const saved=await read(),ref=saved.pages[0].blocks[0].url,sources=JSON.parse(await fs.readFile(path.join(folder,'.sources.json'),'utf8'));assert.match(ref,/^imports\//);const prefix=Object.keys(sources).find(key=>ref.startsWith(key+'/'));assert.ok(prefix,'Save and close preserves native source registration');assert.equal(sources[prefix].kind,'image');assert.equal(path.resolve(sources[prefix].dir),path.dirname(image));
});

await run('failed-copy-save',async({app,image,responses,requestClose,waitPrompts,drop,release,read,project})=>{
 await drop(image);await app.evaluate(()=>globalThis.__closeCheck.gate.fail=true);await responses(0);const closed=app.waitForEvent('close');await requestClose();await waitPrompts(1);await release();await closed;assert.deepEqual(await read(),project,'A failed import neither dirties nor rewrites the project');
});

await run('canceled-chooser-save',async({app,page,responses,requestClose,waitPrompts,read,project})=>{
 await app.evaluate(()=>{globalThis.__closeCheck.nextFiles=[];globalThis.__closeCheck.chooser={entered:false};});await page.locator('.image-picker').getByRole('button',{name:'Choose image file…',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.__closeCheck.chooser.entered)).toBe(true);await responses(0);const closed=app.waitForEvent('close');await requestClose();await waitPrompts(1);await app.evaluate(()=>globalThis.__closeCheck.chooser.release());await closed;assert.deepEqual(await read(),project);
});

await run('discard-pending-copy',async({app,image,responses,requestClose,waitPrompts,drop,read,project})=>{
 await drop(image);await responses(1);const closed=app.waitForEvent('close');await requestClose();await waitPrompts(1);await closed;assert.deepEqual(await read(),project,'Discard exits with the original saved document intact');
});

await run('ordinary-clean-close',async({app,responses,requestClose,messages,state})=>{
 assert.equal((await state()).dirty,false);await responses();const closed=app.waitForEvent('close');await requestClose();await closed;assert.equal((await messages()).length,0);
});
console.log(JSON.stringify({root,checks:results.length,status:'passed'}));
