import RAPIER from '@dimforge/rapier3d-compat';
import {WalkingMotor,configureWalkingController,DEFAULT_STEP_HEIGHT} from './walking.mjs';
let ready;
// Test shortcuts with the same capsule, gravity and automatic stepping as the
// visitor, in an isolated world. No jumps, smaller capsule or live-world edits.
export async function physicalWalkingPath(parts,start,end,waypoints=[start,end],stepHeight=DEFAULT_STEP_HEIGHT){
 if(Math.hypot(end.x-start.x,end.y-start.y,end.z-start.z)>16)return null;
 await (ready??=RAPIER.init());const world=new RAPIER.World({x:0,y:-9.81,z:0});
 try{
  for(const part of parts)if(part.indices.length)world.createCollider(RAPIER.ColliderDesc.trimesh(part.positions,part.indices));
  const body=world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,start.y+.85,start.z)),capsule=world.createCollider(RAPIER.ColliderDesc.capsule(.6,.25),body),controller=world.createCharacterController(.015),motor=new WalkingMotor();configureWalkingController(controller);world.step();
  const points=[{...start}];let index=0,stalled=0,groundY=start.y;
  const budget=Math.min(2400,Math.ceil(Math.hypot(end.x-start.x,end.z-start.z)*120)+180);
  for(let frame=0;frame<budget;frame++){
   const p={...body.translation()};while(index<waypoints.length&&Math.hypot(waypoints[index].x-p.x,waypoints[index].z-p.z)<.15)index++;
   if(index===waypoints.length)return Math.abs(p.y-.87-end.y)<.25&&motor.grounded?points:null;
   const target=waypoints[index],distance=Math.hypot(target.x-p.x,target.z-p.z),speed=Math.min(2,distance*60);
   const movement=motor.step(world,controller,capsule,body,{x:(target.x-p.x)/distance*speed,z:(target.z-p.z)/distance*speed,dt:1/60,stepHeight});
   const next=body.translation(),feet={x:next.x,y:next.y-.87,z:next.z},last=points.at(-1);
   if(feet.y<groundY-stepHeight-.06)return null;if(motor.grounded)groundY=feet.y;
   if(Math.hypot(feet.x-last.x,feet.z-last.z)>.12||Math.abs(feet.y-last.y)>.04)points.push(feet);
   stalled=Math.hypot(movement.x,movement.z)<.0005?stalled+1:0;
   if(stalled>60||feet.y<Math.min(start.y,end.y)-1)return null;
  }
  return null;
 }finally{world.free();}
}
