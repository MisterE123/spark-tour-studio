import RAPIER from '@dimforge/rapier3d-compat';
export const DEFAULT_STEP_HEIGHT=.5334;
export function normalizeStepHeight(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):DEFAULT_STEP_HEIGHT;}
export function configureWalkingController(controller,stepHeight=DEFAULT_STEP_HEIGHT){
 const height=normalizeStepHeight(stepHeight);if(height>0)controller.enableAutostep(height,.2,false);else controller.disableAutostep();
 controller.enableSnapToGround(.3);controller.setMaxSlopeClimbAngle(Math.PI/4);controller.setMinSlopeSlideAngle(Math.PI/4);
}
const steps=new WeakMap(),rotation={x:0,y:0,z:0,w:1};
function stepAdvance(world,capsule,p,dy,forward){
 const shape=new RAPIER.Capsule(capsule.halfHeight(),capsule.radius()),raised={x:p.x,y:p.y+dy,z:p.z};
 if(world.intersectionWithShape(raised,rotation,shape,undefined,undefined,capsule))return null;
 if(dy>1e-6&&world.castShape(p,rotation,{x:0,y:dy,z:0},shape,.005,1,true,undefined,undefined,capsule))return null;
 if(world.castShape(raised,rotation,forward,shape,.005,1,true,undefined,undefined,capsule))return null;
 return {x:forward.x,y:dy,z:forward.z,waypoints:[{x:0,y:dy,z:0},{x:forward.x,y:dy,z:forward.z}]};
}
// Keep the step decision independent of rendering and of the streamed splat LoD.
export function characterMovement(world,controller,capsule,body,desired,stepHeight=DEFAULT_STEP_HEIGHT){
 stepHeight=normalizeStepHeight(stepHeight);
 controller.computeColliderMovement(capsule,desired);
 const movement=controller.computedMovement();
 const length=Math.hypot(desired.x,desired.z),actual=Math.hypot(movement.x,movement.z);
 const p=body.translation(),pending=steps.get(controller);
 if(pending){
  steps.delete(controller);
  // Bridge only the capsule's approach to this already checked landing. Stop
  // assisting immediately on reversal, a jump, changed settings or relocation.
  if(length>1e-5&&desired.y<=0&&pending.height===stepHeight&&pending.halfHeight===capsule.halfHeight()&&pending.radius===capsule.radius()&&Math.hypot(p.x-pending.expected.x,p.y-pending.expected.y,p.z-pending.expected.z)<.03&&(desired.x*pending.direction.x+desired.z*pending.direction.z)/length>.8){
   const advance=stepAdvance(world,capsule,p,Math.max(0,pending.y-p.y),{x:desired.x,y:0,z:desired.z});
   if(advance){pending.remaining-=length;pending.expected={x:p.x+advance.x,y:p.y+advance.y,z:p.z+advance.z};if(pending.remaining>0)steps.set(controller,pending);return advance;}
  }
 }
 if(length<1e-5||actual>=length*.85||desired.y>0||stepHeight===0)return movement;
 const halfHeight=capsule.halfHeight(),radius=capsule.radius(),height=halfHeight+radius;
 const bottom=p.y-height;
 const floor=world.castRay(new RAPIER.Ray(p,{x:0,y:-1,z:0}),height+.07,true,undefined,undefined,capsule);
 if(!floor)return movement;
 // A diagonal approach needs enough distance along the blocking face's normal
 // to reach its top, without increasing the visitor's requested movement.
 let incidence=1;for(let i=0;i<controller.numComputedCollisions();i++){const normal=controller.computedCollision(i)?.normal1;if(normal&&Math.abs(normal.y)<.5){const approach=-(desired.x*normal.x+desired.z*normal.z)/length;if(approach>.1)incidence=Math.min(incidence,approach);}}
 const probeHeight=stepHeight+.03,reach=Math.min(1.5,(radius+.03)/incidence+length);
 const probe={x:p.x+desired.x/length*reach,y:bottom+probeHeight,z:p.z+desired.z/length*reach};
 const step=world.castRayAndGetNormal(new RAPIER.Ray(probe,{x:0,y:-1,z:0}),probeHeight,true,undefined,undefined,capsule);
 if(!step||step.normal.y<Math.SQRT1_2)return movement;
 const rise=probeHeight-step.timeOfImpact;
 if(rise<.03||rise>stepHeight+1e-5)return movement;
 // Check room for the complete landing, but advance only this frame's input.
 const landing={x:probe.x-p.x,y:0,z:probe.z-p.z};
 if(!stepAdvance(world,capsule,p,rise+.02,landing))return movement;
 const advance=stepAdvance(world,capsule,p,rise+.02,{x:desired.x,y:0,z:desired.z});if(!advance)return movement;
 steps.set(controller,{y:p.y+advance.y,height:stepHeight,halfHeight:halfHeight,radius,remaining:reach-length,direction:{x:desired.x/length,z:desired.z/length},expected:{x:p.x+advance.x,y:p.y+advance.y,z:p.z+advance.z}});
 return advance;
}

