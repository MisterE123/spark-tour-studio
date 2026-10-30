// Isolated developer verification. Owns only the server and browser it creates.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const {PNG}=createRequire(import.meta.url)('pngjs');
const root=path.resolve('test-output/radix-buffer-growth-standalone'),out=path.resolve('test-output/radix buffer growth '+Date.now());await fs.mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const relative=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html',file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':relative.endsWith('.html')?'text/html':relative.endsWith('.js')?'text/javascript':'application/octet-stream','Cache-Control':'no-store'}).end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port+'/';
const args=['--enable-webgl','--enable-unsafe-webgpu'],browser=await chromium.launch({channel:'msedge',headless:true,args}),results=[];
const watchdog=setTimeout(()=>{void browser.close();},240000);let page;
try{
 const lifecycle=process.argv.includes('--lifecycle');
 if(lifecycle){
  page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{const original=GPUQueue.prototype.onSubmittedWorkDone;let release;const held=new Promise(resolve=>release=resolve);GPUQueue.prototype.onSubmittedWorkDone=function(){window.queueHoldReached=true;return original.call(this).then(()=>held);};window.releaseQueueHold=()=>{GPUQueue.prototype.onSubmittedWorkDone=original;release();};});
  await page.goto(base+'?counts=1024,4096&seconds=1');await page.evaluate(()=>{window.pendingStart=radixRepro.start();});await page.waitForFunction(()=>window.queueHoldReached&&radixRepro.active);
  await page.evaluate(()=>{radixRepro.stop('Canceled while preparing');releaseQueueHold();});await page.evaluate(()=>pendingStart);assert.deepEqual(errors,[],'canceling pending preparation is safe');
  await page.evaluate(()=>{radixRepro.start();});await page.waitForFunction(()=>radixRepro.report.runs.at(-1).frames.length>=5);
  const index=await page.evaluate(()=>{const index=radixRepro.report.runs.length-1;radixRepro.stop('Repeated stop/start fixture');radixRepro.start();return index;});
  await page.waitForFunction(()=>radixRepro.report.runs.at(-1).frames.length>=12);const result=await page.evaluate(index=>{const run=radixRepro.report.runs.at(-1),old=radixRepro.report.runs[index];radixRepro.stop('Lifecycle verified');return {newRafTimes:run.frames.map(f=>f.rafTime),oldFrames:old.frames.length,errors:radixRepro.report.runs.flatMap(r=>r.errors)};},index);
  assert.equal(new Set(result.newRafTimes).size,result.newRafTimes.length,'old RAF cannot create duplicate callbacks on the new run');assert.deepEqual(result.errors,[]);assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'lifecycle.json'),JSON.stringify(result,null,2));console.log('PASS canceled preparation and repeated Stop/Run');await page.close();page=undefined;
 }
 const configs=lifecycle?[{name:'smoke-sort',mode:'sort',counts:'1024,4096,16384',seconds:1,instrument:1},{name:'smoke-render-readback',mode:'render',counts:'65536,262144',seconds:1,instrument:1,readback:1}]:process.argv.includes('--full-only')?[{name:'render-growth',mode:'render',seconds:3,instrument:1}]:[{name:'smoke-sort',mode:'sort',counts:'1024,4096,16384',seconds:1,instrument:1},{name:'sort-growth',mode:'sort',seconds:3,instrument:1},{name:'render-growth',mode:'render',seconds:3,instrument:1},{name:'sort-uninstrumented',mode:'sort',seconds:3,instrument:0}];
 for(const config of configs){
  page=await browser.newPage({viewport:{width:1100,height:850}});const errors=[],logs=[],external=[];page.on('pageerror',error=>errors.push(error.stack||error.message));page.on('console',message=>{if(['error','warning'].includes(message.type()))logs.push(message.text());});page.on('request',request=>{if(!request.url().startsWith(base)&&!request.url().startsWith('data:'))external.push(request.url());});
  const query=new URLSearchParams({...config,autorun:'1'});console.log('START',config.name);await page.goto(base+'?'+query,{waitUntil:'domcontentloaded'});
  const session=await page.context().newCDPSession(page);if(config.name==='render-growth'){await session.send('Profiler.setSamplingInterval',{interval:1000});await session.send('Profiler.enable');await session.send('Profiler.start');}
  if(config.readback){await page.waitForFunction(()=>radixRepro.report.runs.at(-1)?.events.some(e=>e.type==='readback'&&e.count>0),null,{timeout:15000});const pixels=PNG.sync.read(await page.locator('#view canvas').screenshot({path:path.join(out,config.name+'-active.png')}));let lit=0;for(let i=0;i<pixels.data.length;i+=4)if(pixels.data[i+2]>40&&pixels.data[i+1]>25)lit++;assert.ok(lit>100,'visible synthetic splats actually reach the canvas');}
  await page.waitForFunction(()=>window.radixRepro?.finished&&!window.radixRepro.active,null,{timeout:75000});
  const state=await page.evaluate(()=>{const run=radixRepro.finished;return {provenance:radixRepro.report.provenance,environment:radixRepro.report.environment,run:{mode:run.mode,counts:run.counts,seconds:run.seconds,instrument:run.instrument,readback:run.readback,startedAt:run.startedAt,finishedAt:run.finishedAt,completed:run.completed,finishedReason:run.finishedReason,errors:run.errors,stages:run.stages,frames:run.frames,events:run.events,memoryAtEnd:run.memoryAtEnd},table:document.getElementById('summary').innerText,status:document.getElementById('status').textContent};});
  if(config.name==='render-growth'){const profile=await session.send('Profiler.stop');await fs.writeFile(path.join(out,config.name+'-cpu.json.gz'),gzipSync(JSON.stringify(profile)));}
  await page.screenshot({path:path.join(out,config.name+'.png')});
  const result={config,...state,errors,logs,external};results.push(result);await fs.writeFile(path.join(out,config.name+'.json'),JSON.stringify(result,null,2));
  assert.equal(state.environment.caps?.backend,'webgpu','real WebGPU renderer');assert.equal(state.run.completed,true,state.status);assert.deepEqual(errors,[]);assert.deepEqual(state.run.errors,[]);assert.deepEqual(external,[],'standalone uses only local code');assert.equal(state.run.readback,!!config.readback);
  if(config.readback){assert.ok(state.run.events.some(event=>event.type==='readback'&&event.count>0),'explicitly enabled actual visible-count readback succeeds');}else assert.equal(state.run.events.filter(event=>event.type==='readback').length,0);
  if(config.instrument){const growth=state.run.events.filter(e=>e.type==='bufferCapacity'&&state.run.stages[e.stage]?.pass==='growth'),replay=state.run.events.filter(e=>e.type==='bufferCapacity'&&state.run.stages[e.stage]?.pass==='replay');assert.ok(growth.length>0,'actual sorter capacity grows');assert.equal(replay.length,0,'fixed-capacity replay does not grow');assert.ok(state.run.events.some(e=>e.type==='createBuffer'),'actual allocation calls captured');}
  console.log('PASS',config.name,state.environment.adapterInfo,'maxCPU',Math.max(...state.run.frames.filter(f=>f.pass!=='warmup').map(f=>f.cpu)));await page.close();page=undefined;
 }
 await fs.writeFile(path.join(out,'result.json'),JSON.stringify({browser:browser.version(),args,confound:'Existing user Studio/import remains running. Shared GPU contention is possible and no other process was stopped.',results},null,2));console.log('PASS',out);
}catch(error){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:error.stack,results},null,2));if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw error;}
finally{clearTimeout(watchdog);await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
