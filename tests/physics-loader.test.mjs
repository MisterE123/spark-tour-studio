import test from 'node:test';
import assert from 'node:assert/strict';
import {physics} from '../shared/physics.mjs';
import {loadPhysics} from '../shared/physics-loader.mjs';
import {WalkingMotor} from '../shared/walking.mjs';
import {flyMovement} from '../shared/flying.mjs';

test('importing navigation helpers and constructing their state does not initialize physics',()=>{
 assert.equal(physics,undefined);
 const motor=new WalkingMotor();motor.reset();assert.equal(motor.grounded,false);
 assert.equal(typeof flyMovement,'function');
});

test('one initialization is shared and publishes its binding only after WASM is ready',async()=>{
 const provider=await import('../shared/physics.mjs?concurrent');let calls=0,release;
 const engine={init:()=>{calls++;return new Promise(resolve=>release=resolve);}};
 const first=provider.initializePhysics(engine),second=provider.initializePhysics(engine);
 assert.equal(first,second);assert.equal(provider.physics,undefined);assert.equal(provider.physicsReady(),first);
 await Promise.resolve();assert.equal(calls,1);release();assert.equal(await first,engine);assert.equal(provider.physics,engine);
 assert.equal(await provider.initializePhysics({init:()=>{throw Error('must not replace a live engine');}}),engine);
 assert.equal(calls,1,'an engine with live worlds remains the only engine');
});

test('a failed initialization is retryable without exposing a partially initialized engine',async()=>{
 const provider=await import('../shared/physics.mjs?retry');let calls=0;
 await assert.rejects(provider.physicsReady(),/not been initialized/);
 const engine={init:async()=>{if(++calls===1)throw Error('compile failed');}};
 const failed=provider.initializePhysics(engine);await assert.rejects(failed,/compile failed/);assert.equal(provider.physics,undefined);
 const retried=provider.initializePhysics(engine);assert.notEqual(retried,failed);assert.equal(await retried,engine);
 assert.equal(provider.physics,engine);assert.equal(calls,2);
});

test('the actual lazy loader and all synchronous shape helpers share the initialized engine',async()=>{
 const first=loadPhysics(),second=loadPhysics();assert.equal(first,second);const engine=await first;
 assert.equal(engine,physics);assert.equal(await loadPhysics(),engine);
 const world=new physics.World({x:0,y:0,z:0});try{
  world.createCollider(physics.ColliderDesc.cuboid(.1,3,3));world.step();
  const move=flyMovement(world,{x:-1,y:1,z:0},{x:3,y:0,z:1});assert.ok(move.x<.7&&move.z>.99);
 }finally{world.free();}
});
