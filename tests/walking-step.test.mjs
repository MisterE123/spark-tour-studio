import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {WalkingMotor,configureWalkingController,walkingMotionAllowed} from '../shared/walking.mjs';
import {segmentBoxDistanceSquared} from '../shared/collision-stream.mjs';

const initialized=RAPIER.init(),stepHeight=.5334;
async function fixture(height,{ceiling,wall,airborne=false,crouched=false,trimesh=false,direction={x:1,z:0}}={}){
 await initialized;const world=new RAPIER.World({x:0,y:-9.81,z:0});
 world.createCollider(RAPIER.ColliderDesc.cuboid(10,.1,10).setTranslation(0,-.1,0));
 if(trimesh){
  const vertices=new Float32Array([1,0,-10,5,0,-10,5,0,10,1,0,10,1,height,-10,5,height,-10,5,height,10,1,height,10]),indices=new Uint32Array([0,1,2,0,2,3,4,6,5,4,7,6,0,5,1,0,4,5,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2]);
  world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices));
 }else world.createCollider(RAPIER.ColliderDesc.cuboid(2,height/2,10).setTranslation(3,height/2,0));
 if(ceiling)world.createCollider(RAPIER.ColliderDesc.cuboid(3,.1,3).setTranslation(2,ceiling+.1,0));
 if(wall)world.createCollider(RAPIER.ColliderDesc.cuboid(.1,2,3).setTranslation(wall+.1,2,0));
 const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0,airborne?1.3:crouched?.57:.87,0)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(crouched?.3:.6,.25),body),controller=world.createCharacterController(.015),motor=new WalkingMotor();
 configureWalkingController(controller,stepHeight);world.step();return {world,body,capsule,controller,motor,direction};
}
function tick(f,input={}){
 return f.motor.step(f.world,f.controller,f.capsule,f.body,{x:f.direction.x/60,z:f.direction.z/60,dt:1/60,...input});
}
function run(f,{height=stepHeight,frames=200}={}){
 const records=[];let highest=f.body.translation().y;
 for(let frame=0;frame<frames;frame++){
  const before={...f.body.translation()},movement=tick(f,{stepHeight:height}),next={...f.body.translation()};
  assert.ok(Object.values(next).every(Number.isFinite),'movement remains finite');if(movement.y>.08)records.push({before,movement});highest=Math.max(highest,next.y);
 }
 return {position:{...f.body.translation()},highest,records};
}

test('walking climbs coarse half-metre voxel steps with the 0.5334 m default',async()=>{
 const f=await fixture(.5);try{
  let highest=0;const records=[];
  for(let i=0;i<220;i++){
   const before={...f.body.translation()},movement=tick(f);if(movement.y>.08)records.push({before,movement});highest=Math.max(highest,f.body.translation().y);
  }
  assert.ok(f.body.translation().x>2,'capsule crosses the riser instead of stalling');assert.ok(highest>1.35&&highest<1.45,'standing height follows the half-metre platform');assert.ok(records.length>0,'an explicit coarse step was taken');
  for(const {movement} of records){assert.ok(movement.stepped,'large rises come from a validated terrain step');assert.ok(Math.hypot(movement.x,movement.z)<=1/60+1e-6,'step assistance keeps the requested walking speed');}
 }finally{f.world.free();}
});

test('walking honours a 1.75 ft (0.5334 m) step limit and smaller explicit limits',async()=>{
 for(const [obstacle,limit,climbs] of [[.5334,.5334,true],[.6,.5334,false],[.15,.2,true],[.3,.2,false]]){
  const f=await fixture(obstacle);try{const result=run(f,{height:limit,frames:300});assert.equal(result.position.x>2,climbs,JSON.stringify({obstacle,limit,...result}));if(!climbs)assert.ok(result.position.x<.85,'a too-high ledge remains a wall');}finally{f.world.free();}
 }
});

test('coarse steps cannot lift a walking capsule into a ceiling or through a landing wall',async()=>{
 for(const options of [{ceiling:2.05},{wall:1.18}]){
  const f=await fixture(.5,options);try{const result=run(f);assert.ok(result.position.x<.85,'blocked landing remains inaccessible');assert.ok(result.highest<1.1,'capsule is not teleported onto an obstructed landing: '+JSON.stringify({options,...result}));}finally{f.world.free();}
 }
});

test('step assistance requires ground support and does not add a step while jumping',async()=>{
 for(const options of [{airborne:true},{jump:true}]){
  const f=await fixture(.5,options);try{
   if(options.jump){for(let i=0;i<10;i++)tick(f,{x:0,z:0});}
   f.body.setTranslation({x:.72,y:options.airborne?1.3:f.body.translation().y,z:0},true);f.world.step();const movement=tick(f,{jump:!!options.jump});
   assert.ok(!movement.stepped,'assistance is not used without grounded downward movement');assert.ok(movement.y<.1,'no instantaneous half-metre rise is injected');
  }finally{f.world.free();}
 }
});

