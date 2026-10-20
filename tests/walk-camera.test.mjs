import test from 'node:test';
import assert from 'node:assert/strict';
import {WalkCamera} from '../shared/walk-camera.mjs';

test('walking eye steps settle identically at 30, 60 and 120 Hz without overshoot',()=>{
 for(const direction of [-1,1]){
  const results=[];
  for(const hz of [30,60,120]){
   const eye=new WalkCamera();eye.reset(1.7);const target=1.7+direction*.5334;
   let previous=1.7;
   for(let frame=0;frame<hz*.3;frame++){
    const y=eye.update(target,1/hz);
    assert.ok(Math.abs(y-previous)<=2.5/hz+1e-12,'rendered eye speed remains bounded');
    assert.ok(direction*(y-previous)>=-1e-12,'the eye approaches monotonically');
    assert.ok(direction*(target-y)>=-1e-12,'the eye never overshoots the physical target');
    previous=y;
   }
   assert.ok(Math.abs(target-previous)<.016,'97% of a full-height step settles within .3 s');
   results.push(previous);
  }
  assert.ok(Math.max(...results)-Math.min(...results)<1e-12,'equal elapsed time gives equal eye height');
 }
});

test('many ascending, descending and jagged steps remain bounded and frame-rate independent',()=>{
 const levels=[0,.5,.5,1,.5,.3,.5,0,-.5,0,.5,.25,.75,.25,0];
 const traces=[];
 for(const hz of [30,60,120]){
  const eye=new WalkCamera();eye.reset(1.7);const trace=[];
  for(const level of levels){
   const target=1.7+level;
   for(let frame=0;frame<hz/10;frame++){
    const previous=eye.y,y=eye.update(target,1/hz);
    assert.ok(y>=Math.min(previous,target)-1e-12&&y<=Math.max(previous,target)+1e-12,'every update stays between its previous and physical heights');
   }
   trace.push(eye.y);
  }
  for(let frame=0;frame<hz;frame++)eye.update(1.7,1/hz);
  assert.equal(eye.y,1.7,'a stable floor has no residual jiggle');
  traces.push(trace);
 }
 for(let i=0;i<levels.length;i++)assert.ok(Math.max(...traces.map(trace=>trace[i]))-Math.min(...traces.map(trace=>trace[i]))<1e-12);
});

test('a coarse step is visibly eased rather than passed through as a camera jump',()=>{
 for(const hz of [30,60,120]){
  const eye=new WalkCamera();eye.reset(1.7);
  const y=eye.update(2.2334,1/hz);
  assert.ok(y>1.7&&y<=1.7+2.5/hz+1e-12,'the first rendered frame cannot jump faster than the configured speed');
  assert.equal(eye.update(2.2334,0),y,'a zero-duration frame cannot add movement');
 }
});

test('the speed cap and exponential tail integrate exactly across their boundary',()=>{
 const eye=new WalkCamera({timeConstant:.1,maxSpeed:1});eye.reset(0);
 assert.ok(Math.abs(eye.update(.5,.2)-.2)<1e-12,'the first interval is constant speed');
 assert.ok(Math.abs(eye.update(.5,.25)-(.5-.1*Math.exp(-.5)))<1e-12,'an interval crossing the boundary splits into linear movement and an exponential tail');
 for(const direction of [-1,1]){
  const one=new WalkCamera({maxSpeed:1}),many=new WalkCamera({maxSpeed:1});one.reset(0);many.reset(0);
  const target=direction*.5,result=one.update(target,.6);
  for(let i=0;i<60;i++)many.update(target,.01);
  assert.ok(Math.abs(result-many.y)<1e-12,'one long frame equals sixty short frames across the speed/tail boundary');
 }
});

test('jumping, falling, crouching and XR can bypass smoothing without leaving a delayed offset',()=>{
 for(const height of [2.4,1.1,.95]){
  const eye=new WalkCamera();eye.reset(1.7);eye.update(2.2,1/60);
  assert.equal(eye.update(height,1/60,{smooth:false}),height);
  assert.equal(eye.update(height,1/60),height,'reenabling smoothing starts from the physical pose');
 }
});

test('scene, mode and teleport resets clear the previous terrain lag',()=>{
 const eye=new WalkCamera();
 assert.equal(eye.update(1.7,1/60),1.7,'first placement is immediate');
 eye.update(2.2,1/60);assert.equal(eye.reset(40),40);assert.equal(eye.update(40,1/60),40);
 eye.reset();assert.equal(eye.update(-5,1/60),-5,'a reset without a pose initializes from the next physical target');
});

test('collision clamps apply immediately and become the new smoothing origin',()=>{
 const eye=new WalkCamera();eye.reset(1.7);
 assert.equal(eye.update(2.2,1/60,{minY:2}),2,'a step does not leave the visual eye inside solid floor');
 const next=eye.update(2.2,1/60);
 assert.ok(next>2&&next<2.06,'the next frame approaches from the accepted safe pose');
 assert.equal(eye.update(1.7,1/60,{maxY:1.8}),1.8,'a descending step does not leave the eye inside a ceiling');
 assert.ok(eye.update(1.7,1/60)<1.8);
});

test('invalid timing cannot poison the eye and long frame gaps settle without overshoot',()=>{
 const eye=new WalkCamera({timeConstant:NaN,maxSpeed:NaN});eye.reset(1.7);
 for(const dt of [-1,NaN,Infinity])assert.equal(eye.update(2.2,dt),1.7);
 assert.equal(eye.update(NaN,1/60),1.7,'a missing physical sample preserves the last finite eye');
 assert.equal(eye.update(2.2,5),2.2,'a long interruption converges directly to the current target');
});
