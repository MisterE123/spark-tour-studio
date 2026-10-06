import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
const asset=process.argv[2];if(!asset)throw Error('Pass the local RAD path. The file is served read-only.');
const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const dir=path.resolve('test-output/rad-compat');await fs.mkdir(path.join(dir,'config'),{recursive:true});const p=blankProject();p.scenes=[newScene('one','RAD compatibility test','capture.rad')];p.startScene='one';await fs.writeFile(path.join(dir,'config/tour.json'),JSON.stringify(p));await fs.writeFile(path.join(dir,'config/hosting.json'),'{}');
const {server,url}=await startServer({root:path.resolve('dist'),resolve:name=>name==='capture.rad'?{root:path.dirname(asset),relative:path.basename(asset)}:name.startsWith('config/')?{root:dir,relative:name}:undefined});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();let bytes=0;page.on('response',r=>{if(r.url().endsWith('capture.rad'))bytes+=Number(r.headers()['content-length']||0);});await page.goto(url);await page.getByRole('button',{name:'Enter tour ↗'}).click();await page.getByText(/34,999,724 splats but no LoD tree/).waitFor();assert.ok(bytes<2000000,`Read ${bytes} bytes instead of metadata only`);console.log(`PASS: actual LichtFeld RAD receives actionable compatibility error; ${bytes} bytes requested, no full-file load.`);}finally{await browser.close();await new Promise(r=>server.close(r));}
