import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';import {defaultPerformance} from '../shared/performance.mjs';import {radFixture} from '../tests/fixtures.mjs';
const root=path.resolve('test-output','performance-state-'+Date.now()),folder=path.join(root,'project'),other=path.join(root,'other');
async function fixture(folder,extended=false){await fs.mkdir(path.join(folder,'config'),{recursive:true});const p=blankProject(),s=newScene('a','Performance test','scene.rad');p.scenes=[s];p.startScene=s.id;p.performance=defaultPerformance();p.performance.presets[1].settings.pagedExtSplats=extended;p.performance.defaultPresetId='light';await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(p));await fs.writeFile(path.join(folder,'config/hosting.json'),'{}');await fs.writeFile(path.join(folder,'scene.rad'),radFixture().rad);}
await fixture(folder);await fixture(other);
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'];
const app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 const menu=async(group,label)=>{await page.getByRole('button',{name:group,exact:true}).click();await page.getByRole('menuitem',{name:label,exact:true}).click();};
 const open=async folder=>{await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},folder);await menu('File','Open project');await page.waitForFunction(()=>window.tourRuntime?.ready);};
 const precision=page.getByLabel('Extended splat precision (ExtSplats)',{exact:true}),preset=page.getByLabel('Performance preset',{exact:true}),name=page.getByLabel('Preset name',{exact:true}),resolution=page.getByLabel('Resolution cap',{exact:true});
 const settled=async()=>{await page.evaluate(()=>window.tourRuntime.performanceTransition);await page.waitForFunction(()=>window.tourRuntime.ready);};
 await open(folder);await menu('Tools','Performance presets');await expect(preset).toHaveValue('light');await expect(resolution).toHaveValue('1');
 await precision.check();await resolution.fill('1.2');await name.fill('Unfinished precision preset');await settled();
 await page.evaluate(()=>{window.__performanceOwner=window.tourRuntime.spark;});
 for(let i=0;i<2;i++){
  await page.getByRole('button',{name:'Close settings',exact:true}).click();await menu('Tools','Performance presets');
  await expect(precision).toBeChecked();await expect(name).toHaveValue('Unfinished precision preset');await expect(resolution).toHaveValue('1.2');await expect(preset).toHaveValue('light');
  for(const tab of ['Tour','Delivery']){await page.locator('.settings-tabs').getByRole('button',{name:tab,exact:true}).click();await page.locator('.settings-tabs').getByRole('button',{name:'Performance',exact:true}).click();await expect(precision).toBeChecked();}
 }
 assert.equal(await page.evaluate(()=>window.__performanceOwner===window.tourRuntime.spark&&window.tourRuntime.performanceSettings.pagedExtSplats&&window.tourRuntime.performanceSettings.pixelRatio===1.2),true,'tab changes preserve the actual streaming pool and all live settings');
 await page.getByRole('button',{name:'Save as new preset',exact:true}).click();const copied=await preset.inputValue();assert.notEqual(copied,'light');
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await menu('Tools','Performance presets');await expect(preset).toHaveValue(copied);await expect(precision).toBeChecked();
 // Explicitly selecting a stored preset is still allowed to replace adjustments.
 await preset.selectOption('balanced');await expect(precision).not.toBeChecked();await settled();await preset.selectOption(copied);await expect(precision).toBeChecked();await settled();
 await page.getByRole('button',{name:'Use as tour default',exact:true}).click();
 await page.keyboard.press('Control+z');await expect(preset).toHaveValue('light');await expect(precision).not.toBeChecked();await settled();
 await page.keyboard.press('Control+y');await expect(preset).toHaveValue(copied);await expect(precision).toBeChecked();await settled();
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Project saved.',{exact:true}).waitFor();
 const saved=JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8'));assert.equal(saved.performance.defaultPresetId,copied);assert.equal(saved.performance.presets.find(p=>p.id===copied).settings.pagedExtSplats,true);
 await open(folder);await menu('Tools','Performance presets');await expect(preset).toHaveValue(copied);await expect(precision).toBeChecked();await expect(resolution).toHaveValue('1.2');
 await page.getByRole('button',{name:'Close settings',exact:true}).click();await open(other);await menu('Tools','Performance presets');await expect(preset).toHaveValue('light');await expect(precision).not.toBeChecked();await expect(name).toHaveValue('Lightweight');await expect(resolution).toHaveValue('1');
 await page.screenshot({path:path.join(root,'editor.png')});assert.deepEqual(errors,[]);console.log('PASS: draft precision/name/numbers and selected preset survive reopen/tab changes without reloading Spark; explicit selection, save/reopen and project reset work. '+root);
}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(w=>w.destroy())).catch(()=>{});await app.close();}
