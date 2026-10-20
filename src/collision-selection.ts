import * as THREE from 'three';
import {dyno,SplatMesh} from '@sparkjsdev/spark';
import {volumeMatrix,selectionTextureData,selectionTextureStatements,SELECTION_TEXTURE_WIDTH,SELECTION_TEXTURE_HEIGHT} from '../shared/collision-selection.mjs';
import {boxWallPosition,resizeBoxWall} from '../shared/box-walls.mjs';
import type {CollisionVolume} from './model';

export class CollisionSelectionLayer {
 readonly group=new THREE.Group();readonly shapes=new THREE.Group();private faces=new THREE.Group();private signature='';private mesh?:SplatMesh;private volumes:CollisionVolume[]=[];selected='';
 private tintSignature='';private texture?:THREE.DataTexture;private tintCount={value:0};
 constructor(){this.group.name='collision-selection';this.group.add(this.shapes,this.faces);}
 mountHandles(overlay:THREE.Scene){overlay.add(this.faces);this.faces.matrixAutoUpdate=false;this.syncHandles();}
 syncHandles(){if(!this.faces.matrixAutoUpdate){this.group.updateWorldMatrix(true,false);this.faces.matrix.copy(this.group.matrixWorld);this.faces.updateMatrixWorld(true);}}
 private remove(object:THREE.Object3D){object.traverse(child=>{if(child instanceof THREE.Mesh||child instanceof THREE.Line){child.geometry.dispose();(child.material as THREE.Material).dispose();}});object.removeFromParent();}
 private releaseTint(){if(this.mesh&&this.texture){this.mesh.objectModifier=undefined;this.mesh.updateGenerator();}this.texture?.dispose();this.texture=undefined;this.tintSignature='';}
 clear(){this.signature='';for(const group of [this.shapes,this.faces])for(const child of [...group.children])this.remove(child);this.releaseTint();this.mesh=undefined;this.volumes=[];}
 private pose(object:THREE.Object3D,volume:CollisionVolume){volumeMatrix(volume).decompose(object.position,object.quaternion,object.scale);object.updateMatrixWorld(true);}
 rebuild(volumes:CollisionVolume[],mesh?:SplatMesh,selected='',resize=true){
  this.selected=selected;const signature=JSON.stringify([volumes,selected,resize]);
  if(mesh!==this.mesh){this.releaseTint();this.mesh=mesh;this.signature='';}
  if(signature===this.signature)return this.shapes.children.find(child=>child.name===selected);
  this.signature=signature;this.volumes=volumes;
  const ids=new Set(volumes.map(volume=>volume.id));
  for(const object of [...this.shapes.children])if(!ids.has(object.name)||volumes.find(volume=>volume.id===object.name)?.type!==object.userData.collisionVolume.type)this.remove(object);
  for(const volume of volumes){
   let object=this.shapes.children.find(child=>child.name===volume.id);
   if(!object){object=new THREE.Group();object.name=volume.id;const geometry=volume.type==='ball'?new THREE.SphereGeometry(1,24,16):new THREE.BoxGeometry(1,1,1),surface=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide})),outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,1),new THREE.LineBasicMaterial({transparent:true,depthTest:false}));object.add(surface,outline);object.renderOrder=480;outline.renderOrder=481;this.shapes.add(object);}
   const color=volume.operation==='add'?0x6eedc5:0xf59c94;object.userData.collisionVolume=volume;this.pose(object,volume);
   for(const child of object.children){const material=(child as THREE.Mesh).material as THREE.MeshBasicMaterial;material.color.setHex(color);if(child instanceof THREE.LineSegments)material.opacity=volume.id===selected?1:.45;}
  }
  // Keep a live gizmo's target and geometry while adjusting its transform.
  const box=resize?volumes.find(volume=>volume.id===selected&&volume.type==='box'):undefined;
  for(const node of [...this.faces.children])if(node.userData.collisionVolume.id!==box?.id)this.remove(node);
  if(box)for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const name=`${box.id}-wall-${axis}-${sign}`;let node=this.faces.children.find(child=>child.name===name);if(!node){node=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.12),new THREE.MeshBasicMaterial({color:[0xf59c94,0x6eedc5,0x8dbfc9][axis],depthTest:false,depthWrite:false,transparent:true,opacity:1}));node.name=name;node.userData.collisionFace={axis,sign};node.renderOrder=502;const border=new THREE.LineSegments(new THREE.EdgesGeometry((node as THREE.Mesh).geometry),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,depthTest:false,depthWrite:false}));border.renderOrder=503;node.add(border);this.faces.add(node);}node.position.fromArray(boxWallPosition(box,axis,sign));node.quaternion.setFromEuler(new THREE.Euler(...box.rotation,'YXZ'));node.userData.collisionVolume=box;}
  this.tint(volumes);return this.shapes.children.find(child=>child.name===selected);
 }
 sizeHandles(camera:THREE.PerspectiveCamera,height:number){this.syncHandles();const eye=camera.getWorldPosition(new THREE.Vector3()),scale=this.faces.getWorldScale(new THREE.Vector3()).x;for(const handle of this.faces.children){const distance=handle.getWorldPosition(new THREE.Vector3()).distanceTo(eye);handle.scale.setScalar(2*Math.tan(camera.fov*Math.PI/360)*distance*18/Math.max(1,height)/(.12*Math.max(.0001,scale)));}}
 wallHandles(){return this.faces.children;}
 private tint(volumes:CollisionVolume[]){
  if(!this.mesh)return;const signature=JSON.stringify(volumes);if(signature===this.tintSignature)return;
  if(!volumes.length){this.releaseTint();return;}
  const data=selectionTextureData(volumes);
  if(!this.texture){
   this.texture=new THREE.DataTexture(data,SELECTION_TEXTURE_WIDTH,SELECTION_TEXTURE_HEIGHT,THREE.RGBAFormat,THREE.FloatType);this.texture.minFilter=THREE.NearestFilter;this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;
   const texture={value:this.texture},count=this.tintCount;
   this.mesh.objectModifier=new dyno.Dyno({inTypes:{gsplat:dyno.Gsplat},outTypes:{gsplat:dyno.Gsplat},generate:({inputs,outputs,compile})=>{const name=`tourCollision${compile.nextSequence()}`,sampler=name+'Shapes',length=name+'Count';return {globals:[`uniform sampler2D ${sampler};`,`uniform int ${length};`],statements:selectionTextureStatements(inputs.gsplat,outputs.gsplat,sampler,length),uniforms:{[sampler]:texture,[length]:count}};}});
   this.mesh.updateGenerator();
  }else (this.texture.image.data as Float32Array).set(data);
  this.tintSignature=signature;this.tintCount.value=volumes.length;this.texture.needsUpdate=true;this.mesh.needsUpdate=true;
 }
 preview(object:THREE.Object3D,updateTint=true){const patch=this.patch(object);if(object.userData.collisionFace){const shape=this.shapes.children.find(shape=>shape.name===patch.id);if(shape)this.pose(shape,patch);}for(const node of this.faces.children)if(node.userData.collisionVolume.id===patch.id){const {axis,sign}=node.userData.collisionFace;node.position.fromArray(boxWallPosition(patch,axis,sign));}if(updateTint)this.tint(this.volumes.map(volume=>volume.id===patch.id?patch:volume));}
 patch(object:THREE.Object3D):CollisionVolume{const volume=object.userData.collisionVolume as CollisionVolume;if(object.userData.collisionFace){const {axis,sign}=object.userData.collisionFace;return resizeBoxWall(volume,axis,sign,object.position.toArray()) as CollisionVolume;}const euler=new THREE.Euler().setFromQuaternion(object.quaternion,'YXZ'),scale=object.scale.toArray(),radius=scale.reduce((value,next)=>Math.abs(next-volume.size[0])>Math.abs(value-volume.size[0])?next:value,scale[0]);return {...volume,position:object.position.toArray() as [number,number,number],rotation:[euler.x,euler.y,euler.z],size:(volume.type==='ball'?Array(3).fill(Math.max(.005,radius)):scale.map(value=>Math.max(.005,value))) as [number,number,number]};}
}
