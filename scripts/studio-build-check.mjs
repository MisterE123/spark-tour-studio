import {_electron as electron,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readStudioBuildInfo} from './studio-build-info.mjs';

const override=process.argv.includes('--stable')?'0':process.argv.includes('--experimental')?'1':process.env.SPARK_EXPERIMENTAL_BUILD;
const expected=readStudioBuildInfo({env:{...process.env,SPARK_EXPERIMENTAL_BUILD:override}}),packageRoot=path.resolve(process.env.SPARK_PACKAGE_DIR||'release/win-unpacked'),dist=process.env.SPARK_PACKAGED?path.join(packageRoot,'resources','viewer'):path.resolve('dist');
const root=path.resolve('test-output','studio-build-'+Date.now());await fs.mkdir(root,{recursive:true});
// Follow precisely the viewer entry's emitted dependency graph; editor chunks
// may contain build identity, but those chunks must never enter exported tours.
const manifest=JSON.parse(await fs.readFile(path.join(dist,'.vite/manifest.json'),'utf8')),seen=new Set(),viewerFiles=[];
function walk(key){if(seen.has(key))return;seen.add(key);const entry=manifest[key];assert.ok(entry,'Missing manifest module: '+key);viewerFiles.push(entry.file,...entry.css||[]);for(const child of [...entry.imports||[],...entry.dynamicImports||[]])walk(child);}
walk('index.html');
for(const file of new Set(viewerFiles)){const content=await fs.readFile(path.join(dist,file),'utf8');assert.doesNotMatch(content,/studio-build-badge|studio-build-details|codex\/experimental-/,`Studio build identity leaked into viewer dependency ${file}`);}
const args=['--disable-background-timer-throttling','--disable-renderer-backgrounding'];
const app=await electron.launch({...process.env.SPARK_PACKAGED?{executablePath:path.join(packageRoot,'3DGS Perspectives Studio.exe'),args}:{args:['.',...args]},env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow();page.setDefaultTimeout(30000);await page.waitForSelector('.studio');const badge=page.locator('.studio-build-badge');
 if(expected.experimental){await expect(badge).toHaveText('Experimental');assert.ok((await badge.getAttribute('title')).includes(expected.shortCommit));}else await expect(badge).toHaveCount(0);
 await page.getByRole('button',{name:'Help',exact:true}).click();await page.getByRole('menuitem',{name:'About & licenses',exact:true}).click();const details=page.getByRole('region',{name:'Experimental build details',exact:true});
 if(expected.experimental){await expect(details).toBeVisible();await expect(details.locator('code')).toHaveText(expected.shortCommit||'Not available');assert.ok((await details.innerText()).includes(expected.branch||'Not available'));}else await expect(details).toHaveCount(0);
 await page.screenshot({path:path.join(root,'about-build.png')});await fs.writeFile(path.join(root,'result.json'),JSON.stringify({expected,viewerFiles:[...new Set(viewerFiles)]},null,2));
 console.log(`PASS ${expected.experimental?'experimental':'stable'} Studio identity, About branch/commit, and viewer graph without Studio experimental branding. ${root}`);
}finally{await app.evaluate(({BrowserWindow})=>{for(const win of BrowserWindow.getAllWindows())win.destroy();}).catch(()=>{});await app.close();}
