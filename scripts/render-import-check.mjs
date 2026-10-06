import {chromium} from '@playwright/test';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
if(!process.argv[2])throw Error('Pass an exported tour folder.');
const root=path.resolve(process.argv[2]),{server,url}=await startServer({root});const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{const page=await browser.newPage();await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour ↗'}).click();await page.waitForFunction(()=>window.tourRuntime?.spark.display?.numSplats>0);await page.screenshot({path:path.join(root,'../converted-render.png')});console.log('PASS: exported PLY-derived RAD renders with external networking blocked.');}finally{await browser.close();await new Promise(r=>server.close(r));}
