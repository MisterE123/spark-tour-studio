import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
import {blankProject,newScene} from '../shared/project.mjs';import {radFixture} from './fixtures.mjs';
const require=createRequire(import.meta.url),{CollisionDiagnostics,DIRECTORY,MAX_BYTES,MAX_LOGS}=require('../desktop/collision-diagnostics.cjs'),{PagedCollisionWriter}=require('../desktop/paged-collision.cjs'),{startServer,privateStateFile}=require('../desktop/server.cjs'),{collectTourFiles,ignored}=require('../desktop/tour-files.cjs'),{exportTour}=require('../desktop/export.cjs');
const input=()=>({sceneId:'scene',source:'https://user:password@assets.example/scene.rad?token=secret#private',format:'paged',scope:'selected',volumeCount:1,hasBounds:false,options:{detail:.05,pageSize:8,wallHeight:5,extrudeUp:true,ignoreTransparent:true,opacityCutoff:.27,surface:'smooth',smoothing:.35},annotations:'Never record this annotation'});
const temporary=()=>fs.mkdtemp(path.join(os.tmpdir(),'spark-collision-diagnostics-'));
const records=async log=>(await fs.readFile(log.file,'utf8')).trim().split('\n').map(line=>JSON.parse(line));

test('collision diagnostics retain bounded worker-error evidence after generation staging is aborted',async()=>{const root=await temporary();try{
 const log=await CollisionDiagnostics.create(root,input(),'1.19.2'),writer=await PagedCollisionWriter.create(root);await writer.append('0,0,0',new Uint32Array([0]));
 for(let i=0;i<1000;i++)await log.append({type:'phase',phase:'Scanning original splats',completed:i,total:1000});
 await writer.abort();await log.append({type:'error',message:'Worker failed requesting https://name:pass@assets.example/chunk.radc?signature=secret#key',annotations:'Do not record'});
 const lines=await records(log);assert.deepEqual(lines.map(line=>line.type),['start','phase','error']);assert.equal(lines[0].source,'https://assets.example/scene.rad');assert.equal(lines[0].options.pageSize,8);assert.match(lines.at(-1).message,/Worker failed/);const text=await fs.readFile(log.file,'utf8');assert.doesNotMatch(text,/secret|password|signature|annotation|name:pass/i);assert.ok(Buffer.byteLength(text)<MAX_BYTES);assert.deepEqual(await fs.readdir(path.join(root,'colliders')),[]);assert.equal(await log.append({type:'phase',phase:'late'}),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}});

test('diagnostic events validate permitted fields and retain success/cancellation with limited file retention',async()=>{const root=await temporary();try{
 await assert.rejects(CollisionDiagnostics.create(root,{...input(),format:'unsafe'}),/summary/);
 const log=await CollisionDiagnostics.create(root,input());assert.throws(()=>log.append({type:'phase',completed:Infinity}),/progress/);assert.throws(()=>log.append({type:'arbitrary',message:'bad'}),/event/);assert.throws(()=>log.append({type:'error',message:'x'.repeat(65537)}),/text/);await log.append({type:'success',ref:'colliders/result/scene.collision.json?token=secret',stats:{selected:10,voxels:200,triangles:0}});assert.equal((await records(log)).at(-1).ref,'colliders/result/scene.collision.json');
 for(let i=0;i<MAX_LOGS+2;i++){const next=await CollisionDiagnostics.create(root,input());await next.append({type:'cancelled',message:'Collision generation cancelled.'});}
 const names=await fs.readdir(path.join(root,DIRECTORY));assert.equal(names.length,MAX_LOGS);for(const name of names)assert.equal(JSON.parse((await fs.readFile(path.join(root,DIRECTORY,name),'utf8')).trim().split('\n').at(-1)).type,'cancelled');
 }finally{await fs.rm(root,{recursive:true,force:true});}});

test('bounded phase output reserves enough space for a final multibyte failure message',async()=>{const root=await temporary(),originalNow=Date.now;try{
 const log=await CollisionDiagnostics.create(root,input());let clock=originalNow();Date.now=()=>clock;
 for(let i=0;i<600;i++){clock+=1001;await log.append({type:'phase',phase:'界'.repeat(256),completed:i,total:600});}
 await log.append({type:'error',message:'界'.repeat(6000),ref:'界'.repeat(2048)});const lines=await records(log);assert.equal(lines.at(-1).type,'error');assert.ok((await fs.stat(log.file)).size<=MAX_BYTES);assert.ok(lines.length<512);assert.equal(lines.at(-1).message.length,6000);
 }finally{Date.now=originalNow;await fs.rm(root,{recursive:true,force:true});}});

test('diagnostics reject a redirected project folder and local HTTP never serves their contents',async()=>{const root=await temporary();let server;try{
 const projectRoot=path.join(root,'project'),outside=path.join(root,'outside');await fs.mkdir(projectRoot);await fs.mkdir(outside);await fs.symlink(outside,path.join(projectRoot,DIRECTORY),process.platform==='win32'?'junction':'dir');await assert.rejects(CollisionDiagnostics.create(projectRoot,input()),/leaves the project/);assert.deepEqual(await fs.readdir(outside),[]);await fs.unlink(path.join(projectRoot,DIRECTORY));
 const log=await CollisionDiagnostics.create(projectRoot,input());await log.append({type:'error',message:'Example worker failure'});const running=await startServer({root:projectRoot});server=running.server;
 for(const name of [log.relativePath,DIRECTORY.toUpperCase()+'/'+path.basename(log.file),DIRECTORY+'. /'+path.basename(log.file)]){assert.ok(privateStateFile(name));assert.equal((await fetch(new URL(name,running.url))).status,403);}
 assert.equal((await fetch(new URL(log.relativePath,running.url),{method:'HEAD'})).status,403);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await fs.rm(root,{recursive:true,force:true});}});

test('diagnostics stay out of tour history and exports, including custom page directories and explicit references',async()=>{const root=await temporary();try{
 const projectRoot=path.join(root,'project'),dist=path.join(root,'dist');await fs.mkdir(projectRoot);for(const dir of ['assets','licenses'])await fs.mkdir(path.join(dist,dir),{recursive:true});await fs.writeFile(path.join(dist,'index.html'),'test');await fs.writeFile(path.join(projectRoot,'scene.rad'),radFixture().rad);
 const log=await CollisionDiagnostics.create(projectRoot,input());await log.append({type:'error',message:'Worker failed'});assert.ok(ignored(log.relativePath));
 await fs.mkdir(path.join(projectRoot,'content',DIRECTORY),{recursive:true});await fs.writeFile(path.join(projectRoot,'content','index.html'),'<p>Local content</p>');await fs.copyFile(log.file,path.join(projectRoot,'content',DIRECTORY,'copied.jsonl'));
 const project=blankProject(),scene=newScene('scene','Scene','scene.rad');project.scenes=[scene];project.startScene='scene';project.pages=[{id:'page',title:'Content',html:'content/index.html',blocks:[]}];scene.hotspots=[{id:'bubble',kind:'page',target:'page',label:'Content',position:[0,0,0]}];
 let inventory=await collectTourFiles({projectRoot,project});assert.deepEqual(inventory.missing,[]);assert.ok(inventory.files.every(file=>!file.path.includes(DIRECTORY)));
 const options={project,hosting:{assetBaseUrl:'./',sceneUrls:{}},projectRoot,sources:{},dist,portable:true,websiteOnly:true};const destination=path.join(root,'export');await exportTour({...options,destination});await assert.rejects(fs.access(path.join(destination,DIRECTORY)));await assert.rejects(fs.access(path.join(destination,'content',DIRECTORY)));
 project.cover=log.relativePath;inventory=await collectTourFiles({projectRoot,project});assert.match(inventory.missing.join('\n'),/Private editor files cannot be used as tour assets/);await assert.rejects(exportTour({...options,destination:path.join(root,'explicit')}),/Private editor files/);
 }finally{await fs.rm(root,{recursive:true,force:true});}});
