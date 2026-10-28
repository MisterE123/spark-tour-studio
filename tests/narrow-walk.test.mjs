import test from 'node:test';
import assert from 'node:assert/strict';
import {doorway} from './doorway-fixture.mjs';
import {physics as RAPIER} from '../shared/physics.mjs';import {loadPhysics} from '../shared/physics-loader.mjs';
import {buildNavigation,NavigationRefinements} from '../shared/navigation.mjs';
import {WalkMotion} from '../shared/walk-motion.mjs';
import {WalkingMotor,configureWalkingController} from '../shared/walking.mjs';


test('a failed coarse route refines a narrow doorway without reducing the physical capsule',async()=>{
 const {positions,indices}=doorway(.65),coarse=await buildNavigation(positions,indices),fine=new NavigationRefinements(positions,indices),start={x:-3,y:0,z:0},end={x:3,y:0,z:0};
 try{
  assert.throws(()=>coarse.path(start,end),/route/);
  const route=await fine.path(start,end);assert.ok(route.at(-1).x>2.9);assert.deepEqual(await fine.path(start,end),route);assert.equal(fine.regions.length,1);
  await loadPhysics();const world=new RAPIER.World({x:0,y:-9.81,z:0});
  try{
   world.createCollider(RAPIER.ColliderDesc.trimesh(positions,indices));const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(-3,.865,0)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.6,.25),body),controller=world.createCharacterController(.015),motion=new WalkMotion(),motor=new WalkingMotor();configureWalkingController(controller,.25);world.step();
   for(let i=0;i<260&&body.translation().x<2.92;i++){const p=body.translation(),speed=Math.min(2,Math.sqrt(24*Math.max(0,3-p.x-.04))),step=motion.step(speed,0,1/60,2),delta=motor.step(world,controller,capsule,body,{x:step.x,z:step.z,dt:1/60,stepHeight:.25});for(const normal of delta.collisions)motion.collision(normal);}
   assert.ok(body.translation().x>2.9,'The full standing capsule must actually fit through the planned doorway.');
  }finally{world.free();}
  for(let i=0;i<5;i++)await fine.path({...start,x:start.x-i*.2},{...end,x:end.x+i*.2});assert.ok(fine.regions.length<=3);
 }finally{coarse.dispose();fine.dispose();}assert.equal(fine.regions.length,0);
});

test('local refinement still rejects impassable gaps, disconnected destinations and excessive bounds',async()=>{
 const {positions,indices}=doorway(.45),fine=new NavigationRefinements(positions,indices);try{await assert.rejects(fine.path({x:-3,y:0,z:0},{x:3,y:0,z:0}),/route/);await assert.rejects(fine.path({x:-3,y:0,z:0},{x:300,y:0,z:300}),/route/);}finally{fine.dispose();}
});
