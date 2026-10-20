import RAPIER from '@dimforge/rapier3d-compat';
export const DEFAULT_STEP_HEIGHT=.5334;
export function normalizeStepHeight(value){return Number.isFinite(value)?Math.max(0,Math.min(1,value)):DEFAULT_STEP_HEIGHT;}
export function configureWalkingController(controller){
 // Rapier handles collision/sliding. This motor alone owns stairs and ground
 // following; running native autostep/snap as well produces competing lifts.
 controller.disableAutostep();controller.disableSnapToGround();controller.setSlideEnabled(true);
 controller.setMaxSlopeClimbAngle(Math.PI/4);controller.setMinSlopeSlideAngle(Math.PI/4);
}
const rotation={x:0,y:0,z:0,w:1},upNormal=Math.SQRT1_2-1e-4;
const point=(p,d)=>({x:p.x+d.x,y:p.y+d.y,z:p.z+d.z});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

/** One authoritative walking state; visual smoothing never enters this solver. */
export class WalkingMotor {
 constructor(){this.reset();}
 reset(){this.velocityY=0;this.grounded=false;this.plan=undefined;this.expected=undefined;this.jumping=false;this.dropAnchor=undefined;}
 support(world,capsule,p,down){
  if(down<=0)return null;
  const half=capsule.halfHeight(),radius=capsule.radius(),shape=new RAPIER.Capsule(half,radius);
  const clearAt=y=>!world.intersectionWithShape({x:p.x,y,z:p.z},rotation,shape,undefined,undefined,capsule);
  const hit=world.castRayAndGetNormal(new RAPIER.Ray(p,{x:0,y:-1,z:0}),half+radius+down+.04,true,undefined,undefined,capsule);
  if(hit&&hit.normal.y>=upNormal){
   const floor=p.y-hit.timeOfImpact,target=floor+half+(radius+.015)/hit.normal.y,gap=p.y-target;
   if(gap<=down+.002&&gap>=-.04&&clearAt(target))return {distance:gap,normal:hit.normal,clear:true,floor};
  }
  // A capsule can stand on an edge even when its center ray misses the floor.
  // Shrink the probe and its margin to avoid mistaking a nearby wall for ground.
  const cast=world.castShape({x:p.x,y:p.y-half,z:p.z},rotation,{x:0,y:-down,z:0},new RAPIER.Ball(Math.max(.01,radius-.002)),.001,1,true,undefined,undefined,capsule);
  if(cast&&cast.normal1.y>=upNormal){
   const gap=cast.time_of_impact*down-.016/cast.normal1.y;
   if(gap<=down+.002&&gap>=-.04&&clearAt(p.y-gap))return {distance:gap,normal:cast.normal1,clear:true,floor:p.y-gap-half-radius-.015};
  }
  // This ray is useful only for classifying a short terrain descent. It never
  // grants support or permits a capsule to move through the overhanging edge.
  if(hit&&hit.normal.y>=upNormal){const floor=p.y-hit.timeOfImpact,target=floor+half+(radius+.015)/hit.normal.y,gap=p.y-target;if(gap<=down+.002&&gap>=-.04)return {distance:gap,normal:hit.normal,clear:false,floor};}
  return null;
 }
 clear(world,capsule,from,to){
  const delta={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z};
  if(Math.hypot(delta.x,delta.y,delta.z)<1e-7)return true;
  return !world.castShape(from,rotation,delta,new RAPIER.Capsule(capsule.halfHeight(),capsule.radius()),.005,1,true,undefined,undefined,capsule);
 }
 validPath(origin,waypoints,allows){let previous=origin;for(const offset of waypoints){const next=point(origin,offset);if(!allows(previous,next))return false;previous=next;}return true;}
 stair(world,controller,capsule,p,dx,dz,height,contacts,allows){
  const length=Math.hypot(dx,dz),radius=capsule.radius(),extent=capsule.halfHeight()+radius,foot=p.y-extent-.015,dir={x:dx/length,z:dz/length};
  for(const contact of contacts){
   const n=contact.normal,horizontal=Math.hypot(n.x,n.z),incidence=horizontal?-(dir.x*n.x+dir.z*n.z)/horizontal:0;
   if(incidence<.1||n.y>=upNormal||!contact.collider)continue;
   // Probe immediately inside the actual blocking face. A fixed distant ray
   // can jump right over a narrow voxel, especially with a large step limit.
   const probe={x:contact.witness.x-n.x/horizontal*.005,y:foot+height+.03,z:contact.witness.z-n.z/horizontal*.005};
   const top=world.castRayAndGetNormal(new RAPIER.Ray(probe,{x:0,y:-1,z:0}),height+.06,true,undefined,undefined,capsule,undefined,collider=>collider.handle===contact.collider.handle);
   if(!top||top.normal.y<upNormal)continue;
   const topY=probe.y-top.timeOfImpact,rise=topY+extent+.015-p.y;
   if(rise<.008||rise>height+.002)continue;
   const raised={x:p.x,y:p.y+rise,z:p.z};if(!this.clear(world,capsule,p,raised))continue;
   const startReach=Math.min(1.25,(radius+.025)/Math.max(.25,incidence)+.05);
   for(const reach of [startReach,Math.min(1.5,startReach+radius)]){
    const landing={x:p.x+dir.x*reach,y:raised.y,z:p.z+dir.z*reach};
    if(!this.clear(world,capsule,raised,landing))continue;
    const support=this.support(world,capsule,landing,height+.06);
    if(!support?.clear)continue;
    const end={x:landing.x,y:landing.y-support.distance,z:landing.z};
    // Verify the whole planned bridge and its landing before accepting any
    // upward motion. Unknown pages cannot become temporary stepping space.
    const proof=[{x:0,y:rise,z:0},{x:landing.x-p.x,y:rise,z:landing.z-p.z},{x:end.x-p.x,y:end.y-p.y,z:end.z-p.z}];
    if(!this.validPath(p,proof,allows))continue;
    const movement={x:dx,y:rise,z:dz,waypoints:[{x:0,y:rise,z:0},{x:dx,y:rise,z:dz}]};
    if(!this.clear(world,capsule,raised,point(raised,{x:dx,y:0,z:dz}))||!this.validPath(p,movement.waypoints,allows))continue;
    return {movement,plan:{y:raised.y,remaining:Math.max(0,reach-length),direction:dir,height,halfHeight:capsule.halfHeight(),radius}};
   }
  }
  return null;
 }
 step(world,controller,capsule,body,{x=0,z=0,dt=1/60,jump=false,stepHeight=DEFAULT_STEP_HEIGHT,allows=(from,to)=>Boolean(true)}={}){
  dt=Math.max(.00001,Math.min(.05,Number.isFinite(dt)?dt:1/60));stepHeight=normalizeStepHeight(stepHeight);world.timestep=dt;
  const p={...body.translation()};if(this.expected&&distance(p,this.expected)>.04)this.reset();
  const length=Math.hypot(x,z),probe=this.support(world,capsule,p,.06),near=probe?.clear?probe:null,previousGround=this.grounded||!!near;
  if(near&&!this.jumping&&this.velocityY<=0){this.grounded=true;this.velocityY=0;}
  if(jump&&this.grounded){this.velocityY=4.8;this.grounded=false;this.jumping=true;this.plan=undefined;}
  let bridge=this.plan;this.plan=undefined;
  if(bridge&&(jump||length<1e-6||bridge.height!==stepHeight||bridge.halfHeight!==capsule.halfHeight()||bridge.radius!==capsule.radius()||(x*bridge.direction.x+z*bridge.direction.z)/length<.8))bridge=undefined;
  if(bridge&&near)bridge=undefined;
  const onGround=!this.jumping&&(!!near||!!bridge);
  if(onGround)this.velocityY=0;else this.velocityY=Math.max(-15,this.velocityY-9.81*dt);
  const desired={x,y:onGround?0:this.velocityY*dt,z};
  controller.computeColliderMovement(capsule,desired);
  let movement={...controller.computedMovement()},contacts=[];
  for(let i=0;i<controller.numComputedCollisions();i++){const hit=controller.computedCollision(i);if(hit)contacts.push({normal:{...hit.normal1},witness:{...hit.witness1},collider:hit.collider});}
  let terrain=false,stepped=false,collisions=contacts.map(hit=>hit.normal),waypoints=[movement],nextPlan;
  if(bridge){
   const rise=Math.max(0,bridge.y-p.y),raised={x:p.x,y:p.y+rise,z:p.z};
   const path=[{x:0,y:rise,z:0},{x,y:rise,z}];
   if(this.clear(world,capsule,p,raised)&&this.clear(world,capsule,raised,point(raised,{x,y:0,z}))&&this.validPath(p,path,allows)){
    movement={x,y:rise,z};waypoints=path;bridge.remaining-=length;nextPlan=bridge.remaining>0?bridge:undefined;terrain=true;stepped=true;collisions=[];
   }else bridge=undefined;
  }
  if(!stepped&&onGround&&length>1e-6&&stepHeight>0&&(movement.x*x+movement.z*z)<length*length*.98){
   const stair=this.stair(world,controller,capsule,p,x,z,stepHeight,contacts,allows);
   if(stair){movement=stair.movement;waypoints=movement.waypoints;nextPlan=stair.plan;terrain=true;stepped=true;collisions=[];}
  }
  if((!stepped||!nextPlan)&&(onGround||stepped)){
   const at=point(p,movement),ground=this.support(world,capsule,at,Math.max(.06,stepHeight+.03));
   if(ground?.clear){const down={x:movement.x,y:movement.y-ground.distance,z:movement.z};const path=stepped?[...waypoints,down]:[down];if(this.validPath(p,path,allows)){movement=down;waypoints=path;terrain=true;}}
  }
  // Never accept a backwards contact kick when the visitor keeps pushing
  // forward. Slide along the wall or stop instead of restarting the approach.
  if(!stepped&&length>1e-6&&(movement.x*x+movement.z*z)<-1e-7){movement={x:0,y:movement.y,z:0};waypoints=[movement];}
  let blocked=false;
  if(!this.validPath(p,waypoints,allows)){movement={x:0,y:0,z:0};nextPlan=undefined;terrain=false;stepped=false;blocked=true;this.velocityY=0;collisions=[];}
  body.setNextKinematicTranslation(point(p,movement));world.step();const next={...body.translation()},ground=this.support(world,capsule,next,.04);
  this.grounded=!!nextPlan||!!ground?.clear&&!this.jumping;
  if(this.velocityY<=0&&(ground?.clear||contacts.some(hit=>hit.normal.y>=upNormal)&&desired.y<0&&movement.y>desired.y+.001)){this.grounded=true;this.velocityY=0;this.jumping=false;}
  if(stepped||terrain)this.velocityY=0;
  if(desired.y>0&&movement.y<desired.y-.001)this.velocityY=0;
  if(!this.jumping&&!this.grounded){
   if(previousGround&&this.dropAnchor===undefined)this.dropAnchor=p.y-capsule.halfHeight()-capsule.radius()-.015;
   const below=this.support(world,capsule,next,stepHeight+.06);
   if(this.dropAnchor!==undefined&&below&&this.dropAnchor-below.floor<=stepHeight+.06&&this.dropAnchor-below.floor>=-.06)terrain=true;else this.dropAnchor=undefined;
  }else this.dropAnchor=undefined;
  this.plan=nextPlan;this.expected=next;
  return {x:next.x-p.x,y:next.y-p.y,z:next.z-p.z,grounded:this.grounded,terrain:terrain&&!this.jumping,stepped,blocked,collisions,waypoints};
 }
}