// Validate the actual rise-then-advance trajectory, not a diagonal shortcut
// through the riser. Every segment still needs verified finest collision data.
export function walkingMotionAllowed(origin,movement,allows){
 let previous=origin;const offsets=movement.waypoints||[movement];
 for(const offset of offsets){const next={x:origin.x+offset.x,y:origin.y+offset.y,z:origin.z+offset.z};if(!allows(previous,next))return false;previous=next;}return true;
}

// A ground click must stay on the clicked storey. Mode-switch placement uses
// the broader search below, but click-to-walk must never find a basement floor.
export function clickedWalkingFeet(world,point,exclude,allowed=p=>true,tolerance=.25){
 tolerance=Number.isFinite(tolerance)?Math.max(.1,Math.min(.75,tolerance)):.25;
 const origin={x:point.x,y:point.y+tolerance,z:point.z},hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),tolerance*2,true,undefined,undefined,exclude);
 if(!hit||hit.normal.y<Math.SQRT1_2)return null;
 const y=origin.y-hit.timeOfImpact,clearance=Math.max(.87,.6+.25/hit.normal.y+.02),center={x:point.x,y:y+clearance,z:point.z};
 if(!allowed(center)||world.intersectionWithShape(center,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.6,.25),undefined,undefined,exclude))return null;
 return {x:point.x,y:y+clearance-.87,z:point.z};
}

// Search only on mode changes. Keep horizontal position when a safe floor is below it.
export function nearbyWalkingFeet(world,eye,eyeHeight,exclude,radius=3,allowed=p=>true){
 const shape=new RAPIER.Capsule(.6,.25),rotation={x:0,y:0,z:0,w:1};
 const at=(x,z)=>{const origin={x,y:eye.y+.35,z},hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),5.35,true,undefined,undefined,exclude);if(!hit||hit.normal.y<Math.SQRT1_2)return null;const feet={x,y:origin.y-hit.timeOfImpact,z};if(feet.y>eye.y+.1)return null;const clearance=Math.max(.87,.6+.25/hit.normal.y+.02),center={x,y:feet.y+clearance,z};if(!allowed(center)||world.intersectionWithShape(center,rotation,shape,undefined,undefined,exclude))return null;feet.y+=clearance-.87;return feet;};
 const same=at(eye.x,eye.z);if(same)return same;
 for(const distance of [.25,.5,.75,1,1.5,2,3]){if(distance>radius)break;for(let i=0;i<24;i++){const angle=i*Math.PI/12,feet=at(eye.x+Math.cos(angle)*distance,eye.z+Math.sin(angle)*distance);if(feet&&Math.abs(feet.y+eyeHeight-eye.y)<=5)return feet;}}
 return null;
}
