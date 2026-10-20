import * as THREE from 'three';
import type {Page,SceneLink} from './model';
import {richTextToBlocks} from '../shared/rich-text.mjs';
import {imagePanel,panel} from './spatial-ui';

type ContentMesh=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
type Item={mesh:ContentMesh;height:number;top:number};

// XR uses the same block order as the browser. Scroll only moves existing
// surfaces; it never reloads images or changes the document/XR session.
export class XRContent {
 page:Page|null=null;offset=0;extent=0;focus=-1;
 readonly top=.91;readonly bottom=-.85;readonly width=2.3;
 private items:Item[]=[];private hud?:THREE.Group;private planes:THREE.Plane[]=[];
 private track?:ContentMesh;private thumb?:ContentMesh;
 private refresh=()=>{};
 reset(){this.page=null;this.offset=0;this.extent=0;this.focus=-1;this.items=[];this.hud=undefined;}
 render(hud:THREE.Group,page:Page,base:string,refresh:()=>void,onSceneLink?:(link:SceneLink)=>void){
  if(this.page!==page){this.page=page;this.offset=0;this.focus=-1;}
  this.hud=hud;this.refresh=refresh;this.items=[];this.track=undefined;this.thumb=undefined;
  this.planes=[new THREE.Plane(),new THREE.Plane(),new THREE.Plane(),new THREE.Plane()];
  const blocks=page.blocks.flatMap(block=>block.type==='text'&&block.richText?richTextToBlocks(block.richText):[block]);
  const valid=()=>this.page===page&&this.hud===hud&&hud.visible;
  const add=(mesh:ContentMesh,height=mesh.geometry.parameters.height)=>{
   mesh.material.clippingPlanes=this.planes;mesh.userData.contentItem=true;
   const item={mesh,height,top:0};this.items.push(item);hud.add(mesh);return item;
  };
  const text=(value:string,caption=false)=>{for(const mesh of textSurfaces(value,this.width,caption?30:36))add(mesh);};
  if(this.focus>=0&&blocks[this.focus]?.type!=='image')this.focus=-1;
  if(this.focus>=0){
   const block=blocks[this.focus];let url='';try{url=new URL(block.url,base).href;}catch{}
   const image=imagePanel(url,2.55,2.07,valid);image.position.set(0,.03,.025);image.userData.label='Photograph';image.userData.action=()=>{this.focus=-1;this.refresh();};hud.add(image);
   if(block.text){const caption=panel(block.text,2.55,.22,'rgba(0,0,0,0)');caption.position.set(0,-1.1,.03);hud.add(caption);}
   return;
  }
  if(page.html)text('This custom page is available in the browser view.');
  else if(!blocks.length)text('No content');
  else for(const [index,block] of blocks.entries()){
   if(block.type==='image'){
    let url='';try{url=new URL(block.url,base).href;}catch{}
    let item:Item|undefined;
    const image=imagePanel(url,this.width,1.66,valid,loaded=>{
     if(!item||!this.items.includes(item))return;
     item.height=loaded.geometry.parameters.height;this.layout();
    },true,1536);
    image.userData.imageIndex=index;image.userData.label='Enlarge image'+(block.text?': '+block.text:'');
    image.userData.action=()=>{this.focus=index;this.refresh();};item=add(image);
    if(block.text)text(block.text,true);
   }else if(block.type==='embed')text((block.text?block.text+'\n':'')+'This external embed is available in the browser view.');
   else if(block.type==='link')text(block.text+'\n'+block.url+'\nAvailable in the browser view.');
   else text(block.text||'');
  }
  for(const link of page.sceneLinks||[]){const button=panel(link.label,this.width,.24,'rgba(255,255,255,.14)','image_arrow_up');button.userData.label=link.label;button.userData.action=()=>onSceneLink?.(link);add(button);}
  this.track=panel('',.022,this.top-this.bottom,'rgba(255,255,255,.12)');this.track.position.set(1.2,(this.top+this.bottom)/2,.04);hud.add(this.track);
  this.thumb=panel('',.026,.2,'rgba(255,255,255,.65)');this.thumb.position.set(1.2,0,.045);hud.add(this.thumb);
  this.layout();
 }
 private layout(){
  if(!this.hud)return;let height=0;
  for(const item of this.items){item.top=height;height+=item.height+.065;}
  this.extent=Math.max(0,height-.065-(this.top-this.bottom));this.offset=THREE.MathUtils.clamp(this.offset,0,this.extent);
  const viewport=this.top-this.bottom;
  for(const item of this.items){item.mesh.position.set(0,this.top-item.top-item.height/2+this.offset,.025);const upper=item.mesh.position.y+item.height/2,lower=item.mesh.position.y-item.height/2;item.mesh.visible=upper>this.bottom&&lower<this.top;if(upper>this.bottom-viewport&&lower<this.top+viewport)item.mesh.userData.loadImage?.();else if(upper<this.bottom-viewport*2||lower>this.top+viewport*2)item.mesh.userData.unloadImage?.();}
  this.hud.updateWorldMatrix(true,false);
  const matrix=this.hud.matrixWorld;
  const definitions=[new THREE.Plane(new THREE.Vector3(0,-1,0),this.top),new THREE.Plane(new THREE.Vector3(0,1,0),-this.bottom),new THREE.Plane(new THREE.Vector3(1,0,0),this.width/2),new THREE.Plane(new THREE.Vector3(-1,0,0),this.width/2)];
  this.planes.forEach((plane,index)=>plane.copy(definitions[index]).applyMatrix4(matrix));
  if(this.track)this.track.visible=this.extent>.001;
  if(this.thumb){this.thumb.visible=this.extent>.001;const viewport=this.top-this.bottom,size=Math.max(.14,viewport*viewport/(viewport+this.extent));this.thumb.scale.y=size/.2;this.thumb.position.y=this.top-size/2-(viewport-size)*(this.extent?this.offset/this.extent:0);}
 }
 scroll(delta:number){if(this.focus>=0||!Number.isFinite(delta))return;this.offset=THREE.MathUtils.clamp(this.offset+delta,0,this.extent);this.layout();}
 accepts(hit:THREE.Intersection){if(!hit.object.userData.contentItem||!this.hud)return true;const point=this.hud.worldToLocal(hit.point.clone());return point.y>=this.bottom&&point.y<=this.top&&Math.abs(point.x)<=this.width/2;}
}