// Validate the actual rise-then-advance trajectory, not a diagonal shortcut
// through the riser. Every segment still needs verified finest collision data.
export function walkingMotionAllowed(origin,movement,allows){
 let previous=origin;const offsets=movement.waypoints||[movement];
 for(const offset of offsets){const next={x:origin.x+offset.x,y:origin.y+offset.y,z:origin.z+offset.z};if(!allows(previous,next))return false;previous=next;}return true;
}

// A ground click must stay on the clicked storey. Mode-switch placement uses
// the broader search below, but click-to-walk must never find a basement floor.
export function clickedWalkingFeet(world,point,exclude,allowed=p=>true,tolerance=.25,searchRadius=0){
 tolerance=Number.isFinite(tolerance)?Math.max(.1,Math.min(.75,tolerance)):.25;
 const at=(x,z)=>{const origin={x,y:point.y+tolerance,z},hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),tolerance*2,true,undefined,undefined,exclude);
  if(!hit||hit.normal.y<Math.SQRT1_2)return null;
  const y=origin.y-hit.timeOfImpact,clearance=Math.max(.87,.6+.25/hit.normal.y+.02),center={x,y:y+clearance,z};
  if(!allowed(center)||world.intersectionWithShape(center,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(.6,.25),undefined,undefined,exclude))return null;
  return {x,y:y+clearance-.87,z};};
 const exact=at(point.x,point.z);if(exact)return exact;
 // A point on a voxel stair edge may not fit a capsule. Try a small landing
 // nearby, preserving the clicked height/storey and all clearance checks.
 for(const radius of [.1,.2,.35,.5,.6]){if(radius>searchRadius)break;for(let i=0;i<16;i++){const angle=i*Math.PI/8,feet=at(point.x+Math.cos(angle)*radius,point.z+Math.sin(angle)*radius);if(feet)return feet;}}
 return null;
}

