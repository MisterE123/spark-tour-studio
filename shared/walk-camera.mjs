// Visual eye smoothing only. The walking capsule and its collision queries must
// continue to use their physical pose, never the value returned by this helper.
export class WalkCamera {
 constructor({timeConstant=.065,maxSpeed=2.5}={}){
  this.timeConstant=Number.isFinite(timeConstant)&&timeConstant>0?timeConstant:.065;
  this.maxSpeed=Number.isFinite(maxSpeed)&&maxSpeed>0?maxSpeed:2.5;
  this.y=undefined;
 }
 reset(targetY){
  this.y=Number.isFinite(targetY)?targetY:undefined;
  return this.y;
 }
 update(targetY,dt,{smooth=true,minY=-Infinity,maxY=Infinity}={}){
  if(!Number.isFinite(targetY))return this.y;
  // Grounded terrain steps may lag visually; jumping, falling, crouching and
  // discontinuous placements reset immediately to the authoritative eye height.
  let y=targetY;
  if(smooth&&this.y!==undefined){
   const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
   // Integrate y'=sign(error)*min(maxSpeed,abs(error)/timeConstant) exactly.
   // Large steps start at a bounded speed; their final .1625 m eases towards
   // the target. The analytic split is independent of the rendering rate.
   const error=targetY-this.y,distance=Math.abs(error),threshold=this.maxSpeed*this.timeConstant;
   const linearTime=Math.max(0,(distance-threshold)/this.maxSpeed);
   const remaining=elapsed<=linearTime?distance-this.maxSpeed*elapsed:Math.min(distance,threshold)*Math.exp(-(elapsed-linearTime)/this.timeConstant);
   y=targetY-Math.sign(error)*remaining;
   if(Math.abs(targetY-y)<1e-6)y=targetY;
  }
  // The runtime may narrow this interval after checking the visual head against
  // collision. Commit the clamped pose, so hidden lag cannot accumulate there.
  const low=Number.isFinite(minY)?minY:-Infinity,high=Number.isFinite(maxY)?maxY:Infinity;
  this.y=low<=high?Math.max(low,Math.min(high,y)):targetY;
  return this.y;
 }
}
