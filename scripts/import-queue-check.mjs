import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {radFixture,plyFixture} from '../tests/fixtures.mjs';

const root=path.resolve('test-output','import-queue-'+Date.now()),project=path.join(root,'project'),out=path.join(root,'export');
await fs.mkdir(project,{recursive:true});await fs.mkdir(out);
const rad=path.join(root,'Aerial.rad'),broken=path.join(root,'Missing chunk.rad'),dismissedRad=path.join(root,'Discarded.rad'),ply1=path.join(root,'Interior one.ply'),ply2=path.join(root,'Interior two.ply');
const valid=radFixture('Aerial.radc'),bad=radFixture('missing.radc');
await fs.writeFile(rad,valid.rad);await fs.writeFile(dismissedRad,valid.rad);await fs.writeFile(path.join(root,'Aerial.radc'),valid.chunk);await fs.writeFile(broken,bad.rad);await fs.writeFile(ply1,plyFixture());await fs.writeFile(ply2,plyFixture());
const launchArgs=['--disable-background-timer-throttling','--disable-renderer-backgrounding'];
const app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/3DGS Perspectives Studio.exe'),args:launchArgs}:{args:['.',...launchArgs]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow(),errors=[];page.setDefaultTimeout(30000);page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 const queue=()=>page.evaluate(()=>window.studio.getImportQueue());
 const waitQueue=async predicate=>{const until=Date.now()+120000;while(Date.now()<until){const state=await queue();if(predicate(state))return state;await new Promise(resolve=>setTimeout(resolve,200));}throw Error('Queue did not finish: '+JSON.stringify(await queue()));};
 const choose=files=>app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async(_win,options)=>{globalThis.lastPicker=options;return {filePaths:files,canceled:false};};},files);
 const menu=async(group,label)=>{await page.getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const closeQueue=()=>page.getByRole('button',{name:'Close settings',exact:true}).click();
 const job=name=>page.locator('.import-job').filter({has:page.locator('.import-job-heading strong').getByText(name,{exact:true})});
 const sceneCount=()=>page.evaluate(()=>window.tourRuntime.project.scenes.length);

 await choose([project]);await menu('File','New project');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();
 await menu('Tools','Import queue');await page.getByRole('button',{name:'Pause after current',exact:true}).click();await closeQueue();
 await choose([rad,broken,dismissedRad]);await menu('Add','RAD scenes');await expect(page.locator('.import-job')).toHaveCount(3);assert.ok((await app.evaluate(()=>globalThis.lastPicker)).properties.includes('multiSelections'));
 const retainedBefore=(await queue()).jobs.filter(item=>item.name!=='Discarded');
 await job('Discarded').getByRole('button',{name:'Cancel',exact:true}).click();await expect(job('Discarded')).toHaveAttribute('data-state','cancelled');
 await expect(job('Discarded').getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(job('Discarded').getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();
 await page.screenshot({path:path.join(root,'cancelled-actions.png')});
 await job('Discarded').getByRole('button',{name:'Dismiss',exact:true}).click();await expect(job('Discarded')).toHaveCount(0);await expect(page.locator('.import-job')).toHaveCount(2);
 assert.deepEqual((await queue()).jobs,retainedBefore,'targeted dismissal preserves every other queued job');assert.equal(await sceneCount(),0,'dismissed scene is not added');assert.deepEqual(await fs.readFile(dismissedRad),valid.rad,'dismissal leaves source files untouched');
 await closeQueue();await page.getByRole('button',{name:'File',exact:true}).click();await expect(page.getByRole('menuitem',{name:'New project',exact:true})).toBeDisabled();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Save',exact:true})).toBeEnabled();

 await menu('Add','PLY scenes');await page.getByLabel('LoD method',{exact:true}).selectOption('quick');await choose([ply1,ply2]);await page.getByRole('button',{name:'Choose PLY & queue',exact:true}).click();await expect(page.locator('.import-job')).toHaveCount(4);
 await job('Interior two').getByRole('button',{name:'Cancel',exact:true}).click();await expect(job('Interior two').getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();await job('Interior two').getByRole('button',{name:'Retry',exact:true}).click();await expect(job('Interior two')).toHaveAttribute('data-state','queued');assert.equal(await job('Interior two').getByRole('button',{name:'Dismiss',exact:true}).count(),0);
 await closeQueue();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Project saved.',{exact:true}).waitFor();
 await menu('Tools','Import queue');await page.getByRole('button',{name:'Resume queue',exact:true}).click();await waitQueue(state=>!state.activeId&&!state.jobs.some(item=>item.state==='queued'||item.state==='completed'&&!item.acknowledged));
 assert.equal(await sceneCount(),3);await expect(page.locator('.import-job[data-state="failed"]')).toHaveCount(1);await expect(job('Missing chunk').getByRole('button',{name:'Retry',exact:true})).toBeVisible();await expect(job('Missing chunk').getByRole('button',{name:'Dismiss',exact:true})).toBeVisible();
 await fs.writeFile(path.join(root,'missing.radc'),bad.chunk);await job('Missing chunk').getByRole('button',{name:'Retry',exact:true}).click();await waitQueue(state=>state.jobs.length===4&&state.jobs.every(item=>item.state==='completed'&&item.acknowledged));
 assert.equal(await sceneCount(),4);await page.screenshot({path:path.join(root,'queue.png')});await closeQueue();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Project saved.',{exact:true}).waitFor();
 const saved=JSON.parse(await fs.readFile(path.join(project,'config/tour.json'),'utf8'));assert.deepEqual(new Set(saved.scenes.map(scene=>scene.name)),new Set(['Aerial','Missing chunk','Interior one','Interior two']));assert.equal(new Set(saved.scenes.map(scene=>scene.id)).size,4);assert.deepEqual(await fs.readFile(ply1),plyFixture());assert.deepEqual(await fs.readFile(ply2),plyFixture());
 await choose([out]);await page.getByRole('button',{name:'Export tour',exact:true}).click();await page.getByRole('button',{name:'Choose folder & export',exact:true}).click();await page.getByText(/^Export complete:/).waitFor({timeout:120000});
 const exported=JSON.parse(await fs.readFile(path.join(out,'config/tour.json'),'utf8'));assert.equal(exported.scenes.length,4);for(const scene of exported.scenes)await fs.access(path.join(out,scene.source));
 await choose([project]);await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.project.scenes.length===4);await menu('Tools','Import queue');await expect(page.locator('.import-job')).toHaveCount(0);assert.deepEqual(errors,[]);
 console.log('PASS: native canceled-entry Retry + Dismiss, targeted removal preserving queued jobs and source assets, RAD/PLY batches, cancel/retry, missing chunk recovery, Save while pending, exactly-once scenes, export/reopen. '+root);
}finally{await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();}).catch(()=>{});await app.close();}
