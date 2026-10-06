import * as THREE from 'three';
import {SplatMesh} from '@sparkjsdev/spark';
import {assertPagedRad} from '../shared/rad.mjs';
import type {SceneBackground,Hosting} from './model';
export class BackgroundLayer {
 mesh?:SplatMesh;texture?:THREE.Texture;private version=0;private key='';private pending:Promise<void>=Promise.resolve();
 constructor(private scene:THREE.Scene,private onError:(message:string)=>void){}
 clear(){++this.version;this.key='';this.scene.background=new THREE.Color('#0b151d');this.scene.backgroundRotation.set(0,0,0);this.mesh?.paged?.abortController.abort();this.mesh?.removeFromParent();this.mesh?.dispose();this.mesh=undefined;this.texture?.dispose();this.texture=undefined;this.pending=Promise.resolve();}
 private align(value:SceneBackground|undefined){if(value?.type==='panorama')this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);if(value?.type==='splat'&&this.mesh){this.mesh.position.fromArray(value.transform.position);this.mesh.rotation.set(...value.transform.rotation,'YXZ');this.mesh.scale.setScalar(value.transform.scale);this.mesh.updateMatrixWorld(true);}}
 load(value:SceneBackground|undefined,base:string,hosting:Hosting,maxSh:number){const key=JSON.stringify([value?.type,value?.type==='solid'?value.color:value?.source,base,hosting.assetBaseUrl]);if(key===this.key){const version=this.version;return this.pending.then(()=>{if(version===this.version)this.align(value);});}this.clear();this.key=key;const token=this.version;
  this.pending=(async()=>{if(!value)return;if(value.type==='solid'){this.scene.background=new THREE.Color(value.color);return;}if(!value.source)return;
   if(value.type==='panorama'){const texture=await new THREE.TextureLoader().loadAsync(new URL(value.source,base).href);if(token!==this.version){texture.dispose();return;}texture.mapping=THREE.EquirectangularReflectionMapping;texture.colorSpace=THREE.SRGBColorSpace;this.texture=texture;this.scene.background=texture;this.scene.backgroundRotation.y=THREE.MathUtils.degToRad(value.yawDegrees);return;}
   const mesh=new SplatMesh({url:new URL(value.source,new URL(hosting.assetBaseUrl||'./',base)).href,paged:true});this.mesh=mesh;mesh.maxSh=maxSh;mesh.position.fromArray(value.transform.position);mesh.rotation.set(...value.transform.rotation,'YXZ');mesh.scale.setScalar(value.transform.scale);
   if(mesh.paged){const paged=mesh.paged,decode=paged.fetchDecodeChunk.bind(paged);let reported=false;paged.fetchDecodeChunk=async chunk=>{try{return await decode(chunk);}catch(error){if(token===this.version&&!reported){reported=true;paged.abortController.abort();mesh.visible=false;this.onError('Background streaming failed: '+String(error));}throw error;}};}
   await mesh.initialized;const rad=await mesh.paged?.getRadMeta();if(token!==this.version)return;if(rad)assertPagedRad(rad.meta);this.scene.add(mesh);
  })().catch(error=>{if(token!==this.version)return;this.clear();throw error;});return this.pending;
 }
 performance(maxSh:number){if(this.mesh&&this.mesh.maxSh!==maxSh){this.mesh.maxSh=maxSh;this.mesh.generatorDirty=true;this.mesh.updateVersion();}}
}