function textSurfaces(value:string,width:number,font:number){
 if(!value.trim())return [];
 const measure=document.createElement('canvas').getContext('2d')!;measure.font=`500 ${font}px system-ui`;
 const lines:string[]=[];for(const paragraph of value.split('\n')){let line='';for(const word of paragraph.split(/\s+/)){if(line&&measure.measureText(line+word).width>976){lines.push(line.trimEnd());line='';}line+=word+' ';}lines.push(line.trimEnd());}
 const surfaces:ContentMesh[]=[];
 // Bounded textures also handle long rich-text paragraphs without oversized
 // GPU allocations. The blocks remain contiguous in one scrolling column.
 for(let start=0;start<lines.length;start+=24){const chunk=lines.slice(start,start+24),canvas=document.createElement('canvas');canvas.width=1024;canvas.height=Math.ceil(chunk.length*font*1.35+40);const context=canvas.getContext('2d')!;context.font=`500 ${font}px system-ui`;context.textBaseline='top';context.fillStyle='#f5f5f5';context.shadowColor='rgba(0,0,0,.8)';context.shadowBlur=3;chunk.forEach((line,index)=>context.fillText(line,24,20+index*font*1.35));const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,canvas.height/1024*width),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.FrontSide}));mesh.renderOrder=100;mesh.userData.contentText=chunk.join('\n');surfaces.push(mesh);}
 return surfaces;
}
