import * as THREE from 'three';
import {SplatMesh} from '@sparkjsdev/spark';
import {assertPagedRad} from '../shared/rad.mjs';
import {solidBackgroundColors} from '../shared/background.mjs';
import type {SceneBackground,Hosting} from './model';
export class BackgroundLayer {
 mesh?:SplatMesh;texture?:THREE.Texture;hemisphere?:THREE.Mesh<THREE.SphereGeometry,THREE.ShaderMaterial>;private version=0;private key='';private pending:Promise<void>=Promise.resolve();
 constructor(private scene:THREE.Scene,private onError:(message:string)=>void){}
 clear(){++this.version;this.key='';this.scene.background=new THREE.Color('#0b151d');this.scene.backgroundRotation.set(0,0,0);this.mesh?.paged?.abortController.abort();this.mesh?.removeFromParent();this.mesh?.dispose();this.mesh=undefined;this.hemisphere?.removeFromParent();this.hemisphere?.geometry.dispose();this.hemisphere?.material.dispose();this.hemisphere=undefined;this.texture?.dispose();this.texture=undefined;this.pending=Promise.resolve();}
 private solid(value:SceneBackground){
  const {top,bottom}=solidBackgroundColors(value);this.scene.background=new THREE.Color(top);
  if(top.toLowerCase()===bottom.toLowerCase())return;
  // A camera-centered shell gives each XR eye the same world-up horizon. Colors
  // blend in linear space; no downloaded sky image or extra streaming is needed.
  const material=new THREE.ShaderMaterial({uniforms:{topColor:{value:new THREE.Color(top)},bottomColor:{value:new THREE.Color(bottom)}},side:THREE.BackSide,depthTest:false,depthWrite:false,toneMapped:false,
   vertexShader:`varying vec3 skyDirection;
    void main(){skyDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);gl_Position.z=gl_Position.w;}`,
   fragmentShader:`uniform vec3 topColor;uniform vec3 bottomColor;varying vec3 skyDirection;
    void main(){float blend=smoothstep(-0.25,0.25,normalize(skyDirection).y);gl_FragColor=vec4(mix(bottomColor,topColor,blend),1.0);
     #include <colorspace_fragment>
    }`});
  const shell=new THREE.Mesh(new THREE.SphereGeometry(10,32,16),material);shell.name='hemisphere-background';shell.frustumCulled=false;shell.renderOrder=-10000;
  shell.onBeforeRender=(_renderer,_scene,camera)=>{camera.getWorldPosition(shell.position);shell.updateMatrixWorld(true);};this.hemisphere=shell;this.scene.add(shell);
 }
 private align(value:SceneBackground|undefined){if(value?.type==='panorama')this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);if(value?.type==='splat'&&this.mesh){this.mesh.position.fromArray(value.transform.position);this.mesh.rotation.set(...value.transform.rotation,'YXZ');this.mesh.scale.setScalar(value.transform.scale);this.mesh.updateMatrixWorld(true);}}
 load(value:SceneBackground|undefined,base:string,hosting:Hosting,maxSh:number){const key=JSON.stringify([value?.type,value?.type==='solid'?solidBackgroundColors(value):value?.source,base,hosting.assetBaseUrl]);if(key===this.key){const version=this.version;return this.pending.then(()=>{if(version===this.version)this.align(value);});}this.clear();this.key=key;const token=this.version;
  this.pending=(async()=>{if(!value)return;if(value.type==='solid'){this.solid(value);return;}if(!value.source)return;
   if(value.type==='panorama'){const texture=await new THREE.TextureLoader().loadAsync(new URL(value.source,base).href);if(token!==this.version){texture.dispose();return;}texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;this.texture=texture;this.scene.background=texture;this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);return;}
   const mesh=new SplatMesh({url:new URL(value.source,new URL(hosting.assetBaseUrl||'./',base)).href,paged:true});this.mesh=mesh;mesh.maxSh=maxSh;mesh.position.fromArray(value.transform.position);mesh.rotation.set(...value.transform.rotation,'YXZ');mesh.scale.setScalar(value.transform.scale);
   if(mesh.paged){const paged=mesh.paged,decode=paged.fetchDecodeChunk.bind(paged);let reported=false;paged.fetchDecodeChunk=async chunk=>{try{return await decode(chunk);}catch(error){if(token===this.version&&!reported){reported=true;paged.abortController.abort();mesh.visible=false;this.onError('Background streaming failed: '+String(error));}throw error;}};}
   await mesh.initialized;const rad=await mesh.paged?.getRadMeta();if(token!==this.version)return;if(rad)assertPagedRad(rad.meta);this.scene.add(mesh);
  })().catch(error=>{if(token!==this.version)return;this.clear();throw error;});return this.pending;
 }
 performance(maxSh:number){if(this.mesh&&this.mesh.maxSh!==maxSh){this.mesh.maxSh=maxSh;this.mesh.generatorDirty=true;this.mesh.updateVersion();}}
}
