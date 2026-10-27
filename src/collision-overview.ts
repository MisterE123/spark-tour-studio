import * as THREE from 'three';
import {createCollisionOverview,selectCollisionOverviewLevel} from '../shared/collision-overview.mjs';

/** Saved coverage guides only. These never own physics or request collision pages. */
export class CollisionOverview {
 readonly group=new THREE.Group();
 private data?:ReturnType<typeof createCollisionOverview>;
 private geometry?:THREE.BufferGeometry;private material?:THREE.LineBasicMaterial;
 private positions?:THREE.BufferAttribute;private colors?:THREE.BufferAttribute;
 private levels:number[]=[];private dead=false;
 constructor(private manifest:any,private source:THREE.Object3D){
  this.group.name='collision-overview';this.group.matrixAutoUpdate=false;this.group.visible=false;
 }
 private initialize(){
  if(this.data||this.dead)return;
  this.data=createCollisionOverview(this.manifest);
  const needed=this.data.shapes.reduce((sum:number,shape:any)=>sum+Math.max(...shape.levels.map((level:Float32Array)=>level.length)),0),capacity=Math.min(Math.min(65536,this.data.segmentBudget)*6,needed);
  this.positions=new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage);
  this.colors=new THREE.BufferAttribute(new Float32Array(capacity),3).setUsage(THREE.DynamicDrawUsage);
  this.geometry=new THREE.BufferGeometry();this.geometry.setAttribute('position',this.positions);this.geometry.setAttribute('color',this.colors);this.geometry.setDrawRange(0,0);
  this.material=new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.34,depthTest:false,depthWrite:false,toneMapped:false});
  const lines=new THREE.LineSegments(this.geometry,this.material);lines.name='saved-collision-coverage';lines.renderOrder=-10;lines.frustumCulled=false;lines.raycast=()=>{};
  this.group.add(lines);
 }
 setVisible(show:boolean){if(this.dead)return;if(show)this.initialize();this.group.visible=show;}
 update(camera:THREE.PerspectiveCamera,height:number){
  if(this.dead||!this.group.visible)return;this.initialize();
  this.source.matrixWorldNeedsUpdate=true;this.source.updateWorldMatrix(true,false);this.group.matrix.copy(this.source.matrixWorld);this.group.updateMatrixWorld(true);
  const eye=camera.getWorldPosition(new THREE.Vector3()).applyMatrix4(this.source.matrixWorld.clone().invert()).toArray();
  const next=this.data!.shapes.map((shape:any,index:number)=>selectCollisionOverviewLevel(shape.bounds,eye,{fov:camera.fov,viewportHeight:Math.max(1,height),previousLevel:this.levels[index],hysteresis:.15}));
  if(next.length===this.levels.length&&next.every((level:number,index:number)=>level===this.levels[index]))return;
  this.levels=next;const positions=this.positions!.array as Float32Array,colors=this.colors!.array as Float32Array;let offset=0;
  for(let index=0;index<this.data!.shapes.length;index++){
   const shape=this.data!.shapes[index],input=shape.levels[next[index]],length=Math.min(input.length,Math.floor((positions.length-offset)/6)*6);
   positions.set(input.subarray(0,length),offset);const color=shape.operation==='remove'?[.96,.61,.58]:[.47,.94,.83];
   for(let cursor=offset;cursor<offset+length;cursor+=3){colors[cursor]=color[0];colors[cursor+1]=color[1];colors[cursor+2]=color[2];}offset+=length;
  }
  this.positions!.needsUpdate=true;this.colors!.needsUpdate=true;this.geometry!.setDrawRange(0,offset/3);
 }
 dispose(){
  if(this.dead)return;this.dead=true;this.geometry?.dispose();this.material?.dispose();this.group.clear();this.group.removeFromParent();this.data=undefined;this.positions=undefined;this.colors=undefined;this.levels=[];
 }
}
