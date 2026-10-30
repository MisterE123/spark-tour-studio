import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{convertPlyToSogs,conversionOptions}=require('../desktop/sogs-converter.cjs');

async function fixture(t,{failure='gpu',hold=false}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sogs gpu fallback ')),tools=path.join(root,'tools'),source=path.join(root,'Original scan.ply'),bytes=Buffer.from('Original Gaussian splat fixture');await fs.mkdir(tools);await fs.writeFile(source,bytes);t.after(()=>fs.rm(root,{recursive:true,force:true}));
 try{await fs.link(process.execPath,path.join(tools,'node.exe'));}catch{await fs.copyFile(process.execPath,path.join(tools,'node.exe'));}
 await fs.writeFile(path.join(tools,'convert.mjs'),`
import fs from 'node:fs/promises';import path from 'node:path';
const c=JSON.parse(await fs.readFile(process.argv[2],'utf8')),trace=new URL('./trace.jsonl',import.meta.url),input=await fs.readFile(c.source,'utf8');
await fs.appendFile(trace,JSON.stringify({compute:c.compute,requestedCompute:c.requestedCompute,method:c.method,maxSh:c.maxSh,input,output:c.output,hadOldOutput:(await fs.readdir(path.dirname(c.output))).includes('invalid-gpu-output.webp')})+'\\n');
if(${JSON.stringify(hold)}){console.log('GPU attempt is active');await new Promise(()=>setInterval(()=>{},1000));}
if(c.compute!=='cpu'){await fs.writeFile(path.join(path.dirname(c.output),'invalid-gpu-output.webp'),'This must never be committed');console.error(${JSON.stringify(failure==='gpu'?'WebGPU GPUValidationError: invalid bind group':'PLY does not contain Gaussian splat data')});process.exit(${failure==='gpu'?42:1});}
const names=['means_l.webp','means_u.webp','scales.webp','quats.webp','sh0.webp'],meta=n=>({version:2,count:n,means:{mins:[0,0,0],maxs:[1,1,1],files:names.slice(0,2)},scales:{codebook:[0],files:[names[2]]},quats:{files:[names[3]]},sh0:{codebook:[0],files:[names[4]]}});
for(const [folder,count]of [['fine',8],['coarse',4]]){const dir=path.join(path.dirname(c.output),folder);await fs.mkdir(dir);await fs.writeFile(path.join(dir,'meta.json'),JSON.stringify(meta(count)));for(const name of names)await fs.writeFile(path.join(dir,name),Buffer.from('RIFF\\0\\0\\0\\0WEBPtestfixture'));}
await fs.writeFile(c.output,JSON.stringify({version:1,lodLevels:2,counts:[8,4],count:12,filenames:['fine/meta.json','coarse/meta.json'],tree:{bound:{min:[0,0,0],max:[1,1,1]},lods:{0:{file:0,offset:0,count:8},1:{file:1,offset:0,count:4}}}}));
await fs.writeFile(path.join(path.dirname(c.output),'conversion-report.json'),JSON.stringify({version:1,requested:{compute:c.requestedCompute,method:c.method,maxSh:c.maxSh},effective:{compute:'cpu',maxSh:c.maxSh},fallbacks:c.gpuFallbackReason?[{reason:c.gpuFallbackReason}]:[],levels:[{level:0,count:8,method:'original'},{level:1,count:4,method:'uniform'}]}));console.log('CPU uniform conversion complete');
`);
 return {root,tools,source,bytes,trace:async()=>{try{return (await fs.readFile(path.join(tools,'trace.jsonl'),'utf8')).trim().split('\n').map(line=>JSON.parse(line));}catch(error){if(error.code==='ENOENT')return [];throw error;}}};
}

test('SOG conversion compute options default to GPU preferred and reject unrecognized backends',()=>{
 assert.equal(conversionOptions().compute,'auto');for(const compute of ['auto','gpu','cpu'])assert.equal(conversionOptions({compute,maxSh:1}).compute,compute);assert.throws(()=>conversionOptions({compute:'webgl'}),/Invalid SOG conversion settings/);
});

