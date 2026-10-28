import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';
import {createServer} from 'vite';import {chromium} from '@playwright/test';

const output=path.resolve('test-output','stage lifecycle '+Date.now());await fs.mkdir(output,{recursive:true});
const bridge=path.join(output,'entry.tsx');await fs.writeFile(bridge,"export {default as React} from 'react';export {createRoot} from 'react-dom/client';export {Stage} from '/src/ui.tsx';");
const server=await createServer({configFile:false,root:process.cwd(),cacheDir:path.join(output,'.vite'),optimizeDeps:{entries:['src/ui.tsx','src/runtime-loader.ts'],include:['react','react-dom/client']},server:{host:'127.0.0.1',port:0,watch:null},plugins:[{name:'stage-lifecycle',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/lifecycle')){res.setHeader('Content-Type','text/html');res.end('<html><body style="margin:0"><main id="mount" style="height:100vh"></main></body></html>');}else next();});}}]});await server.listen();
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});let release=()=>{};
try{
 const page=await browser.newPage({viewport:{width:1000,height:750}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.contextCanvases=[];const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...options){const context=Reflect.apply(original,this,[type,...options]);if(context&&/webgl/i.test(type)&&!window.contextCanvases.includes(this))window.contextCanvases.push(this);return context;};});
 let held=false,imports=0;const gate=new Promise(resolve=>release=resolve);await page.route('**/src/runtime.ts*',async route=>{imports++;held=true;await gate;await route.continue();});
 await page.goto('http://127.0.0.1:'+server.httpServer.address().port+'/lifecycle?diagnostics=1');
 await page.evaluate(async bridge=>{
  const {React,createRoot,Stage}=await import(bridge);
  let root;window.callbacks=[];window.disposals=0;window.loopStops=0;window.latest=null;
  window.renderStage=version=>{root??=createRoot(document.getElementById('mount'));root.render(React.createElement(React.StrictMode,null,React.createElement(Stage,{onReady:runtime=>{window.callbacks.push({version,ready:!!runtime});window.latest=runtime;if(runtime&&!runtime.testDispose){runtime.testDispose=true;const dispose=runtime.dispose.bind(runtime),loop=runtime.renderer.setAnimationLoop.bind(runtime.renderer);runtime.renderer.setAnimationLoop=value=>{if(value===null)window.loopStops++;return loop(value);};runtime.dispose=()=>{window.disposals++;return dispose();};}}})));};
  window.unmountStage=()=>{root?.unmount();root=undefined;};window.renderStage(1);
 },'/'+path.relative(process.cwd(),bridge).replaceAll('\\','/'));
 for(let i=0;i<200&&!held;i++)await page.waitForTimeout(10);assert.ok(held,'Stage warms automatically without a visitor action');
 assert.equal(await page.evaluate(()=>window.contextCanvases.length),0);await page.evaluate(()=>window.unmountStage());release();
 await page.evaluate(async()=>{await(await import('/src/runtime-loader.ts')).loadTourRuntime();});await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.contextCanvases.length),0,'a canceled Stage never creates a renderer when the late module arrives');assert.equal(await page.locator('canvas').count(),0);
 await page.evaluate(()=>window.renderStage(2));await page.waitForFunction(()=>!!window.latest);
 await page.evaluate(()=>{window.originalRuntime=window.latest;window.originalCanvas=window.latest.renderer.domElement;window.renderStage(3);});await page.waitForTimeout(100);
 const live=await page.evaluate(()=>({contexts:window.contextCanvases.length,canvases:document.querySelectorAll('.stage canvas').length,sameRuntime:window.latest===window.originalRuntime,sameCanvas:window.originalCanvas===document.querySelector('.stage canvas'),disposals:window.disposals,readyCallbacks:window.callbacks.filter(value=>value.ready)}));
 assert.equal(live.contexts,1,'StrictMode and callback rerenders create one renderer');assert.equal(live.canvases,1);assert.ok(live.sameRuntime&&live.sameCanvas);assert.equal(live.disposals,0);assert.deepEqual(live.readyCallbacks,[{version:2,ready:true}]);assert.equal(imports,1,'canceled and live consumers share one runtime import');
 await page.evaluate(()=>window.unmountStage());const closed=await page.evaluate(()=>({canvases:document.querySelectorAll('canvas').length,disposals:window.disposals,stops:window.loopStops,callback:window.callbacks.at(-1),latest:window.latest}));
 assert.equal(closed.canvases,0);assert.equal(closed.disposals,1);assert.equal(closed.stops,1);assert.deepEqual(closed.callback,{version:3,ready:false},'cleanup uses the latest callback without restarting the runtime');assert.equal(closed.latest,null);assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(output,'result.json'),JSON.stringify({imports,live,closed,errors},null,2));console.log('PASS canceled warm-up, StrictMode, one renderer/canvas/import, callback rerenders and exact unmount disposal/loop shutdown. '+output);
}finally{release();await browser.close();await server.close();}