// Search only on mode changes. Keep horizontal position when a safe floor is below it.
export function nearbyWalkingFeet(world,eye,eyeHeight,exclude,radius=3,allowed=p=>true){
 const shape=new RAPIER.Capsule(.6,.25),rotation={x:0,y:0,z:0,w:1};
 const at=(x,z)=>{const origin={x,y:eye.y+.35,z},hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),5.35,true,undefined,undefined,exclude);if(!hit||hit.normal.y<Math.SQRT1_2)return null;const feet={x,y:origin.y-hit.timeOfImpact,z};if(feet.y>eye.y+.1)return null;const clearance=Math.max(.87,.6+.25/hit.normal.y+.02),center={x,y:feet.y+clearance,z};if(!allowed(center)||world.intersectionWithShape(center,rotation,shape,undefined,undefined,exclude))return null;feet.y+=clearance-.87;return feet;};
 const same=at(eye.x,eye.z);if(same)return same;
 for(const distance of [.25,.5,.75,1,1.5,2,3]){if(distance>radius)break;for(let i=0;i<24;i++){const angle=i*Math.PI/12,feet=at(eye.x+Math.cos(angle)*distance,eye.z+Math.sin(angle)*distance);if(feet&&Math.abs(feet.y+eyeHeight-eye.y)<=5)return feet;}}
 return null;
}
