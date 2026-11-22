import * as THREE from 'three';
import type {Page,SceneLink} from './model';
import {resolveRichReference,resolveContentResource} from '../shared/rich-text.mjs';
import {imagePanel} from './spatial-ui';
import {xrRichContent} from './xr-rich-text';

export const XR_CONTENT_CARD={width:2.08,height:1.88,scale:.14} as const;

type ContentMesh=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
type Item={mesh:ContentMesh;top:number};
type CardActions={close:()=>void;menu:()=>void;openScene:(link:SceneLink)=>void};

const bodyX=-.035;
const itemGap=.035;
const imageDepth=.025;
const footerY=-.76;

function surface(width:number,height:number,color=0xffffff,opacity=1){
 const material=new THREE.MeshBasicMaterial({color,opacity,transparent:true,depthTest:false,depthWrite:false,toneMapped:false});
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);
 mesh.renderOrder=100;
 return mesh;
}

function texturedSurface(width:number,height:number,canvas:HTMLCanvasElement){
 const texture=new THREE.CanvasTexture(canvas);
 texture.colorSpace=THREE.SRGBColorSpace;
 const mesh=surface(width,height);
 mesh.material.map=texture;
 return mesh;
}

function canvasFor(width:number,height:number){
 const canvas=document.createElement('canvas');
 canvas.width=Math.ceil(width*450);
 canvas.height=Math.ceil(height*450);
 return canvas;
}

function label(text:string,width:number,height:number,{font=30,fill='',center=false}={}){
 const canvas=canvasFor(width,height),context=canvas.getContext('2d')!;
 if(fill){
  context.fillStyle=fill;
  context.beginPath();
  context.roundRect(0,0,canvas.width,canvas.height,14);
  context.fill();
 }
 const lines=text.split('\n');
 context.font=`600 ${font}px system-ui`;
 context.textBaseline='middle';
 context.textAlign=center?'center':'left';
 context.fillStyle='#f4f8fc';
 const lineHeight=font*1.15;
 for(const [index,line] of lines.entries()){
  const y=canvas.height/2+(index-(lines.length-1)/2)*lineHeight;
  context.fillText(truncateLine(context,line,canvas.width-28),center?canvas.width/2:14,y);
 }
 return texturedSurface(width,height,canvas);
}

function truncateLine(context:CanvasRenderingContext2D,value:string,width:number){
 if(context.measureText(value).width<=width)return value;
 let result='';
 for(const character of value){
  if(context.measureText(result+character+'…').width>width)break;
  result+=character;
 }
 return result.trimEnd()+'…';
}

function backing(){
 const {width,height}=XR_CONTENT_CARD;
 const canvas=canvasFor(width,height),context=canvas.getContext('2d')!;
 const gradient=context.createLinearGradient(0,0,0,canvas.height);
 gradient.addColorStop(0,'#1d2936');
 gradient.addColorStop(1,'#101820');
 context.fillStyle=gradient;
 context.strokeStyle='#4b6175';
 context.lineWidth=3;
 context.beginPath();
 context.roundRect(2,2,canvas.width-4,canvas.height-4,32);
 context.fill();
 context.stroke();
 const mesh=texturedSurface(width,height,canvas);
 mesh.position.z=-.015;
 mesh.renderOrder=90;
 mesh.userData.blocks=true;
 mesh.userData.contentCard=true;
 return mesh;
}

export class XRContent {
 page:Page|null=null;
 offset=0;
 extent=0;
 focus=-1;
 readonly top=.575;
 readonly bottom=-.56;
 readonly width=1.81;
 private pageOffset=0;
 private items:Item[]=[];
 private hud?:THREE.Group;
 private track?:ContentMesh;
 private thumb?:ContentMesh;
 private scrollControls:ContentMesh[]=[];

 reset(){
  this.page=null;
  this.offset=0;
  this.pageOffset=0;
  this.extent=0;
  this.focus=-1;
  this.items=[];
  this.hud=undefined;
  this.track=undefined;
  this.thumb=undefined;
  this.scrollControls=[];
 }

