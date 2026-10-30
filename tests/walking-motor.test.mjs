import test from 'node:test';
import assert from 'node:assert/strict';
import {physics as RAPIER} from '../shared/physics.mjs';import {loadPhysics} from '../shared/physics-loader.mjs';
import {WalkingMotor,configureWalkingController} from '../shared/walking.mjs';
import {WalkMotion} from '../shared/walk-motion.mjs';

const initialized=loadPhysics();
function boxMesh(min,max){
 const [x,y,z]=min,[X,Y,Z]=max;
 return {positions:new Float32Array([x,y,z,X,y,z,X,y,Z,x,y,Z,x,Y,z,X,Y,z,X,Y,Z,x,Y,Z]),indices:new Uint32Array([0,1,2,0,2,3,4,6,5,4,7,6,0,5,1,0,4,5,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2])};
}
async function fixture({height=.5,width=4,depth=20,trimesh=false,ceiling,limit=.5334,start={x:0,y:.87,z:0}}={}){
 await initialized;const world=new RAPIER.World({x:0,y:-9.81,z:0});
 world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,20).setTranslation(0,-.1,0));
 if(height>0){if(trimesh){const mesh=boxMesh([1,0,-depth/2],[1+width,height,depth/2]);world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.positions,mesh.indices));}else world.createCollider(RAPIER.ColliderDesc.cuboid(width/2,height/2,depth/2).setTranslation(1+width/2,height/2,0));}
 if(ceiling)world.createCollider(RAPIER.ColliderDesc.cuboid(3,.1,3).setTranslation(2,ceiling+.1,0));
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,start.y,start.z)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.6,.25),body),controller=world.createCharacterController(.015),motion=new WalkMotion(),motor=new WalkingMotor();configureWalkingController(controller,limit);world.step();
 return {world,body,capsule,controller,motion,motor,limit};
}
// Deliberately exercise the application loop: acceleration, actual per-frame
// gravity, grounded resets and accepted collision feedback. A fixed -0.02 m vertical
// displacement hid the old competing step solvers' frame-rate dependence.
function run(f,{hz=60,speed=1,seconds=5,direction={x:1,z:0},allow=()=>true,stopAfter=Infinity,jumpAt=-1}={}){
 const dt=1/hz,records=[];
 for(let frame=0;frame<Math.ceil(seconds*hz);frame++){
  const before={...f.body.translation()},target=frame*dt<stopAfter?speed:0,horizontal=f.motion.step(target*direction.x,target*direction.z,dt,speed);
  const movement=f.motor.step(f.world,f.controller,f.capsule,f.body,{x:horizontal.x,z:horizontal.z,dt,jump:frame===jumpAt,stepHeight:f.limit,allows:(from,to)=>allow(from,to,frame)}),accepted=!movement.blocked;
  if(movement.blocked)f.motion.reset();
  for(const normal of movement.collisions)f.motion.collision(normal);
  const after={...f.body.translation()};records.push({time:frame*dt,before,after,movement,accepted,velocityY:f.motor.velocityY});
 }
 return records;
}

test('accelerating walking crosses coarse ledges promptly without backward contact jitter at different frame rates',async()=>{
 for(const hz of [30,60,120])for(const speed of [.25,1,2])for(const trimesh of [false,true])for(const direction of [{x:1,z:0},{x:Math.SQRT1_2,z:Math.SQRT1_2}]){
  const f=await fixture({trimesh});try{
   const records=run(f,{hz,speed,direction,seconds:1.65/(speed*direction.x)+.8}),label=JSON.stringify({hz,speed,trimesh,direction});
   assert.ok(records.at(-1).after.x>1.5,'continuous input crosses a permitted half-metre ledge promptly '+label);
   assert.ok(Math.min(...records.map(r=>(r.after.x-r.before.x)*direction.x+(r.after.z-r.before.z)*direction.z))>-.003,'contact cannot kick the visitor backwards '+label);
   assert.ok(Math.max(...records.map(r=>Math.hypot(r.after.x-r.before.x,r.after.z-r.before.z)))<=speed/hz+.003,'stepping cannot speed up horizontal travel '+label);
  }finally{f.world.free();}
 }
});

