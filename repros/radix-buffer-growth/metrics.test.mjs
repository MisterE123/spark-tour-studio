import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCounts,estimateMemory,summarize} from './metrics.mjs';
test('counts are bounded, increasing and explicit',()=>{
 assert.deepEqual(parseCounts('1024, 2048,5000000'),[1024,2048,5000000]);
 for(const value of ['',',2048','1024,1024','2048,1024','2.5','Infinity','16000001','0'])assert.throws(()=>parseCounts(value));
});
test('memory planning includes fixed input or mono projection and scratch',()=>{
 const sort=estimateMemory([250000,5000000],'sort'),render=estimateMemory([250000,5000000],'render');
 assert.equal(sort.bytes,190000000);assert.equal(render.bytes,370000000);assert.ok(render.bytes>sort.bytes);
});
test('warm-up excluded, growth and replay allocations remain separate',()=>{
 const run={stages:[{pass:'warmup',count:1024,start:1},{pass:'growth',count:2048,start:100},{pass:'replay',count:2048,start:200}],frames:[{stage:0,interval:900,cpu:800},{stage:1,interval:80,cpu:70},{stage:1,interval:20,cpu:10},{stage:2,interval:17,cpu:3}],events:[{stage:0,type:'createBuffer',ms:700},{stage:1,type:'createBuffer',ms:40},{stage:1,type:'bufferCapacity',before:1024,after:2048},{stage:2,type:'readback',ms:20}]};
 const rows=summarize(run);assert.equal(rows.length,2);assert.equal(rows[0].cpuMax,70);assert.equal(rows[0].createBufferMax,40);assert.equal(rows[0].growths,1);assert.equal(rows[1].growths,0);assert.equal(rows[1].createBuffers,0);
});
test('stage-boundary interval is retained raw but excluded from the new interval summary',()=>{
 const run={stages:[{pass:'growth',count:2048,start:100}],frames:[{stage:0,previousStage:-1,interval:1000,cpu:50},{stage:0,previousStage:0,interval:18,cpu:1}],events:[]};
 assert.equal(summarize(run)[0].intervalMax,18);assert.equal(summarize(run)[0].cpuMax,50);assert.equal(run.frames[0].interval,1000);
});