 render(hud:THREE.Group,page:Page,base:string,refresh:()=>void,actions:CardActions){
  if(this.page!==page){this.reset();this.page=page;}
  this.hud=hud;
  this.items=[];
  this.scrollControls=[];
  const customPage=resolveContentResource(page.html,base);
  const entries=customPage?[]:page.blocks.flatMap(block=>block.type==='text'&&block.richText
   ?xrRichContent(block.richText,this.width,base):[{kind:'block',block} as const]);
  const focusedEntry=entries[this.focus];
  const focusedBlock=focusedEntry?.kind==='block'&&focusedEntry.block.type==='image'?focusedEntry.block:undefined;
  const focusedUrl=focusedBlock?resolveContentResource(focusedBlock.url,base):'';
  if(this.focus>=0&&!focusedUrl){
   this.focus=-1;
   this.offset=this.pageOffset;
  }

  const focused=this.focus>=0;
  const valid=()=>this.page===page&&this.hud===hud&&hud.visible;
  const add=(mesh:ContentMesh)=>{
   mesh.userData.contentItem=true;
   const item={mesh,top:0};
   this.items.push(item);
   hud.add(mesh);
   return item;
  };
  const text=(value:string,caption=false)=>{
   for(const mesh of textSurfaces(value,this.width,caption?28:32))add(mesh);
  };
  const image=(url:string,caption:string,index:number)=> {
   const mesh=imagePanel(url,this.width,focused?.92:.70,valid,()=>this.layout(),true,focused?2048:1536);
   if(!focused){
    mesh.userData.imageIndex=index;
    mesh.userData.label='Enlarge image'+(caption?': '+caption:'');
    mesh.userData.action=()=>{
     if(mesh.userData.imageState!=='ready')return;
     this.pageOffset=this.offset;
     this.offset=0;
     this.focus=index;
     refresh();
    };
   }
   add(mesh);
   if(caption)text(caption,true);
  };

  hud.add(backing());
  const title=label(focused?'Photograph':page.title.replace(/\s+/g,' '),1.62,.23,{font:38});
  title.position.set(-.13,.76,imageDepth);
  hud.add(title);
  this.control(hud,'×','Close content',.25,.85,.76,actions.close,48);
  this.addSeparator(hud,.62);
  this.addSeparator(hud,-.61);

  if(focusedBlock&&focusedUrl){
   image(focusedUrl,focusedBlock.text,this.focus);
  }else{
   if(customPage)text('This custom page is available in the browser view.');
   else if(!entries.length)text('No content');
   else for(const [index,entry] of entries.entries()){
    if(entry.kind==='surface'){add(entry.create());continue;}
    const {block}=entry;
    if(block.type==='image'){
     const url=resolveContentResource(block.url,base);
     if(url)image(url,block.text,index);
     else{ text('Image unavailable',true); text(block.text,true); }
    }else if(block.type==='embed')text(resolveContentResource(block.url,base)?(block.text?block.text+'\n':'')+'This external embed is available in the browser view.':block.text);
    else if(block.type==='link')text(resolveRichReference(block.url,base)?block.text+'\n'+block.url+'\nAvailable in the browser view.':block.text);
    else text(block.text||'');
   }
   for(const link of page.sceneLinks||[]){
    const mesh=label(link.label.replace(/\s+/g,' ')+'  ›',this.width,.22,{fill:'#2c4156'});
    mesh.userData.label=link.label;
    mesh.userData.action=()=>actions.openScene(link);
    add(mesh);
   }
  }

  if(focused)this.control(hud,'‹ Back to\ncontent','Back to content',.69,-.625,footerY,()=>{
   this.focus=-1;
   this.offset=this.pageOffset;
   refresh();
  },27);
  else this.control(hud,'Tour menu','Tour menu',.69,-.625,footerY,actions.menu,30);

  const step=(this.top-this.bottom)*.55;
  const up=this.control(hud,'⌃','Up',.25,-.12,footerY,()=>this.scroll(-step),45);
  const down=this.control(hud,'⌄','Down',.25,.18,footerY,()=>this.scroll(step),45);
  up.userData.contentScroll=-1;
  down.userData.contentScroll=1;
  const hint=label('Aim + right stick\nto scroll',.65,.24,{font:25,center:true});
  hint.position.set(.65,footerY,imageDepth);
  hud.add(hint);
  this.scrollControls=[up,down,hint];

  const viewport=this.top-this.bottom;
  this.track=surface(.018,viewport,0x8ca9c0,.30);
  this.track.position.set(.926,(this.top+this.bottom)/2,.03);
  this.thumb=surface(.026,1,0xaecde3);
  this.thumb.position.set(.926,0,.035);
  hud.add(this.track,this.thumb);
  this.layout();
 }

 private addSeparator(hud:THREE.Group,y:number){
  const separator=surface(1.92,.005,0x4b6175);
  separator.position.set(0,y,.01);
  hud.add(separator);
 }

 private control(hud:THREE.Group,text:string,name:string,width:number,x:number,y:number,action:()=>void,font:number){
  const control=label(text,width,.24,{font,center:true,fill:'#2c4156'});
  control.position.set(x,y,.04);
  control.userData.label=name;
  control.userData.action=action;
  hud.add(control);
  return control;
 }

