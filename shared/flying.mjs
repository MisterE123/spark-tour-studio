import RAPIER from '@dimforge/rapier3d-compat';

// Sweep the camera volume, then slide the remaining motion along contact surfaces.
// No gravity or ground snapping: drone movement remains fully three-dimensional.
export function flyMovement(world,position,desired,exclude){
 const p={...position},remaining={...desired},result={x:0,y:0,z:0};
 for(let i=0;i<4;i++){
  const length=Math.hypot(remaining.x,remaining.y,remaining.z);if(length<1e-6)break;
  const hit=world.castShape(p,{x:0,y:0,z:0,w:1},remaining,new RAPIER.Ball(.2),.015,1,false,undefined,undefined,exclude);
  const fraction=hit?Math.max(0,Math.min(1,hit.time_of_impact)-.001/length):1;
  for(const axis of ['x','y','z']){const delta=remaining[axis]*fraction;p[axis]+=delta;result[axis]+=delta;remaining[axis]*=1-fraction;}
  if(!hit)break;
  const n=hit.normal1,dot=remaining.x*n.x+remaining.y*n.y+remaining.z*n.z;
  if(dot>=-1e-6)break;
  for(const axis of ['x','y','z'])remaining[axis]-=n[axis]*dot;
 }
 return result;
}

export function nearbyFlyPosition(world,eye,exclude){const shape=new RAPIER.Ball(.2),rotation={x:0,y:0,z:0,w:1};const clear=p=>!world.intersectionWithShape(p,rotation,shape,undefined,undefined,exclude);if(clear(eye))return {...eye};const directions=[];for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){const length=Math.hypot(x,y,z);if(length)directions.push({x:x/length,y:y/length,z:z/length});}for(const distance of [.1,.25,.5,.75,1,1.5,2,3])for(const d of directions){const p={x:eye.x+d.x*distance,y:eye.y+d.y*distance,z:eye.z+d.z*distance};if(clear(p))return p;}return null;}
