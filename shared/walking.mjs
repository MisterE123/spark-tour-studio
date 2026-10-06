import RAPIER from '@dimforge/rapier3d-compat';
// Keep the step decision independent of rendering and of the streamed splat LoD.
export function characterMovement(world,controller,capsule,body,desired){
 controller.computeColliderMovement(capsule,desired);
 const movement=controller.computedMovement();
 const length=Math.hypot(desired.x,desired.z),actual=Math.hypot(movement.x,movement.z);
 if(length<1e-5||actual>=length*.85||desired.y>0)return movement;
 const halfHeight=capsule.halfHeight(),radius=capsule.radius(),height=halfHeight+radius;
 const p=body.translation(),bottom=p.y-height;
 const floor=world.castRay(new RAPIER.Ray(p,{x:0,y:-1,z:0}),height+.07,true,undefined,undefined,capsule);
 if(!floor)return movement;
 const probe={x:p.x+desired.x/length*(.28+length),y:bottom+.28,z:p.z+desired.z/length*(.28+length)};
 const step=world.castRayAndGetNormal(new RAPIER.Ray(probe,{x:0,y:-1,z:0}),.28,true,undefined,undefined,capsule);
 if(!step||step.normal.y<Math.SQRT1_2)return movement;
 const rise=.28-step.timeOfImpact;
 if(rise<.03||rise>.25)return movement;
 const raised={x:p.x,y:p.y+rise+.02,z:p.z};
 if(world.intersectionWithShape(raised,{x:0,y:0,z:0,w:1},new RAPIER.Capsule(halfHeight,radius),undefined,undefined,capsule))return movement;
 // Shape-cast vertically so a low ceiling cannot be crossed during a step.
 controller.computeColliderMovement(capsule,{x:0,y:rise+.02,z:0});
 const up=controller.computedMovement();
 if(up.y<rise)return movement;
 const forward={x:probe.x-p.x,y:0,z:probe.z-p.z};
 const obstruction=world.castShape(raised,{x:0,y:0,z:0,w:1},forward,new RAPIER.Capsule(halfHeight,radius),.005,1,true,undefined,undefined,capsule);
 if(obstruction)return movement;
 return {x:forward.x,y:up.y,z:forward.z};
}

// Search only on mode changes. Keep horizontal position when a safe floor is below it.
export function nearbyWalkingFeet(world,eye,eyeHeight,exclude,radius=3){
 const shape=new RAPIER.Capsule(.6,.25),rotation={x:0,y:0,z:0,w:1};
 const at=(x,z)=>{const origin={x,y:eye.y+.35,z},hit=world.castRayAndGetNormal(new RAPIER.Ray(origin,{x:0,y:-1,z:0}),5.35,true,undefined,undefined,exclude);if(!hit||hit.normal.y<Math.SQRT1_2)return null;const feet={x,y:origin.y-hit.timeOfImpact,z};if(feet.y>eye.y+.1)return null;const clearance=Math.max(.87,.6+.25/hit.normal.y+.02),center={x,y:feet.y+clearance,z};if(world.intersectionWithShape(center,rotation,shape,undefined,undefined,exclude))return null;feet.y+=clearance-.87;return feet;};
 const same=at(eye.x,eye.z);if(same)return same;
 for(const distance of [.25,.5,.75,1,1.5,2,3]){if(distance>radius)break;for(let i=0;i<24;i++){const angle=i*Math.PI/12,feet=at(eye.x+Math.cos(angle)*distance,eye.z+Math.sin(angle)*distance);if(feet&&Math.abs(feet.y+eyeHeight-eye.y)<=5)return feet;}}
 return null;
}
