import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {build} from 'esbuild';
const outputRoot=path.resolve('test-output');await fs.mkdir(outputRoot,{recursive:true});const output=await fs.mkdtemp(path.join(outputRoot,'frame-performance-unit-'));
await build({entryPoints:['src/frame-performance.ts'],outfile:path.join(output,'tracker.mjs'),bundle:true,platform:'node',format:'esm',logLevel:'silent'});
const {FramePerformanceTracker}=await import(pathToFileURL(path.join(output,'tracker.mjs')).href);
test.after(async()=>{assert.equal(path.dirname(output),outputRoot);await fs.rm(output,{recursive:true,force:true});});

test('raw intervals produce duration-weighted FPS rather than an average of FPS readings',()=>{
 const tracker=new FramePerformanceTracker();tracker.sample(0,1000,true,'scene');tracker.sample(10,10,true,'scene');tracker.sample(50,40,true,'scene');
 const snapshot=tracker.snapshot(50);assert.equal(snapshot.sampleCount,2);assert.equal(snapshot.durationMs,50);assert.equal(snapshot.currentFps,40);assert.equal(snapshot.averageFps,40);assert.equal(snapshot.worstFrameMs,40);assert.equal(snapshot.spikeCount,0);assert.equal(snapshot.recording,true);
});
test('visible slow frames including multi-second freezes remain real spikes',()=>{
 const tracker=new FramePerformanceTracker();tracker.sample(0,16,true);tracker.sample(16,16,true);tracker.sample(106,90,true);tracker.sample(2106,2000,true);
 const snapshot=tracker.snapshot(2106);assert.equal(snapshot.sampleCount,3);assert.equal(snapshot.worstFrameMs,2000);assert.equal(snapshot.spikeCount,2);assert.equal(snapshot.currentFps,.5);assert.equal(Math.max(...snapshot.peaks),2000);
});
test('loading, hidden and suspended gaps break continuity without corrupting existing history',()=>{
 const tracker=new FramePerformanceTracker();tracker.sample(0,16,true);tracker.sample(16,16,true);tracker.sample(32,16,false);tracker.sample(5032,5000,true);tracker.sample(5048,16,true);
 let snapshot=tracker.snapshot(5048);assert.equal(snapshot.sampleCount,2);assert.equal(snapshot.worstFrameMs,16);assert.equal(snapshot.spikeCount,0);
 tracker.pause();tracker.sample(25048,20000,true);tracker.sample(25064,16,true);snapshot=tracker.snapshot(25064);assert.equal(snapshot.sampleCount,3);assert.equal(snapshot.spikeCount,0);assert.equal(snapshot.averageFps,62.5);
 tracker.pause();assert.equal(tracker.snapshot(25065).recording,false);
});
test('scene and desktop/XR context changes reset mixed captures; Reset discards prior spikes',()=>{
 const tracker=new FramePerformanceTracker();tracker.sample(0,16,true,'one:desktop');tracker.sample(100,100,true,'one:desktop');assert.equal(tracker.snapshot(100).spikeCount,1);
 tracker.sample(120,20,true,'two:desktop');assert.equal(tracker.snapshot(120).sampleCount,0);tracker.sample(140,20,true,'two:desktop');assert.equal(tracker.snapshot(140).averageFps,50);
 tracker.sample(151,11,true,'two:xr');assert.equal(tracker.snapshot(151).sampleCount,0);tracker.sample(162,11,true,'two:xr');tracker.reset();assert.equal(tracker.snapshot(162).sampleCount,0);tracker.sample(200,38,true,'two:xr');assert.equal(tracker.snapshot(200).sampleCount,0,'first interval after Reset begins outside the new capture');
});
test('history obeys both ring capacity and elapsed-time limits even after a pause',()=>{
 const tracker=new FramePerformanceTracker({windowMs:1000,capacity:4});tracker.sample(0,20,true);for(let time=20;time<=200;time+=20)tracker.sample(time,20,true);
 assert.equal(tracker.snapshot(200).sampleCount,4);assert.equal(tracker.snapshot(200).durationMs,80);tracker.pause();assert.equal(tracker.snapshot(1300).sampleCount,0);assert.equal(tracker.snapshot(1300).averageFps,null);assert.equal(tracker.snapshot(1300).worstFrameMs,null);
});
test('graph buckets preserve the slowest frame rather than smoothing away a stutter',()=>{
 const tracker=new FramePerformanceTracker({windowMs:1000});tracker.sample(100,16,true);tracker.sample(200,16,true);tracker.sample(350,75,true);tracker.sample(900,20,true);
 const snapshot=tracker.snapshot(1000,4);assert.deepEqual(snapshot.peaks,[16,75,null,20]);assert.equal(snapshot.spikeThresholdMs,50);assert.equal(snapshot.spikeCount,1);
});
test('invalid and nonmonotonic samples cannot poison metrics or invent a recovery spike',()=>{
 const tracker=new FramePerformanceTracker();tracker.sample(0,16,true);tracker.sample(16,16,true);tracker.sample(10,16,true);tracker.sample(32,16,true);tracker.sample(48,16,true);tracker.sample(NaN,16,true);tracker.sample(64,Infinity,true);tracker.sample(80,32,true);tracker.sample(96,16,true);
 const snapshot=tracker.snapshot(96);assert.equal(snapshot.sampleCount,3);assert.equal(snapshot.worstFrameMs,16);assert.equal(snapshot.averageFps,62.5);
 for(const options of [{windowMs:0},{windowMs:NaN},{capacity:0},{capacity:1.5}])assert.throws(()=>new FramePerformanceTracker(options));for(const [now,bins]of [[NaN,180],[100,0],[100,1001]])assert.throws(()=>tracker.snapshot(now,bins));
});