test('Automatic retries typed GPU failure once in a fresh CPU output directory while preserving input and requested SH',async t=>{
 const f=await fixture(t),messages=[],ref=await convertPlyToSogs({source:f.source,projectRoot:f.root,tools:f.tools,method:'adaptive',compute:'auto',maxSh:1,levels:2,progress:message=>messages.push(message)}).promise,trace=await f.trace();assert.equal(trace.length,2);assert.deepEqual(trace.map(item=>item.compute),['auto','cpu']);assert.ok(trace.every(item=>item.input===f.bytes.toString()&&item.maxSh===1&&item.method==='adaptive'&&item.requestedCompute==='auto'));assert.ok(trace.every(item=>!item.hadOldOutput));assert.notEqual(path.dirname(trace[0].output),path.dirname(trace[1].output));const dir=path.dirname(path.join(f.root,ref)),report=JSON.parse(await fs.readFile(path.join(dir,'conversion-report.json'),'utf8'));assert.equal(report.requested.compute,'auto');assert.equal(report.effective.compute,'cpu');assert.equal(report.requested.maxSh,1);assert.equal(report.levels[1].method,'uniform');assert.match(report.fallbacks[0].reason,/GPUValidationError/);assert.ok(messages.some(message=>/restarting cleanly/.test(message)));assert.match(messages.at(-1),/CPU uniform/);await assert.rejects(fs.access(path.join(dir,'invalid-gpu-output.webp')));assert.ok(!(await fs.readdir(f.root)).some(name=>name.startsWith('.sogs-conversion-')));assert.deepEqual(await fs.readFile(f.source),f.bytes);const log=await fs.readFile(path.join(dir,'conversion.log'),'utf8');assert.match(log,/Automatic WebGPU-preferred/);assert.match(log,/Restarting from the unchanged source on CPU/);assert.match(log,/CPU conversion attempt/);
});

test('GPU-only failure and malformed Gaussian data do not silently run a CPU retry',async t=>{
 for(const [compute,failure]of [['gpu','gpu'],['auto','input']]){const f=await fixture(t,{failure});await assert.rejects(convertPlyToSogs({source:f.source,projectRoot:f.root,tools:f.tools,compute,levels:2}).promise,/SOG conversion failed/);assert.equal((await f.trace()).length,1);assert.ok(!(await fs.readdir(f.root)).some(name=>name.startsWith('.sogs-conversion-')));assert.deepEqual(await fs.readFile(f.source),f.bytes);const logs=await fs.readdir(path.join(f.root,'conversion-logs'));assert.equal(logs.length,1);}
});

test('CPU-only conversion runs once and records the actual execution path',async t=>{
 const f=await fixture(t),ref=await convertPlyToSogs({source:f.source,projectRoot:f.root,tools:f.tools,compute:'cpu',levels:2}).promise,trace=await f.trace();assert.equal(trace.length,1);assert.equal(trace[0].compute,'cpu');const report=JSON.parse(await fs.readFile(path.join(f.root,path.dirname(ref),'conversion-report.json'),'utf8'));assert.equal(report.requested.compute,'cpu');assert.equal(report.effective.compute,'cpu');assert.deepEqual(report.fallbacks,[]);
});

test('canceling an active GPU attempt stops the job and never starts its CPU fallback',async t=>{
 const f=await fixture(t,{hold:true});let job,cancelled=false;job=convertPlyToSogs({source:f.source,projectRoot:f.root,tools:f.tools,compute:'auto',levels:2,progress:message=>{if(message.includes('GPU attempt is active')){cancelled=true;job.cancel();}}});await assert.rejects(job.promise,/cancelled/);assert.equal(cancelled,true);assert.equal((await f.trace()).length,1);assert.ok(!(await fs.readdir(f.root)).some(name=>name.startsWith('.sogs-conversion-')));assert.deepEqual(await fs.readFile(f.source),f.bytes);
});
