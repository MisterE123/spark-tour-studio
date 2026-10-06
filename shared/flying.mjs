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
