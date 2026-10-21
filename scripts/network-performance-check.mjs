import {chromium,expect} from '@playwright/test';
import fs from 'node:fs/promises';import path from 'node:path';import https from 'node:https';
import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {blankProject,newScene} from '../shared/project.mjs';
import {defaultPerformance,tourPerformanceSettings} from '../shared/performance.mjs';
import {radFixture} from '../tests/fixtures.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256} from '../shared/paged-collision.mjs';

// Reproduce Settings opening before the configuration arrives on a cold network
// visit, using the real exported launcher and float32 paged foreground/background.
const root=path.resolve('test-output','network performance '+Date.now()),center=1024.125,descriptionLink='https://example.test/history/'+('long-unbroken-reference-'.repeat(10))+'?record=1&section=2';
await fs.mkdir(path.join(root,'config'),{recursive:true});await fs.cp('dist',root,{recursive:true});
await fs.copyFile('launcher/Launch Tour.exe',path.join(root,'Launch Tour.exe'));
const project=blankProject();project.description='Credits\nRead more: '+descriptionLink+'.\nPlain <strong>text</strong> stays text.';project.scenes=['a','b'].map(id=>{
 const scene=newScene(id,'Network scene '+id,'scene.rad');scene.transform.position=[-center,0,0];scene.viewpoints[0].position=[center,1.7,3];
 scene.background={type:'splat',source:'scene.rad',transform:{position:[-center,0,-2],rotation:[0,0,0],scale:1}};return scene;
});project.startScene='a';project.performance=defaultPerformance();
// A cold walking scene must load real .scv pages through the same shared HTTPS
// server as its manifest. A GLB-only fixture misses the sharing extension filter.
const {PagedCollisionWriter}=createRequire(import.meta.url)('../desktop/paged-collision.cjs'),writer=await PagedCollisionWriter.create(root);
const occupied=[];for(let x=0;x<40;x++)for(let y=0;y<15;y++)for(let z=0;z<40;z++)occupied.push(collisionCellId(x,y,z,40));
const collisionBytes=encodeCollisionTile({coord:[0,0,0],tileCells:40,occupied}),entry={key:'0,0,0',coord:[0,0,0],url:'tiles/0_0_0.scv',bytes:collisionBytes.length,sha256:await collisionSha256(collisionBytes),bounds:collisionTileBounds([0,0,0],8),voxels:occupied.length};
await writer.writeTile(entry,collisionBytes);
const collisionRef=await writer.finalize({format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.2,tileCells:40,tileSize:8,coordinateSystem:'generation',sourceTransform:{position:[0,0,0],rotation:[0,0,0],scale:1},bounds:{min:[0,0,0],max:[8,8,8]},tiles:[entry]});
const walk=newScene('walk','Shared walking scene','scene.rad');walk.collider=collisionRef;walk.modes=['explore','fly'];walk.viewpoints[0].position=[4,1.7,4];project.scenes.push(walk);
// The saved custom tour profile deliberately differs from its named preset,
// matching the user's export without copying any of their capture or media.
project.performance.defaultSettings={...project.performance.presets[0].settings,pagedExtSplats:true,pixelRatio:1.2,maxSh:1};
const config=JSON.stringify(project);await fs.writeFile(path.join(root,'config/tour.json'),config);await fs.writeFile(path.join(root,'config/hosting.json'),'{}');
const {rad,chunk}=radFixture('scene.radc'),offset=8+Math.ceil(chunk.readUInt32LE(4)/8)*8+8;chunk.writeFloatLE(center,offset);
await fs.writeFile(path.join(root,'scene.rad'),rad);await fs.writeFile(path.join(root,'scene.radc'),chunk);
const child=spawn(path.join(root,'Launch Tour.exe'),['--no-open'],{cwd:root,windowsHide:true,env:{...process.env,LOCALAPPDATA:path.join(root,'certificate-cache'),PATH:path.join(process.env.SystemRoot,'System32')},stdio:['ignore','pipe','pipe']});
let output='',exitResult;child.stderr.on('data',c=>output+=c);child.stdout.on('data',c=>output+=c);
const exited=new Promise(resolve=>child.once('exit',(code,signal)=>{exitResult={code,signal};resolve(exitResult);}));
const get=url=>new Promise((resolve,reject)=>https.get(url,{rejectUnauthorized:false},res=>{const chunks=[];res.on('data',b=>chunks.push(b));res.on('end',()=>{const bytes=Buffer.concat(chunks);resolve({status:res.statusCode,headers:res.headers,body:bytes.toString(),bytes});});}).on('error',reject));
let browser,url,token,fallback;
async function streamed(page){
 await page.evaluate(()=>window.tourRuntime.performanceTransition);
 await page.waitForFunction(()=>{const r=window.tourRuntime,loaded=mesh=>{const s=mesh?.paged,p=s?.pager,e=p?.getSplatsChunk(s,0);return p?.extSplats===true&&e&&p.packedTexture.value.image.data[e.page*p.pageSplats*4]!==0;};return r?.ready&&r.spark.display.numSplats>0&&loaded(r.mesh)&&loaded(r.backgroundLayer.mesh);},null,{timeout:60000});
 assert.deepEqual(await page.evaluate(()=>{const r=window.tourRuntime,read=mesh=>{const s=mesh.paged,p=s.pager,e=p.getSplatsChunk(s,0);return new Float32Array(new Uint32Array([p.packedTexture.value.image.data[e.page*p.pageSplats*4]]).buffer)[0];};return [read(r.mesh),read(r.backgroundLayer.mesh),r.mesh.paged.pager===r.backgroundLayer.mesh.paged.pager];}),[center,center,true]);
}
async function landingDescriptionFits(page){
 const bounds=await page.locator('.title-copy .lead').evaluate(element=>{const box=element.getBoundingClientRect(),panel=element.closest('.title-copy').getBoundingClientRect();return {left:box.left,right:box.right,panelLeft:panel.left,panelRight:panel.right,scroll:element.scrollWidth,width:element.clientWidth,whiteSpace:getComputedStyle(element).whiteSpace,viewport:innerWidth,screen:document.querySelector('.title-screen').scrollWidth};});
 assert.ok(bounds.left>=bounds.panelLeft&&bounds.right<=bounds.panelRight+1&&bounds.scroll<=bounds.width+1&&bounds.screen<=bounds.viewport+1,'long landing description stays within its panel and viewport: '+JSON.stringify(bounds));assert.equal(bounds.whiteSpace,'pre-wrap');
}
try{
 url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Launcher startup timed out: '+output)),20000);const done=()=>{const match=output.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match){clearTimeout(timer);child.stdout.off('data',done);resolve(match[0]);}};child.stdout.on('data',done);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',code=>{clearTimeout(timer);reject(Error('Launcher exited during startup: '+code));});done();});
 const control=await(await fetch(url+'__launcher')).text();token=control.match(/name="token" value="([a-f0-9]+)"/)[1];
 const address=control.match(/<option value="([0-9.]+)">/)?.[1];let shareUrl;
 if(address){const shared=await(await fetch(url+'__share',{method:'POST',body:new URLSearchParams({token,address})})).text();shareUrl=shared.match(/https:\/\/[0-9.]+:\d+\//)?.[0];assert.ok(shareUrl,'Launcher must show the HTTPS sharing address');}
 else{const {startSharing}=createRequire(import.meta.url)('../launcher/sharing.cjs');fallback=await startSharing({root,host:'127.0.0.1',port:0,cacheRoot:path.join(root,'certificate-cache')});shareUrl=fallback.url;console.log('No private interface on this test host; HTTPS browser regression uses the sharing server on loopback.');}
 const remote=await get(shareUrl+'config/tour.json');assert.equal(remote.status,200);assert.equal(remote.body,config);assert.equal(await(await fetch(url+'config/tour.json')).text(),config);assert.equal(remote.headers['cache-control'],'no-cache');
 const collisionUrl=new URL(entry.url,new URL(collisionRef,shareUrl)).href,collision=await get(collisionUrl);assert.equal(collision.status,200,'shared HTTPS must serve paged collision .scv files, not just their JSON manifest');assert.deepEqual(collision.bytes,Buffer.from(collisionBytes));
 browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 for(const [name,site,options] of [
  ['desktop-local',url,{viewport:{width:1100,height:900}}],
  ['quest-style-https',shareUrl,{viewport:{width:1000,height:700},isMobile:true,hasTouch:true,deviceScaleFactor:1.5,userAgent:'Mozilla/5.0 (Linux; Android 12; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/40.0.0.0.0 Chrome/138.0.0.0 VR Safari/537.36'}],
  ['mobile-landscape-https',shareUrl,{viewport:{width:915,height:412},isMobile:true,hasTouch:true,deviceScaleFactor:1,userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36'}]
 ]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,...options}),page=await context.newPage(),errors=[],external=[];page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
  // Fulfill the external reference locally; exercising a real new-tab click
  // must not contact another service or change the tour's top-level document.
  await context.route('https://example.test/**',route=>route.fulfill({contentType:'text/html',body:'<title>External reference fixture</title><p>External reference</p>'}));
  const tourControls=async()=>{const toggle=page.getByRole('button',{name:'Tour controls',exact:true});if(await toggle.count())await toggle.click();};
  let release,releaseCollision;const gate=new Promise(resolve=>release=resolve),collisionGate=new Promise(resolve=>releaseCollision=resolve);let delayed=true,collisionRequests=0;const collisionResponses=[];
  page.on('response',response=>{if(response.url().endsWith('.scv'))collisionResponses.push(response.status());});
  await page.route('**/*',async route=>{const request=route.request().url();if(!request.startsWith(site)&&!request.startsWith('blob:')&&!request.startsWith('data:')){external.push(request);return route.abort();}if(delayed&&request===site+'config/tour.json'){await gate;delayed=false;}if(request.endsWith('.scv')){collisionRequests++;await collisionGate;}return route.continue();});
  try{
   await page.goto(site+'?diagnostics=1',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Settings',exact:true}).click();
   await expect(page.getByText('Loading tour settings…',{exact:true})).toBeVisible();await expect(page.getByLabel('Extended splat precision (ExtSplats)',{exact:true})).toHaveCount(0);release();
   await page.waitForFunction(()=>window.tourRuntime?.performanceSettings.pagedExtSplats===true);
   const description=page.locator('.title-copy .lead'),link=description.getByRole('link',{name:descriptionLink,exact:true});await expect(link).toHaveAttribute('href',descriptionLink);await expect(link).toHaveAttribute('target','_blank');assert.match(await link.getAttribute('rel'),/noopener/);assert.equal(await description.textContent(),project.description);assert.equal(await description.locator('strong').count(),0);
   await page.getByText('Advanced performance',{exact:true}).click();const precision=page.getByLabel('Extended splat precision (ExtSplats)',{exact:true}),preset=page.getByLabel('Performance preset',{exact:true});
   await expect(precision).toBeChecked();await expect(preset).toHaveValue('');await page.getByLabel('Resolution cap',{exact:true}).fill('1.4');
   assert.deepEqual(await page.evaluate(()=>[window.tourRuntime.performanceSettings.pagedExtSplats,window.tourRuntime.spark.pagedExtSplats,window.tourRuntime.performanceSettings.pixelRatio]),[true,true,1.4]);
   // Settings must also reflect live changes made by the XR runtime/menu.
   await page.evaluate(()=>{window.tourRuntime.setQuality(.8);});await expect(page.getByLabel('Detail multiplier',{exact:true})).toHaveValue('0.8');
   await page.evaluate(settings=>{window.tourRuntime.applyPerformance(settings);},project.performance.presets[1].settings);
   await expect(precision).not.toBeChecked();await preset.selectOption('balanced');await expect(preset).toHaveValue('balanced');await precision.check();
   await page.getByRole('button',{name:'Close settings',exact:true}).click();
   await landingDescriptionFits(page);
   if(name==='mobile-landscape-https'){for(const size of [{width:390,height:844},{width:320,height:568}]){await page.setViewportSize(size);await landingDescriptionFits(page);await page.screenshot({path:path.join(root,'description-'+size.width+'.png')});}await page.setViewportSize(options.viewport);await landingDescriptionFits(page);}
   const popupReady=context.waitForEvent('page');await link.click();const popup=await popupReady;await popup.waitForLoadState('domcontentloaded');assert.equal(popup.url(),descriptionLink);assert.equal(await popup.evaluate(()=>window.opener),null);await expect(popup).toHaveTitle('External reference fixture');await popup.close();assert.equal(page.url(),site+'?diagnostics=1');await expect(page.getByRole('button',{name:'Enter tour',exact:true})).toBeVisible();
   await page.screenshot({path:path.join(root,name+'-description.png')});await page.getByRole('button',{name:'Enter tour',exact:true}).click();await streamed(page);
   await tourControls();await page.getByLabel('Scene',{exact:true}).selectOption('b');await page.waitForFunction(()=>window.tourRuntime.active?.id==='b'&&window.tourRuntime.ready);await streamed(page);
   await tourControls();await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Advanced performance',{exact:true}).click();await expect(precision).toBeChecked();
   await page.getByLabel('Resolution cap',{exact:true}).fill('1.3');await streamed(page);await page.screenshot({path:path.join(root,name+'.png')});
   // Cold reload restores authored defaults; visitor controls do not rewrite them.
   await page.reload();await page.waitForFunction(()=>window.tourRuntime?.performanceSettings.pagedExtSplats===true);await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByText('Advanced performance',{exact:true}).click();
   await expect(precision).toBeChecked();await expect(page.getByLabel('Resolution cap',{exact:true})).toHaveValue('1.2');
   await page.getByRole('button',{name:'Close settings',exact:true}).click();await page.getByRole('button',{name:'Enter tour',exact:true}).click();await streamed(page);
   // Enter Walk directly from authored-view mode in another scene, on a
   // cold cache. Delayed Wi-Fi must wait for verified data rather than rejecting
   // a valid walking start or falling back to Drone.
   await tourControls();await page.getByLabel('Scene',{exact:true}).selectOption('walk');await expect.poll(()=>collisionRequests,{timeout:60000}).toBeGreaterThan(0);
   await page.waitForFunction(()=>{const r=window.tourRuntime;return r.preparingMode&&!!r.loading;},null,{timeout:60000});
   await page.waitForTimeout(250);assert.ok(await page.evaluate(()=>{const r=window.tourRuntime;return r.preparingMode&&!r.navigationFailure&&!!r.loading;}),'cold walking entry waits for its delayed collision page');releaseCollision();
   await page.waitForFunction(()=>{const r=window.tourRuntime;return r.active?.id==='walk'&&r.sceneResourcesReady&&!r.loading&&!r.preparingMode;},null,{timeout:60000});
   const before=await page.evaluate(()=>{const r=window.tourRuntime;return {mode:r.mode,status:r.status,ready:r.ready,failure:r.navigationFailure,body:{...r.body.translation()},allowed:r.pagedCollider.allows(r.body.translation(),.6,.24),pages:r.pagedCollider.residentTiles,triangles:r.pagedCollider.physicsTriangles};});
   assert.equal(before.mode,'explore');assert.equal(before.status,'');assert.equal(before.failure,false);assert.ok(before.ready&&before.allowed&&before.pages>0&&before.triangles>0);assert.ok(collisionResponses.length>0&&collisionResponses.every(status=>status===200));
   if(options.hasTouch){const pad=page.getByLabel('Touch movement pad',{exact:true});await pad.waitFor();const box=await pad.boundingBox(),touch=await context.newCDPSession(page);try{await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width*.5,y:box.y+box.height*.2,radiusX:2,radiusY:2}]});await page.waitForFunction(start=>{const p=window.tourRuntime.body.translation();return Math.hypot(p.x-start.x,p.z-start.z)>.2;},before.body);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}finally{await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}).catch(()=>{});await touch.detach();}}
   else{await page.evaluate(()=>window.tourRuntime.renderer.domElement.focus());await page.keyboard.down('w');try{await page.waitForFunction(start=>{const p=window.tourRuntime.body.translation();return Math.hypot(p.x-start.x,p.z-start.z)>.2;},before.body);}finally{await page.keyboard.up('w');}}
   await page.waitForTimeout(100);const after=await page.evaluate(()=>{const r=window.tourRuntime;return {mode:r.mode,body:{...r.body.translation()},grounded:r.walking.grounded,allowed:r.pagedCollider.allows(r.body.translation(),.6,.24),failures:r.pagedCollider.stream.failures.size};});assert.equal(after.mode,'explore');assert.ok(after.grounded&&after.allowed);assert.equal(after.failures,0);assert.ok(Math.abs(after.body.y-.87)<.04);assert.ok(Math.hypot(after.body.x-before.body.x,after.body.z-before.body.z)>.2);
   await page.screenshot({path:path.join(root,name+'-walk.png')});await fs.writeFile(path.join(root,name+'-walk.json'),JSON.stringify({before,after,collisionRequests,collisionResponses},null,2));
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);console.log('PASS '+name+': saved precision, cold reload, delayed paged collision entry and grounded keyboard/touch walking with external requests blocked.');
  }finally{release();releaseCollision();await context.close();}
 }
 assert.deepEqual(tourPerformanceSettings(JSON.parse(await fs.readFile(path.join(root,'config/tour.json'),'utf8')).performance),project.performance.defaultSettings);
 await fetch(url+'__unshare',{method:'POST',body:new URLSearchParams({token})});await fetch(url+'__shutdown',{method:'POST',body:new URLSearchParams({token})});assert.deepEqual(await exited,{code:0,signal:null});
 console.log('PASS real SEA launcher, '+(address?'private-interface HTTPS':'loopback HTTPS fallback')+', unchanged saved configuration, no Node on PATH and clean shutdown. Evidence: '+root);
}finally{
 await browser?.close();fallback?.server.closeAllConnections();if(fallback)await new Promise(resolve=>fallback.server.close(resolve));if(!exitResult&&url&&token)await fetch(url+'__shutdown',{method:'POST',body:new URLSearchParams({token})}).catch(()=>{});if(!exitResult)child.kill();await fs.writeFile(path.join(root,'launcher-console.txt'),output);
}
