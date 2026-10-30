import * as THREE from 'three';
import {Splats, type GpuArrays} from './vendor/radix.module.js';

/** A deliberately bounded, approximate picker over coarse resident SOG splats. */
export class SurfaceProxy {
 private readonly sources = new Set<string>();
 private readonly values:number[] = [];
 private busy = false;
 private dead = false;
 private readonly localRay = new THREE.Ray();
 private readonly inverse = new THREE.Matrix4();
 private readonly worldPoint = new THREE.Vector3();
 readonly maxPoints = 12_000;
 get count(){return this.values.length / 11;}

 offer(key:string, arrays:GpuArrays, retain:()=>()=>void, sourceCount=1){
  if(this.dead||this.busy||this.sources.has(key)||this.count>=this.maxPoints||!arrays.count)return;
  this.sources.add(key);this.busy=true;
  const release=retain();
  const target=Math.min(this.maxPoints-this.count,Math.max(48,Math.min(1024,Math.floor(this.maxPoints/Math.max(1,sourceCount)))));
  void(async()=>{
   const chunk=Math.max(1,Math.min(256,Math.floor(target/4))),windows=Math.min(4,Math.ceil(arrays.count/chunk));
   const splat=Splats.makeExtSplat();
   for(let window=0;window<windows&&!this.dead;window++){
    const start=Math.floor(Math.max(0,arrays.count-chunk)*window/Math.max(1,windows-1));
    const data=await arrays.read({bundles:['extSplats'],start,count:Math.min(chunk,arrays.count-start)});
    if(this.dead)return;
    const decode=Splats.decoder(Splats.get(data).bundle);
    for(let i=0;i<data.count&&this.count<this.maxPoints;i++){
     decode(i,splat);
     const {center:c,scales:s,quaternion:q,opacity}=splat;
     if(opacity<.03||![c.x,c.y,c.z,s.x,s.y,s.z,q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.min(s.x,s.y,s.z)<=0)continue;
     this.values.push(c.x,c.y,c.z,s.x*2.828427,s.y*2.828427,s.z*2.828427,q.x,q.y,q.z,q.w,opacity);
    }
   }
  })().catch(()=>{if(!this.dead)this.sources.delete(key);}).finally(()=>{release();this.busy=false;});
 }

 intersect(raycaster:THREE.Raycaster,object:THREE.Object3D,bounds:THREE.Box3,intersects:THREE.Intersection[]){
  if(this.dead||!this.values.length)return;
  object.updateWorldMatrix(true,false);
  this.inverse.copy(object.matrixWorld).invert();
  this.localRay.copy(raycaster.ray).applyMatrix4(this.inverse);
  if(!this.localRay.intersectsBox(bounds))return;
  const origin=this.localRay.origin,direction=this.localRay.direction,values=this.values;
  let best=Infinity;
  for(let i=0;i<values.length;i+=11){
   const x=origin.x-values[i],y=origin.y-values[i+1],z=origin.z-values[i+2];
   const qx=-values[i+6],qy=-values[i+7],qz=-values[i+8],qw=values[i+9];
   const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
   const ox=(x+qw*tx+qy*tz-qz*ty)/values[i+3],oy=(y+qw*ty+qz*tx-qx*tz)/values[i+4],oz=(z+qw*tz+qx*ty-qy*tx)/values[i+5];
   const ux=2*(qy*direction.z-qz*direction.y),uy=2*(qz*direction.x-qx*direction.z),uz=2*(qx*direction.y-qy*direction.x);
   const dx=(direction.x+qw*ux+qy*uz-qz*uy)/values[i+3],dy=(direction.y+qw*uy+qz*ux-qx*uz)/values[i+4],dz=(direction.z+qw*uz+qx*uy-qy*ux)/values[i+5];
   const a=dx*dx+dy*dy+dz*dz,b=ox*dx+oy*dy+oz*dz,c=ox*ox+oy*oy+oz*oz-1,discriminant=b*b-a*c;
   if(a<=0||discriminant<0)continue;
   let distance=(-b-Math.sqrt(discriminant))/a;
   if(distance<0)distance=(-b+Math.sqrt(discriminant))/a;
   if(distance>=0&&distance<best)best=distance;
  }
  if(!Number.isFinite(best))return;
  this.localRay.at(best,this.worldPoint).applyMatrix4(object.matrixWorld);
  const distance=raycaster.ray.origin.distanceTo(this.worldPoint);
  if(distance<raycaster.near||distance>raycaster.far)return;
  intersects.push({distance,point:this.worldPoint.clone(),object});
 }
 dispose(){this.dead=true;this.values.length=0;this.sources.clear();}
}
