import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';
import {sogLodFixture} from '../tests/sog-fixtures.mjs';

const out = path.resolve('test-output', 'radix stream recovery ' + Date.now());
await fs.mkdir(out, {recursive:true});
const files = sogLodFixture().files;
const sourceMeta = JSON.parse(Buffer.from(files['0_0/meta.json']));
const dimSH = Buffer.from('UklGRh4AAABXRUJQVlA4TBEAAAAvD8ADEAfQ/+pXvw2BiOh/AAA=', 'base64'); // 16x16 SH0, alpha 13/255.
const bound = {min:[-2,0,-11], max:[2,3,11]};
const names = ['base', ...Array.from({length:8}, (_,i) => (i<4?'north':'south')+i)];
const manifest = {
  lodLevels:2, filenames:names.map(name=>name+'/meta.json'),
  tree:{bound, children:names.slice(1).map((name,i)=>{
    const x=(i%4-1.5)*.25, z=name.startsWith('north')?-10:10;
    return {bound:{min:[x-.15,1.5,z-.2],max:[x+.15,1.9,z+.2]},lods:{0:{file:i+1,offset:0,count:20},1:{file:0,offset:i,count:1}}};
  })}
};
const blankManifest={lodLevels:1,filenames:['base/meta.json'],tree:{bound,lods:{0:{file:0,offset:0,count:256}}}};
// Use actual Three presentation, CPU sorting, SOG textures and HTTP requests.
// A tiny budget makes the rows of the selected and displayed ranges auditable.
const harness = `
import * as THREE from 'three';
import {createRadixBackend} from './src/rendering/radix/index';
const backend=await createRadixBackend({backend:'webgpu-gl',xr:false,settings:{pixelRatio:1,sortMode:'cpu',selectedSplatBudget:87,lodBudgetMode:'limit',lodBaseDistance:24,lodBehindPenalty:8,lodUnderfill:0,coverage:{mode:'whole-scene'},viewPriority:true}});
backend.renderer.setSize(192,192);document.body.append(backend.renderer.domElement);
const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(45,1,.01,100);scene.add(backend.node);camera.position.y=1.7;
const t=window.t={backend,camera,frames:0,errors:[],asset:null,
  load:async(which)=>{t.asset?.dispose();t.asset=backend.createAsset('/'+which+'/lod-meta.json',{onError:e=>t.errors.push(e.message)});scene.add(t.asset);await t.asset.initialized;},
  state:()=>{const a=t.asset,s=a.stream,order=backend.node.view?.order;return {frames:t.frames,shown:a.stats.shown,visible:order?.visible,sorted:!!order&&order.collection===backend.node.collection,presented:backend.hasPresented(a),base:s.baseReady,failed:a.stats.failed,levels:Array.from(s.inspect().shown),wanted:Array.from(s.inspect().desired)};}
};
backend.renderer.setAnimationLoop(now=>{try{backend.update(camera,now);backend.renderer.render(scene,camera);backend.markRendered();t.frames++;}catch(e){t.errors.push(e.message);}});
`;
const app=(await build({stdin:{contents:harness,resolveDir:process.cwd()},write:false,bundle:true,format:'esm',platform:'browser',target:'es2022'})).outputFiles[0].contents;
const requested=[],channels=[],held=new Set(),pageErrors=[];
const server=http.createServer((req,res)=>{
  const url=req.url;
  if(url==='/'){res.setHeader('Content-Type','text/html');res.end('<link rel="icon" href="data:,"><script type="module" src="/app.js"></script>');return;}
  if(url==='/app.js'){res.setHeader('Content-Type','text/javascript');res.end(app);return;}
  if(url==='/tour/lod-meta.json'||url==='/blank/lod-meta.json'){res.end(JSON.stringify(url.startsWith('/tour')?manifest:blankManifest));return;}
  const match=url.match(/^\/(tour|blank)\/(base|north[0-3]|south[4-7])\/(.+)$/);
  if(!match){res.writeHead(404).end();return;}
  const [,kind,name,file]=match;
  if(file==='meta.json'){
    requested.push(kind+'/'+name);
    if(kind==='tour'&&name.startsWith('north')){
      held.add(res);res.on('close',()=>held.delete(res));return;
    }
    const meta=structuredClone(sourceMeta),sign=name.startsWith('south')?1:-1;
    meta.means.mins[2]=sign*Math.log1p(10)-.002;meta.means.maxs[2]=sign*Math.log1p(10)+.002;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify(meta));return;
  }
  channels.push(kind+'/'+name+'/'+file);
  const bytes=kind==='blank'&&file==='sh0.webp'?dimSH:files['0_0/'+file];
  if(!bytes){res.writeHead(404).end();return;}
  res.setHeader('Content-Type','image/webp');res.end(bytes);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
  browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge',headless:true,args:['--enable-webgl','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
  const page=await browser.newPage();page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.waitForFunction(()=>window.t);
  await page.evaluate(()=>t.load('tour'));
  await page.waitForFunction(()=>t.state().base&&t.state().presented);
  const start=await page.evaluate(()=>t.state());
  const until=Date.now()+8000;
  while(held.size!==4&&Date.now()<until) await new Promise(r=>setTimeout(r,25));
  assert.equal(held.size,4,'coarse is drawn while all four north metadata requests remain pending');
  await page.evaluate(()=>{t.camera.rotation.y=Math.PI;});
  await page.waitForFunction(()=>t.state().levels.slice(0,4).every(v=>v===0)&&t.state().presented);
  const turned=await page.evaluate(()=>t.state());
  assert.equal(turned.shown,84);assert.equal(turned.failed,0);assert.equal(held.size,0);
  assert.equal(channels.filter(x=>x.includes('/north')).length,0,'aborted old direction never downloads its channels');
  await page.evaluate(()=>{t.camera.rotation.y=0;});
  await page.waitForFunction(()=>t.state().wanted.slice(4).every(v=>v===0));
  await page.evaluate(()=>{t.camera.rotation.y=Math.PI;});
  await page.waitForFunction(()=>t.state().levels.slice(0,4).every(v=>v===0));
  assert.equal(requested.filter(x=>x==='tour/base').length,1);
  assert.equal(requested.filter(x=>x.startsWith('tour/south')).length,4,'reversing keeps the newly resident detail');
  await page.evaluate(async()=>{t.camera.rotation.y=0;t.backend.applySettings({minAlpha:.10});await t.load('blank');});
  await page.waitForFunction(()=>t.state().sorted&&t.state().visible===0&&t.state().presented);
  const empty=await page.evaluate(()=>t.state());assert.equal(empty.shown,256);
  await page.evaluate(()=>{t.backend.applySettings({minAlpha:.001});t.camera.position.x+=.12;});
  await page.waitForFunction(()=>t.state().visible>0&&t.state().presented);
  const visible=await page.evaluate(()=>t.state());assert.equal(visible.visible,256);
  assert.deepEqual(await page.evaluate(()=>t.errors),[]);assert.deepEqual(pageErrors,[]);
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify({start,turned,empty,visible,requested,channels},null,2));
  console.log('PASS real CPU first-view presentation, streamed direction changes and cancellation: '+out);
}finally{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
