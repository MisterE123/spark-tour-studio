import * as THREE from 'three';
import {MeshBasicNodeMaterial} from 'three/webgpu';
import {color,mix,normalize,positionGeometry,smoothstep} from 'three/tsl';
import {solidBackgroundColors} from '../shared/background.mjs';
import type {SceneBackground,Hosting} from './model';
import type {SplatAssetGroup,SplatAssetOptions} from './rendering/backend';
export type BackgroundAssetFactory=(url:string,options:SplatAssetOptions)=>SplatAssetGroup;
export class BackgroundLayer {
 mesh?:SplatAssetGroup;texture?:THREE.Texture;hemisphere?:THREE.Mesh<THREE.SphereGeometry,MeshBasicNodeMaterial>;private version=0;private key='';private pending:Promise<void>=Promise.resolve();
 constructor(private scene:THREE.Scene,private onError:(message:string)=>void,private createAsset:BackgroundAssetFactory){}
 clear(){++this.version;this.key='';this.scene.background=new THREE.Color('#0b151d');this.scene.backgroundRotation.set(0,0,0);this.mesh?.removeFromParent();this.mesh?.dispose();this.mesh=undefined;this.hemisphere?.removeFromParent();this.hemisphere?.geometry.dispose();this.hemisphere?.material.dispose();this.hemisphere=undefined;this.texture?.dispose();this.texture=undefined;this.pending=Promise.resolve();}
 private solid(value:SceneBackground){
  const {top,bottom}=solidBackgroundColors(value);this.scene.background=new THREE.Color(top);
  if(top.toLowerCase()===bottom.toLowerCase())return;
  // A camera-centered shell gives each XR eye the same world-up horizon. Colors
  // blend in linear space; no downloaded sky image or extra streaming is needed.
  const material=new MeshBasicNodeMaterial({side:THREE.BackSide,depthTest:false,depthWrite:false,toneMapped:false});
  material.colorNode=mix(color(new THREE.Color(bottom)),color(new THREE.Color(top)),smoothstep(-.25,.25,normalize(positionGeometry).y));
  const shell=new THREE.Mesh(new THREE.SphereGeometry(10,32,16),material);shell.name='hemisphere-background';shell.frustumCulled=false;shell.renderOrder=-10000;
  shell.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(shell.position);shell.updateMatrixWorld(true);};this.hemisphere=shell;this.scene.add(shell);
 }
 private align(value:SceneBackground|undefined){if(value?.type==='panorama')this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);if(value?.type==='splat'&&this.mesh){this.mesh.position.fromArray(value.transform.position);this.mesh.rotation.set(...value.transform.rotation,'YXZ');this.mesh.scale.setScalar(value.transform.scale);this.mesh.updateMatrixWorld(true);this.mesh.invalidateTransform();}}
 load(value:SceneBackground|undefined,base:string,hosting:Hosting,maxSh:number){const key=JSON.stringify([value?.type,value?.type==='solid'?solidBackgroundColors(value):value?.source,base,hosting.assetBaseUrl]);if(key===this.key){const version=this.version;return this.pending.then(()=>{if(version===this.version)this.align(value);});}this.clear();this.key=key;const token=this.version;
  this.pending=(async()=>{if(!value)return;if(value.type==='solid'){this.solid(value);return;}if(!value.source)return;
   if(value.type==='panorama'){const texture=await new THREE.TextureLoader().loadAsync(new URL(value.source,base).href).catch(cause=>{throw new Error('The panorama background image could not be loaded.',{cause});});if(token!==this.version){texture.dispose();return;}texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;this.texture=texture;this.scene.background=texture;this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);return;}
   const mesh=this.createAsset(new URL(value.source,new URL(hosting.assetBaseUrl||'./',base)).href,{maxSh,onError:error=>{if(token!==this.version)return;if(this.mesh)this.mesh.visible=false;this.onError('Background streaming failed: '+error.message);}});this.mesh=mesh;mesh.position.fromArray(value.transform.position);mesh.rotation.set(...value.transform.rotation,'YXZ');mesh.scale.setScalar(value.transform.scale);
   this.scene.add(mesh);await mesh.initialized;if(token!==this.version)return;
  })().catch(error=>{if(token!==this.version)return;this.clear();throw error;});return this.pending;
 }
 performance(maxSh:number){this.mesh?.setMaxSh(maxSh);}
}