test('walking can approach a coarse step diagonally without changing its height limit',async()=>{
 const f=await fixture(.5,{direction:{x:Math.SQRT1_2,z:Math.SQRT1_2}});try{const result=run(f,{frames:300});assert.ok(result.position.x>1.5&&result.position.z>1.5,'both components advance across the edge: '+JSON.stringify(result));assert.ok(result.highest>1.35,'capsule climbed diagonally: '+JSON.stringify(result));}finally{f.world.free();}
});

test('triangle voxel surfaces support coarse stepping from straight and diagonal approaches',async()=>{
 for(const direction of [{x:1,z:0},{x:Math.SQRT1_2,z:Math.SQRT1_2}]){
  const f=await fixture(.5,{trimesh:true,direction});try{const result=run(f,{frames:300});assert.ok(result.position.x>2,'capsule crosses the triangle riser: '+JSON.stringify(result));assert.ok(result.highest>1.35&&result.highest<1.45,'trimesh landing has the expected height');}finally{f.world.free();}
 }
});

test('walking can climb consecutive coarse voxel risers without treating the total rise as one step',async()=>{
 const f=await fixture(.5);try{f.world.createCollider(RAPIER.ColliderDesc.cuboid(2,.5,10).setTranslation(4,.5,0));f.world.step();const result=run(f,{frames:420});assert.ok(result.position.x>3,'capsule crosses both risers: '+JSON.stringify(result));assert.ok(result.highest>1.85&&result.highest<1.95,'two 0.5 m risers raise the feet by one metre');}finally{f.world.free();}
});

test('coarse stepping uses the current crouched capsule for overhead clearance',async()=>{
 const f=await fixture(.5,{crouched:true,ceiling:1.8});try{const result=run(f,{frames:300});assert.ok(result.position.x>2,'the shorter capsule fits beneath the landing ceiling');assert.ok(result.highest>1.05&&result.highest<1.15,'crouched physical height stays correct on the step');}finally{f.world.free();}
});

test('paged walking validates the rise then forward trajectory and keeps unknown ceilings blocked',()=>{
 const origin={x:-.3,y:.87,z:0},movement={x:.4,y:.5,z:0,waypoints:[{x:0,y:.5,z:0},{x:.4,y:.5,z:0}]},destination={x:.1,y:1.37,z:0},riser={min:[0,0,-1],max:[1,.5,1]},unknownCeiling={min:[-.5,2,-1],max:[.5,3,1]};
 const allows=boxes=>(from,to)=>boxes.every(box=>segmentBoxDistanceSquared([from.x,from.y,from.z],[to.x,to.y,to.z],box.min.map((v,i)=>v-(i===1?.6:0)),box.max.map((v,i)=>v+(i===1?.6:0)))>=.24**2-1e-10);
 assert.equal(allows([riser])(origin,destination),false,'straight shortcut intersects the riser');assert.equal(walkingMotionAllowed(origin,movement,allows([riser])),true,'verified rise and advance safely pass above it');assert.equal(walkingMotionAllowed(origin,movement,allows([riser,unknownCeiling])),false,'an unprepared space above the capsule blocks the upward part');assert.equal(walkingMotionAllowed(origin,{x:.4,y:.5,z:0},allows([riser])),false,'ordinary movements retain a continuous direct sweep');
});

test('step continuation cancels on intent, relocation, setting and capsule changes',async()=>{
 const changes=[
  {name:'reverse',input:{x:-1/60}},
  {name:'release movement',input:{x:0,z:0}},
  {name:'jump',input:{jump:true}},
  {name:'lower step height',input:{stepHeight:.2}},
  {name:'relocation',change:f=>{f.body.setTranslation({x:-3,y:1.37,z:0},true);f.motor.reset();f.world.step();}},
  {name:'capsule shape',change:f=>{f.capsule.setShape(new RAPIER.Capsule(.3,.25));f.motor.reset();f.world.step();}},
 ];
 for(const change of changes){
  const f=await fixture(.5);try{
   let stepped=false;for(let frame=0;frame<150&&!stepped;frame++){const movement=tick(f);stepped=movement.y>.08&&movement.stepped;}
   assert.ok(stepped,'fixture reaches its first step before '+change.name);change.change?.(f);const before={...f.body.translation()},movement=tick(f,change.input);
   assert.ok(!movement.stepped,'old landing assistance is cancelled after '+change.name);assert.ok(movement.y<.1,'cancellation never injects an old upward lift');
   if(change.name==='release movement')assert.ok(Math.hypot(f.body.translation().x-before.x,f.body.translation().z-before.z)<.001,'releasing intent cannot continue horizontal assistance');
  }finally{f.world.free();}
 }
});
