import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import https from 'node:https';
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {blankProject,newScene} from '../shared/project.mjs';
import {defaultPerformance,tourPerformanceSettings} from '../shared/performance.mjs';
import {radFixture} from '../tests/fixtures.mjs';

// Reproduce Settings opening before the configuration arrives on a cold network
// visit, using the real exported launcher and float32 paged foreground/background.
const root=path.resolve('test-output','network performance '+Date.now()),center=1024.125;
await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.cp('dist',root,{recursive:true});
await fs.copyFile('launcher/Launch Tour.exe',path.join(root,'Launch Tour.exe'));
const project=blankProject();project.scenes=['a','b'].map(id=>{
 const scene=newScene(id,'Network scene '+id,'scene.rad');scene.transform.position=[-center,0,0];scene.viewpoints[0].position=[center,1.7,3];
 scene.background={type:'splat',source:'scene.rad',transform:{position:[-center,0,-2],rotation:[0,0,0],scale:1}};return scene;
});project.startScene='a';project.performance=defaultPerformance();
// The saved custom tour profile deliberately differs from its named preset,
// matching the user's export without copying any of their capture or media.
project.performance.defaultSettings={...project.performance.presets[0].settings,pagedExtSplats:true,pixelRatio:1.2,maxSh:1};
const config=JSON.stringify(project);await fs.writeFile(path.join(root,'config/tour.json'),config);await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {rad,chunk}=radFixture('scene.radc'),offset=8+Math.ceil(chunk.readUInt32LE(4)/8)*8+8;chunk.writeFloatLE(center,offset);
await fs.writeFile(path.join(root,'scene.rad'),rad);await fs.writeFile(path.join(root,'scene.radc'),chunk);
const child=spawn(path.join(root,'Launch Tour.exe'),['--no-open'],{cwd:root,windowsHide:true,env:{...process.env,LOCALAPPDATA:path.join(root,'certificate-cache'),PATH:path.join(process.env.SystemRoot,'System32')},stdio:['ignore','pipe','pipe']});
let output='',exitResult;child.stderr.on('data',c=>output+=c);child.stdout.on('data',c=>output+=c);
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{exitResult={code,signal};resolve(exitResult);}));
const get=url=>new Promise((resolve,reject)=>https.get(url,{rejectUnauthorized:false},res=>{let body='';res.on('data',b=>body+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body}));}).on('error',reject));
let browser,url,token,fallback;
async function streamed(page){
 await page.evaluate(()=>window.tourRuntime.performanceTransition);
 await page.waitForFunction(()=>{const r=window.tourRuntime,loaded=mesh=>{const s=mesh?.paged,p=s?.pager,e=p?.getSplatsChunk(s,0);return p?.extSplats===true&&e&&p.packedTexture.value.image.data[e.page*p.pageSplats*4]!==0;};return r?.ready&&r.spark.display.numSplats>0&&loaded(r.mesh)&&loaded(r.backgroundLayer.mesh);},null,{timeout:60000});
 assert.deepEqual(await page.evaluate(()=>{const r=window.tourRuntime,read=mesh=>{const s=mesh.paged,p=s.pager,e=p.getSplatsChunk(s,0);return new Float32Array(new Uint32Array([p.packedTexture.value.image.data[e.page*p.pageSplats*4]]).buffer)[0];};return [read(r.mesh),read(r.backgroundLayer.mesh),r.mesh.paged.pager===r.backgroundLayer.mesh.paged.pager];}),[center,center,true]);
}
try{
 url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Launcher startup timed out: '+output)),20000);const done=()=>{const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);child.stdout.off('data',done);resolve(match[0]);}};child.stdout.on('data',done);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error('Launcher exited during startup: '+code));});done();});
 const control=await(await fetch(url+'__launcher')).text();token=control.match(/name="token" value="([a-f0-9]+)"/)[1];
 const address=control.match(/<option value="([0-9.]+)">/)?.[1];let shareUrl;
 if(address){const shared=await(await fetch(url+'__share',{method:'POST',body:new URLSearchParams({token,address})})).text();shareUrl=shared.match(/https:\/\/[0-9.]+:\d+\//)?.[0];assert.ok(shareUrl,'Launcher must show the HTTPS sharing address');}
 else{const {startSharing}=createRequire(import.meta.url)('../launcher/sharing.cjs');fallback=await startSharing({root,host:'127.0.0.1',port:0,cacheRoot:path.join(root,'certificate-cache')});shareUrl=fallback.url;console.log('No private interface on this test host; HTTPS browser regression uses the sharing server on loopback.');}
 const remote=await get(shareUrl+'config/tour.json');assert.equal(remote.status,200);assert.equal(remote.body,config);assert.equal(await(await fetch(url+'config/tour.json')).text(),config);assert.equal(remote.headers['cache-control'],'no-cache');
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [name,site,options] of [
  ['desktop-local',url,{viewport:{width:1100,height:900}}],
  ['quest-style-https',shareUrl,{viewport:{width:1000,height:700},isMobile:true,hasTouch:true,deviceScaleFactor:1.5,userAgent:'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/40.0.0.0.0 Chrome/138.0.0.0 VR Safari/537.36'}]
 ]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,...options}),page=await context.newPage(),errors=[],external=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  let release;const gate=new Promise(resolve=>release=resolve);let delayed=true;
  await page.route('**/*',async route=>{const request=route.request().url();if(!request.startsWith(site)&&!request.startsWith('blob:')&&!request.startsWith('data:')){external.push(request);return route.abort();}if(delayed&&request===site+'config/tour.json'){await gate;delayed=false;}return route.continue();});
  try{
   await page.goto(site+'?diagnostics=1',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Settings',exact:true}).click();
   await expect(page.getByText('Loading tour settings…',{exact:true})).toBeVisible();await expect(page.getByLabel('Extended splat precision (ExtSplats)',{exact:true})).toHaveCount(0);release();
   await page.waitForFunction(()=>window.tourRuntime?.performanceSettings.pagedExtSplats===true);
   await page.getByText('Advanced performance',{exact:true}).click();const precision=page.getByLabel('Extended splat precision (ExtSplats)',{exact:true}),preset=page.getByLabel('Performance preset',{exact:true});
   await expect(precision).toBeChecked();await expect(preset).toHaveValue('');await page.getByLabel('Resolution cap',{exact:true}).fill('1.4');
   assert.deepEqual(await page.evaluate(()=>[window.tourRuntime.performanceSettings.pagedExtSplats,window.tourRuntime.spark.pagedExtSplats,window.tourRuntime.performanceSettings.pixelRatio]),[true,true,1.4]);
   // Settings must also reflect live changes made by the XR runtime/menu.
   await page.evaluate(()=>{window.tourRuntime.setQuality(.8);});await expect(page.getByLabel('Detail multiplier',{exact:true})).toHaveValue('0.8');
   await page.evaluate(settings=>{window.tourRuntime.applyPerformance(settings);},project.performance.presets[1].settings);
   await expect(precision).not.toBeChecked();await preset.selectOption('balanced');await expect(preset).toHaveValue('balanced');await precision.check();
   await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Enter tour',exact:true}).click();await streamed(page);
   await page.getByLabel('Scene',{exact:true}).selectOption('b');await page.waitForFunction(()=>window.tourRuntime.active?.id==='b'&&window.tourRuntime.ready);await streamed(page);
   await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Advanced performance',{exact:true}).click();await expect(precision).toBeChecked();
   await page.getByLabel('Resolution cap',{exact:true}).fill('1.3');await streamed(page);await page.screenshot({path:path.join(root,name+'.png')});
   // Cold reload restores authored defaults; visitor controls do not rewrite them.
   await page.reload();await page.waitForFunction(()=>window.tourRuntime?.performanceSettings.pagedExtSplats===true);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Advanced performance',{exact:true}).click();
   await expect(precision).toBeChecked();await expect(page.getByLabel('Resolution cap',{exact:true})).toHaveValue('1.2');
   await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Enter tour',exact:true}).click();await streamed(page);
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS '+name+': late settings, live runtime changes, unrelated tuning, float32 foreground/background streaming, scene changes and cold reload with external requests blocked.');
  }finally{release();await context.close();}
 }
 assert.deepEqual(tourPerformanceSettings(JSON.parse(await fs.readFile(path.join(root,'config/tour.json'),'utf8')).performance),project.performance.defaultSettings);
 await fetch(url+'__unshare',{method:'POST',body:new URLSearchParams({token})});await fetch(url+'__shutdown',{method:'POST',body:new URLSearchParams({token})});assert.deepEqual(await exited,{code:0,signal:null});
 console.log('PASS real SEA launcher, '+(address?'private-interface HTTPS':'loopback HTTPS fallback')+', unchanged saved configuration, no Node on PATH and clean shutdown. Evidence: '+root);
}finally{
 await browser?.close();fallback?.server.closeAllConnections();if(fallback)await new Promise(resolve=>fallback.server.close(resolve));if(!exitResult&&url&&token)await fetch(url+'__shutdown',{method:'POST',body:new URLSearchParams({token})}).catch(()=>{});if(!exitResult)child.kill();await fs.writeFile(path.join(root,'launcher-console.txt'),output);
}