test('a single ten-centimetre voxel remains traversable with a one-metre step setting',async()=>{
 for(const hz of [30,60,120])for(const trimesh of [false,true])for(const direction of [{x:1,z:0},{x:Math.SQRT1_2,z:Math.SQRT1_2}]){
  const start={x:0,y:.87,z:direction.z?-.98:0},f=await fixture({height:.1,width:.1,depth:.1,limit:1,trimesh,start});try{
   const records=run(f,{hz,speed:1,direction,seconds:3.3}),label=JSON.stringify({hz,trimesh,direction});
   assert.ok(records.at(-1).after.x>1.5,'small isolated cells cannot trap a full-size capsule '+label+' final='+JSON.stringify(records.at(-1).after));
   assert.ok(Math.min(...records.map(r=>(r.after.x-r.before.x)*direction.x+(r.after.z-r.before.z)*direction.z))>-.003,'small cells cannot produce backwards kicks '+label);
  }finally{f.world.free();}
 }
});

test('an excessive ledge or obstructed landing stays blocked without repeated upward ratcheting',async()=>{
 for(const options of [{height:.7},{height:.5,ceiling:2.05},{height:.1,limit:0}])for(const hz of [30,120]){
  const f=await fixture(options);try{
   const records=run(f,{hz,seconds:4}),tail=records.filter(r=>r.time>2),label=JSON.stringify({options,hz});
   assert.ok(records.at(-1).after.x<.9,'unsafe ledge stays blocked '+label);
   assert.ok(Math.max(...tail.map(r=>r.after.y))<1.05,'blocked contact must not ratchet the capsule upwards '+label);
   assert.ok(Math.max(...tail.map(r=>r.after.y))-Math.min(...tail.map(r=>r.after.y))<.015,'blocked grounded contact stays settled '+label);
  }finally{f.world.free();}
 }
});

test('a rejected paged step preserves the current floor and can retry when coverage becomes ready',async()=>{
 const f=await fixture();try{
  let rejected=0;const hz=60,records=run(f,{hz,seconds:4,allow:(from,to,frame)=>{const ready=frame>=120||to.y<1.05;if(!ready)rejected++;return ready;}});
  const waiting=records.filter(r=>r.time>.9&&r.time<2);
  assert.ok(rejected>0,'fixture actually blocks the rise pending collision coverage');
  assert.ok(waiting.every(r=>r.after.x<.9&&r.after.y>.8&&r.after.y<1.05),'visitor remains supported before collision coverage is ready');
  assert.ok(records.at(-1).after.x>1.8,'movement retries successfully when exact nearby collision becomes ready');
 }finally{f.world.free();}
});

test('stopping on a coarse landing does not retain assisted horizontal travel',async()=>{
 const f=await fixture();try{
  const records=run(f,{seconds:3,stopAfter:1.1}),rest=records.filter(r=>r.time>1.7);
  assert.ok(records.some(r=>r.after.y>1.3),'fixture traverses the coarse ledge before stopping');
  assert.ok(Math.abs(rest.at(-1).after.x-rest[0].after.x)<.002,'release comes to rest without pending-step drift');
  assert.ok(Math.max(...rest.map(r=>r.after.y))-Math.min(...rest.map(r=>r.after.y))<.015,'resting on landing does not jiggle');
 }finally{f.world.free();}
});

test('walking down from a coarse landing returns to the lower floor without an upward catch-up step',async()=>{
 for(const hz of [30,60,120]){
  const f=await fixture({start:{x:2,y:1.37,z:0}});try{
   const records=run(f,{hz,seconds:3,direction:{x:-1,z:0}}),landing=records.filter(r=>r.after.x<.5);
   assert.ok(records.at(-1).after.x<0,'downward travel does not get stuck on the lip at '+hz+' Hz');
   assert.ok(Math.abs(records.at(-1).after.y-.865)<.015,'capsule settles on the lower floor at '+hz+' Hz');
   assert.ok(Math.max(...landing.map(r=>r.after.y-r.before.y))<.015,'descent never injects an upward catch-up step at '+hz+' Hz');
  }finally{f.world.free();}
 }
});

