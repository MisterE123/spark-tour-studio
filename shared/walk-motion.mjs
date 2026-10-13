// Horizontal locomotion approaches a velocity rather than jumping to a full
// displacement on the first input frame. Gravity and jumping remain physical.
export class WalkMotion {
 constructor(){this.x=0;this.z=0;}
 reset(){this.x=0;this.z=0;}
 step(targetX,targetZ,dt,speed){
  const active=Math.hypot(targetX,targetZ),current=Math.hypot(this.x,this.z),accelerating=active>current&&targetX*this.x+targetZ*this.z>=0,rate=Math.max(1,speed)*(accelerating?4:6),dx=targetX-this.x,dz=targetZ-this.z,length=Math.hypot(dx,dz),fraction=length?Math.min(1,rate*Math.max(0,dt)/length):1;
  this.x+=dx*fraction;this.z+=dz*fraction;if(Math.hypot(this.x,this.z)<.0001)this.reset();return {x:this.x*dt,z:this.z*dt};
 }
 collision(normal){
  // Floor contact can shorten a step. It must not restart acceleration; only
  // walls remove momentum that would push into them, retaining wall sliding.
  if(Math.abs(normal.y)>=Math.SQRT1_2-1e-5)return;const length=Math.hypot(normal.x,normal.z);if(!length)return;const x=normal.x/length,z=normal.z/length,into=this.x*x+this.z*z;if(into<0){this.x-=into*x;this.z-=into*z;}
 }
}
