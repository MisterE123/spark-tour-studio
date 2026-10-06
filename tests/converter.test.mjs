import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {existsSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {plyFixture} from './fixtures.mjs';
const require=createRequire(import.meta.url),{convertPly}=require('../desktop/converter.cjs'),{radMeta}=require('../desktop/export.cjs');
const executable=path.resolve('converter/build-lod.exe');
test('bundled Rust converter produces LoD chunks and preserves the source PLY',{skip:!existsSync(executable)},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-ply test-'));try{const source=path.join(root,'original scan.ply'),bytes=plyFixture();await fs.writeFile(source,bytes);const projectRoot=path.join(root,'project');await fs.mkdir(projectRoot);for(const method of ['quality','quick']){const ref=await convertPly({source,projectRoot,executable,method,maxSh:3}).promise;const meta=await radMeta(path.join(projectRoot,ref));assert.equal(meta.lodTree,true);assert.ok(meta.count>=128);assert.ok(meta.chunks[0].filename);assert.deepEqual(await fs.readFile(source),bytes);assert.ok(!existsSync(path.join(projectRoot,path.dirname(ref),'source.ply')));}}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('conversion rejects malformed input and cancels without creating a scene',{skip:!existsSync(executable)},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-ply-failure-'));try{const source=path.join(root,'bad.ply');await fs.writeFile(source,'not a PLY');await assert.rejects(convertPly({source,projectRoot:root,executable}).promise,/conversion failed/);await fs.writeFile(source,plyFixture());const job=convertPly({source,projectRoot:root,executable});job.cancel();await assert.rejects(job.promise,/cancelled/);assert.deepEqual(await fs.readFile(source),plyFixture());assert.ok(!(await fs.readdir(root)).some(n=>n.startsWith('.conversion-')));}finally{await fs.rm(root,{recursive:true,force:true});}
});
test('cancellation terminates an active native conversion',{skip:!existsSync(executable)},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'spark-ply-cancel-'));try{const source=path.join(root,'scan.ply');await fs.writeFile(source,plyFixture(50000));let job;let cancelled=false;job=convertPly({source,projectRoot:root,executable,method:'quality',progress:text=>{if(!text.startsWith('Preparing')&&!text.startsWith('Copying')){cancelled=true;job.cancel();}}});await assert.rejects(job.promise,/cancelled/);assert.equal(cancelled,true);assert.ok(!(await fs.readdir(root)).some(n=>n.startsWith('.conversion-')));}finally{await fs.rm(root,{recursive:true,force:true});}
});