test('jumping and falling use the same vertical state and return to stable support',async()=>{
 for(const hz of [30,60,120]){
  const f=await fixture({height:0});try{
   const records=run(f,{hz,speed:0,seconds:3,jumpAt:Math.round(hz*.5)}),peak=Math.max(...records.map(r=>r.after.y)),rest=records.filter(r=>r.time>2);
   assert.ok(peak>1.7&&peak<2.2,'jump has a physical ballistic arc at '+hz+' Hz');
   assert.ok(records.some(r=>r.velocityY>1)&&records.some(r=>r.velocityY< -1),'one vertical state owns ascent and falling at '+hz+' Hz');
   assert.ok(f.motor.grounded,'jump returns to grounded support at '+hz+' Hz');
   assert.ok(Math.max(...rest.map(r=>r.after.y))-Math.min(...rest.map(r=>r.after.y))<.015,'landing does not restart a gravity/snap oscillation at '+hz+' Hz');
  }finally{f.world.free();}
 }
});

test('grounded translation keeps the full capsule above a flat supporting floor',async()=>{
 for(const hz of [30,60,120])for(const direction of [{x:1,z:0},{x:Math.SQRT1_2,z:Math.SQRT1_2}]){
  const f=await fixture({height:0});try{
   const records=run(f,{hz,seconds:4,direction}),settled=records.filter(r=>r.time>.3).map(r=>r.after.y);
   assert.ok(Math.min(...records.map(r=>r.after.y))>.849,'ground following must not accumulate penetration into the floor: '+JSON.stringify({hz,direction}));
   assert.ok(Math.max(...settled)-Math.min(...settled)<.001,'settled floor following stays within one millimetre: '+JSON.stringify({hz,direction}));
  }finally{f.world.free();}
 }
});

test('the rounded capsule footprint can support a stationary visitor just beyond a platform edge or corner',async()=>{
 for(const hz of [30,60,120])for(const start of [{x:.9,y:1.36,z:0},{x:.9,y:1.36,z:10.1}]){
  const f=await fixture({start});try{
   const records=run(f,{hz,speed:0,seconds:2}),settled=records.filter(r=>r.time>.5),label=JSON.stringify({hz,start});
   assert.ok(f.motor.grounded,'walkable peripheral contact counts as ground even when the centre ray misses '+label);
   assert.ok(Math.abs(f.motor.velocityY)<.001,'peripheral support cannot accumulate hidden downward velocity '+label);
   assert.ok(settled.every(r=>r.after.y>1.25),'the capsule remains on the upper platform '+label);
   assert.ok(Math.max(...settled.map(r=>r.after.y))-Math.min(...settled.map(r=>r.after.y))<.003,'resting on rounded support stays settled '+label);
  }finally{f.world.free();}
 }
});

test('moving, stopping and restarting along a supported rounded edge never accumulates falling velocity',async()=>{
 for(const hz of [30,60,120]){
  const f=await fixture({start:{x:.9,y:1.36,z:0}});try{
   const records=[...run(f,{hz,seconds:1.4,stopAfter:.65,direction:{x:0,z:1}}),...run(f,{hz,speed:0,seconds:.5}),...run(f,{hz,seconds:1.3,stopAfter:.65,direction:{x:0,z:1}})];
   assert.ok(records.every(r=>r.after.y>1.25),'parallel travel remains on peripheral support at '+hz+' Hz');
   assert.ok(records.every(r=>Math.abs(r.velocityY)<.1),'stop/start cannot retain stale falling velocity at '+hz+' Hz');
   assert.ok(f.motor.grounded&&Math.abs(f.motor.velocityY)<.001,'resuming and stopping returns to settled support at '+hz+' Hz');
  }finally{f.world.free();}
 }
});

test('a steep capsule-edge contact cannot masquerade as a walkable floor',async()=>{
 for(const hz of [30,120]){
  const f=await fixture({start:{x:.76,y:1.25,z:0}});try{
   const floors=[];f.world.forEachCollider(c=>{if(c.translation().y<0)floors.push(c);});for(const floor of floors)f.world.removeCollider(floor,true);f.world.step();
   const records=run(f,{hz,speed:0,seconds:2});
   assert.ok(records.at(-1).after.y<.5,'the unsupported capsule falls away from an overly steep peripheral contact at '+hz+' Hz');
   assert.ok(!f.motor.grounded&&f.motor.velocityY< -1,'steep peripheral contact cannot reset gravity at '+hz+' Hz');
  }finally{f.world.free();}
 }
});