 private layout(){
  if(!this.hud||!this.track||!this.thumb)return;
  let height=0;
  for(const item of this.items){
   item.top=height;
   height+=item.mesh.geometry.parameters.height+itemGap;
  }
  const viewport=this.top-this.bottom;
  this.extent=Math.max(0,height-itemGap-viewport);
  this.offset=THREE.MathUtils.clamp(this.offset,0,this.extent);
  for(const item of this.items){
   const {mesh}=item;
   const upper=this.top-item.top+this.offset;
   const lower=upper-mesh.geometry.parameters.height;
   cropItem(mesh,upper,lower,this.top,this.bottom);
   if(upper>this.bottom-viewport&&lower<this.top+viewport)mesh.userData.loadImage?.();
   else if(upper<this.bottom-viewport*2||lower>this.top+viewport*2)mesh.userData.unloadImage?.();
  }
  const overflow=this.extent>.0001;
  const size=Math.max(.13,viewport*viewport/(viewport+this.extent));
  this.track.visible=overflow;
  this.thumb.visible=overflow;
  this.thumb.scale.y=size;
  this.thumb.position.y=this.top-size/2-(viewport-size)*(overflow?this.offset/this.extent:0);
  for(const control of this.scrollControls)control.visible=overflow;
 }

 scroll(delta:number){
  if(!Number.isFinite(delta))return;
  const offset=THREE.MathUtils.clamp(this.offset+delta,0,this.extent);
  if(offset===this.offset)return;
  this.offset=offset;
  this.layout();
 }

 accepts(hit:THREE.Intersection){
  if(!hit.object.userData.contentItem||!this.hud)return true;
  const point=this.hud.worldToLocal(hit.point.clone());
  return point.y>=this.bottom-1e-6&&point.y<=this.top+1e-6&&Math.abs(point.x-bodyX)<=this.width/2+1e-6;
 }
}

// Shorten the quad and remap its UVs to the visible section. Clipping stays
// with the wrist across tracked poses and renderers, and the clipped region
// cannot intercept a pointer ray.
function cropItem(mesh:ContentMesh,upper:number,lower:number,top:number,bottom:number){
 const visibleTop=Math.min(upper,top),visibleBottom=Math.max(lower,bottom);
 const height=upper-lower;
 mesh.visible=visibleTop>visibleBottom;
 if(!mesh.visible)return;
 mesh.position.set(bodyX,(visibleTop+visibleBottom)/2,imageDepth);
 mesh.scale.y=(visibleTop-visibleBottom)/height;
 const uv=mesh.geometry.attributes.uv;
 const vTop=(visibleTop-lower)/height,vBottom=(visibleBottom-lower)/height;
 if(uv.getY(0)!==Math.fround(vTop)||uv.getY(2)!==Math.fround(vBottom)){
  uv.setY(0,vTop);
  uv.setY(1,vTop);
  uv.setY(2,vBottom);
  uv.setY(3,vBottom);
  uv.needsUpdate=true;
 }
}

function wrapLines(context:CanvasRenderingContext2D,value:string,width:number){
 const lines:string[]=[];
 for(const paragraph of value.split('\n')){
  let line='';
  for(const word of paragraph.trim().split(/\s+/)){
   const next=line?line+' '+word:word;
   if(context.measureText(next).width<=width){
    line=next;
    continue;
   }
   if(line)lines.push(line);
   line='';
   if(context.measureText(word).width<=width){
    line=word;
    continue;
   }
   for(const character of word){
    if(line&&context.measureText(line+character).width>width){
     lines.push(line);
     line='';
    }
    line+=character;
   }
  }
  lines.push(line);
 }
 return lines;
}

function textSurfaces(value:string,width:number,font:number){
 if(!value.trim())return [];
 const density=450,pixelWidth=Math.ceil(width*density);
 const measure=document.createElement('canvas').getContext('2d')!;
 const fontStyle=`500 ${font}px system-ui`;
 measure.font=fontStyle;
 const lines=wrapLines(measure,value,pixelWidth-28);
 const surfaces:ContentMesh[]=[];
 const lineHeight=Math.ceil(font*1.28);
 // Bound the height of each text upload even for lengthy paragraphs or URLs.
 for(let start=0;start<lines.length;start+=16){
  const chunk=lines.slice(start,start+16),canvas=document.createElement('canvas');
  canvas.width=pixelWidth;
  canvas.height=chunk.length*lineHeight+8;
  const context=canvas.getContext('2d')!;
  context.font=fontStyle;
  context.fillStyle='#f4f8fc';
  context.textBaseline='middle';
  chunk.forEach((line,index)=>context.fillText(line,14,4+(index+.5)*lineHeight));
  const mesh=texturedSurface(width,canvas.height/density,canvas);
  mesh.userData.contentText=chunk.join('\n');
  surfaces.push(mesh);
 }
 return surfaces;
}
