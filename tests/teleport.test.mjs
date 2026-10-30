import test from 'node:test';
import assert from 'node:assert/strict';
import {physics as RAPIER} from '../shared/physics.mjs';import {loadPhysics} from '../shared/physics-loader.mjs';
import {teleportWalkingFeet} from '../shared/walking.mjs';

await loadPhysics();
const up={x:0,y:1,z:0},rotation={x:0,y:0,z:0,w:1};
const floor=world=>world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5).setTranslation(0,-.1,0));
const fixture=run=>{const world=new RAPIER.World({x:0,y:-9.81,z:0});try{return run(world);}finally{world.free();}};

test('teleport keeps an exact clear floor and excludes the visitor capsule',()=>fixture(world=>{
 floor(world);const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,.87,0)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.6,.25),body);world.step();
 const point={x:0,y:0,z:0};assert.equal(teleportWalkingFeet(world,point,up,undefined,()=>true,.25,0),null);
 const feet=teleportWalkingFeet(world,point,up,capsule,()=>true,.25,0);assert.ok(feet);assert.ok(Math.abs(feet.x)+Math.abs(feet.y)+Math.abs(feet.z)<1e-5);
}));

test('teleport lifts the standing capsule correctly on 35 to 44 degree slopes',()=>{
 for(const degrees of [35,40,44])fixture(world=>{
  const angle=degrees*Math.PI/180;world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5).setRotation({x:0,y:0,z:Math.sin(angle/2),w:Math.cos(angle/2)}));world.step();
  const hit=world.castRayAndGetNormal(new RAPIER.Ray({x:0,y:2,z:0},{x:0,y:-1,z:0}),3,true),point={x:0,y:2-hit.timeOfImpact,z:0};
  assert.ok(world.intersectionWithShape({x:0,y:point.y+.87,z:0},rotation,new RAPIER.Capsule(.58,.24)),'old fixed-height test fails at '+degrees+' degrees');
  const feet=teleportWalkingFeet(world,point,hit.normal);assert.ok(feet,'landing exists at '+degrees+' degrees');assert.equal(world.intersectionWithShape({x:feet.x,y:feet.y+.87,z:feet.z},rotation,new RAPIER.Capsule(.6,.25)),null);assert.ok(feet.y>point.y);
 });
});

test('teleport projects a low voxel riser to nearby clear ground',()=>fixture(world=>{
 floor(world);world.createCollider(RAPIER.ColliderDesc.cuboid(.1,.1,1).setTranslation(.2,.1,0));world.step();
 const point={x:.1,y:.12,z:0},normal={x:-1,y:0,z:0},feet=teleportWalkingFeet(world,point,normal);assert.ok(feet);assert.ok(feet.x<-.15,'fit on the visible side of the riser');assert.ok(Math.hypot(feet.x-point.x,feet.z-point.z)<=.6+1e-6);assert.ok(Math.abs(feet.y)<1e-5);
}));

test('teleport side targets stay outside a wall and cannot search through it',()=>fixture(world=>{
 floor(world);world.createCollider(RAPIER.ColliderDesc.cuboid(.025,2,2).setTranslation(0,2,0));world.step();
 const point={x:-.025,y:.12,z:0},normal={x:-1,y:0,z:0},feet=teleportWalkingFeet(world,point,normal);assert.ok(feet);assert.ok(feet.x<-.275);assert.equal(teleportWalkingFeet(world,point,normal,undefined,center=>center.x>.275),null,'a valid floor on the far side is not a nearby landing');
}));

test('teleport floor corrections cannot hop through a thin wall',()=>fixture(world=>{
 floor(world);world.createCollider(RAPIER.ColliderDesc.cuboid(.025,2,2).setTranslation(0,2,0));world.step();
 const point={x:-.05,y:0,z:0};assert.equal(teleportWalkingFeet(world,point,up,undefined,center=>center.x>.275),null);const feet=teleportWalkingFeet(world,point,up);assert.ok(feet&&feet.x<-.275);
}));

test('teleport corrections do not move across a nearby unsupported gap',()=>fixture(world=>{
 world.createCollider(RAPIER.ColliderDesc.cuboid(1,.1,2).setTranslation(-1.1,-.1,0));world.createCollider(RAPIER.ColliderDesc.cuboid(1,.1,2).setTranslation(1.15,-.1,0));world.step();
 const point={x:-.1,y:0,z:0};assert.equal(teleportWalkingFeet(world,point,up,undefined,center=>center.x>.4),null,'the permitted landing across the gap is not on the same ground');
}));

test('teleport rejects ceilings, unsupported voids and a different storey',()=>{
 fixture(world=>{floor(world);world.createCollider(RAPIER.ColliderDesc.cuboid(5,.1,5).setTranslation(0,1.4,0));world.step();assert.equal(teleportWalkingFeet(world,{x:0,y:0,z:0},up),null,'standing head clearance is mandatory');assert.equal(teleportWalkingFeet(world,{x:0,y:1.3,z:0},{x:0,y:-1,z:0}),null,'an overhead underside cannot select its top');});
 fixture(world=>{world.step();assert.equal(teleportWalkingFeet(world,{x:0,y:0,z:0},up),null);});
 fixture(world=>{floor(world);world.step();assert.equal(teleportWalkingFeet(world,{x:0,y:2,z:0},up),null,'a basement below the click stays unselected');});
});

test('teleport observes authoritative coverage and bounds its search',()=>fixture(world=>{
 floor(world);world.createCollider(RAPIER.ColliderDesc.cuboid(.1,.1,1).setTranslation(.2,.1,0));world.step();const point={x:.1,y:.12,z:0},normal={x:-1,y:0,z:0};
 assert.equal(teleportWalkingFeet(world,point,normal,undefined,()=>false),null,'unverified collision coverage cannot become green');assert.equal(teleportWalkingFeet(world,point,normal,undefined,()=>true,.25,.1),null,'no distant correction beyond the configured radius');assert.equal(teleportWalkingFeet(world,{x:NaN,y:0,z:0},up),null);assert.equal(teleportWalkingFeet(world,point,{x:0,y:0,z:0}),null);
}));
