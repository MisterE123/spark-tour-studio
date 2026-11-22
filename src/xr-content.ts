import * as THREE from 'three';
import type {Page,SceneLink} from './model';
import {glassVariables} from '../shared/appearance.mjs';
import {resolveRichReference,resolveContentResource} from '../shared/rich-text.mjs';
import {imagePanel} from './spatial-ui';
import {materialSymbols,type IconName} from './material-symbols';
import {xrRichContent} from './xr-rich-text';

export const XR_CONTENT_CARD={width:2.08,height:2.01,scale:.167} as const;

type ContentMesh=THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
type Item={mesh:ContentMesh;height:number};
type CardActions={close:()=>void;menu:()=>void;openScene:(link:SceneLink)=>void};

const bodyX=-.035;
const itemGap=.035;
const imageDepth=.025;
const cardTop=.94;
const readerBottom=-.69;
const portraitExtension=.26;
const imagePlaceholderHeight=.64;

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

function canvasFor(width:number,height:number,density=450){
 const canvas=document.createElement('canvas');
 canvas.width=Math.ceil(width*density);
 canvas.height=Math.ceil(height*density);
 return canvas;
}

function label(text:string,width:number,height:number,{font=30,button=false,center=false,icon}:{font?:number;button?:boolean;center?:boolean;icon?:IconName}={}){
 const canvas=canvasFor(width,height),context=canvas.getContext('2d')!;
 if(button){
  const highlight=context.createLinearGradient(0,0,0,canvas.height);
  highlight.addColorStop(0,'rgba(255,255,255,.14)');
  highlight.addColorStop(1,'rgba(255,255,255,.06)');
  context.fillStyle=highlight;
  context.strokeStyle='rgba(255,255,255,.28)';
  context.lineWidth=2;
  context.beginPath();
  context.roundRect(1,1,canvas.width-2,canvas.height-2,15);
  context.fill();
  context.stroke();
 }
 if(icon){
  const size=Math.min(canvas.width,canvas.height)*.78;
  context.translate((canvas.width-size)/2,(canvas.height+size)/2);
  context.scale(size/960,size/960);
  context.fillStyle='#f5f5f5';
  context.fill(new Path2D(materialSymbols[icon]));
  return texturedSurface(width,height,canvas);
 }
 const lines=text.split('\n');
 context.font=`600 ${font}px system-ui`;
 context.textBaseline='middle';
 context.textAlign=center?'center':'left';
 context.fillStyle='#f5f5f5';
 context.shadowColor='rgba(0,0,0,.65)';
 context.shadowBlur=4;
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

function backing(glassShade:number|undefined,extension:number){
 const {width}=XR_CONTENT_CARD,height=XR_CONTENT_CARD.height+extension;
 const canvas=canvasFor(width,height,Math.min(450,936/height)),context=canvas.getContext('2d')!;
 const gradient=context.createLinearGradient(0,0,canvas.width,canvas.height);
 gradient.addColorStop(0,'rgba(255,255,255,.063)');
 gradient.addColorStop(1,'rgba(255,255,255,0)');
 context.strokeStyle='rgba(255,255,255,.31)';
 context.lineWidth=3;
 context.beginPath();
 context.roundRect(2,2,canvas.width-4,canvas.height-4,32);
 // The VR scene remains visible through the desktop glass. A neutral backing
 // keeps the unblurred scene from competing with the reader text.
 context.fillStyle='rgba(0,0,0,.18)';
 context.fill();
 context.fillStyle=glassVariables({glassShade})['--glass-strong'];
 context.fill();
 context.fillStyle=gradient;
 context.fill();
 context.stroke();
 const mesh=texturedSurface(width,height,canvas);
 mesh.position.set(0,cardTop-height/2,-.015);
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
 get bottom(){return readerBottom-(this.focusedPortrait?portraitExtension:0);}
 readonly width=1.81;
 private focusedPortrait=false;
 private fitPhoto=false;
 private photoAspects=new Map<string,number>();
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
  this.focusedPortrait=false;
  this.fitPhoto=false;
  this.photoAspects.clear();
  this.items=[];
  this.hud=undefined;
  this.track=undefined;
  this.thumb=undefined;
  this.scrollControls=[];
 }

 render(hud:THREE.Group,page:Page,base:string,refresh:()=>void,actions:CardActions,glassShade?:number){
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
   this.focusedPortrait=false;
   this.fitPhoto=false;
   this.offset=this.pageOffset;
  }

  const focused=this.focus>=0;
  const focusedAspect=this.photoAspects.get(focusedUrl);
  const canFit=focusedAspect!==undefined&&this.width/focusedAspect>this.top-this.bottom;
  const footerY=this.bottom-.20;
  const valid=()=>this.page===page&&this.hud===hud&&hud.visible;
  const add=(mesh:ContentMesh)=>{
   mesh.userData.contentItem=true;
   const item={mesh,height:mesh.geometry.parameters.height};
   this.items.push(item);
   hud.add(mesh);
   return item;
  };
  const text=(value:string,caption=false)=>{
   for(const mesh of textSurfaces(value,this.width,caption?28:32))add(mesh);
  };
  const image=(url:string,caption:string,index:number)=> {
   const resize=(aspect:number)=>{
    const width=focused&&this.fitPhoto?Math.min(this.width,(this.top-this.bottom)*aspect):this.width;
    item.height=width/aspect;
    if(mesh.userData.imageState==='ready')resizePlane(mesh,width,item.height);
   };
   // A width-filled portrait can be several times taller than the viewport.
   // Allocate its layout space separately from the bounded placeholder raster.
   const mesh=imagePanel(url,this.width,imagePlaceholderHeight,valid,()=>{
    const aspect=mesh.userData.imageAspect as number;
    this.photoAspects.set(url,aspect);
    resize(aspect);
    this.layout();
   },true,focused?2048:1536);
   const item=add(mesh);
   const knownAspect=this.photoAspects.get(url);
   if(knownAspect)resize(knownAspect);
   if(!focused){
    const unload=mesh.userData.unloadImage;
    mesh.userData.unloadImage=()=>{
     if(mesh.userData.imageState!=='ready')return;
     unload();
     resizePlane(mesh,this.width,imagePlaceholderHeight);
    };
    mesh.userData.imageIndex=index;
    mesh.userData.label='Enlarge image'+(caption?': '+caption:'');
    mesh.userData.action=()=>{
     if(mesh.userData.imageState!=='ready')return;
     this.pageOffset=this.offset;
     this.offset=0;
     this.focus=index;
     this.focusedPortrait=mesh.userData.imageAspect<1;
     this.fitPhoto=false;
     refresh();
    };
   }else delete mesh.userData.unloadImage;
   if(caption)text(caption,true);
   return resize;
  };

  hud.add(backing(glassShade,this.focusedPortrait?portraitExtension:0));
  const title=label(focused?'Photograph':page.title.replace(/\s+/g,' '),1.62,.23,{font:38});
  title.position.set(-.13,.76,imageDepth);
  hud.add(title);
  this.control(hud,'×','Close content',.25,.85,.76,actions.close,48);
  this.addSeparator(hud,.62);
  this.addSeparator(hud,this.bottom-.05);

  if(focusedBlock&&focusedUrl){
   const resize=image(focusedUrl,focusedBlock.text,this.focus);
   if(canFit){
    const setMode=(fit:boolean)=>{
     this.fitPhoto=fit;
     this.offset=0;
     fitButton.visible=!fit;
     fillButton.visible=fit;
     resize(focusedAspect);
     this.layout();
    };
    const fitButton=this.control(hud,'Fit photo','Fit photo',.65,.65,footerY,()=>setMode(true),29);
    const fillButton=this.control(hud,'Fill width','Fill width',.65,.65,footerY,()=>setMode(false),29);
    fitButton.visible=!this.fitPhoto;
    fillButton.visible=this.fitPhoto;
   }
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
    const mesh=label(link.label.replace(/\s+/g,' ')+'  ›',this.width,.22,{button:true});
    mesh.userData.label=link.label;
    mesh.userData.action=()=>actions.openScene(link);
    add(mesh);
   }
  }

  if(focused)this.control(hud,'‹ Back to\ncontent','Back to content',.69,-.625,footerY,()=>{
   this.focus=-1;
   this.focusedPortrait=false;
   this.fitPhoto=false;
   this.offset=this.pageOffset;
   refresh();
  },27);
  else this.control(hud,'Tour menu','Tour menu',.69,-.625,footerY,actions.menu,30);

  const step=(this.top-this.bottom)*.55;
  const up=this.control(hud,'','Up',.25,-.12,footerY,()=>this.scroll(-step),30,'arrow_upward');
  const down=this.control(hud,'','Down',.25,.18,footerY,()=>this.scroll(step),30,'arrow_downward');
  up.userData.contentScroll=-1;
  down.userData.contentScroll=1;
  this.scrollControls=[up,down];
  if(!canFit){
   const hint=label('Aim + right stick\nto scroll',.65,.24,{font:25,center:true});
   hint.position.set(.65,footerY,imageDepth);
   hud.add(hint);
   this.scrollControls.push(hint);
  }

  const viewport=this.top-this.bottom;
  this.track=surface(.018,viewport,0xffffff,.22);
  this.track.position.set(.926,(this.top+this.bottom)/2,.03);
  this.thumb=surface(.026,1,0xe6e6e6,.75);
  this.thumb.position.set(.926,0,.035);
  hud.add(this.track,this.thumb);
  this.layout();
 }

 private addSeparator(hud:THREE.Group,y:number){
  const separator=surface(1.92,.005,0xffffff,.16);
  separator.position.set(0,y,.01);
  hud.add(separator);
 }

 private control(hud:THREE.Group,text:string,name:string,width:number,x:number,y:number,action:()=>void,font:number,icon?:IconName){
  const control=label(text,width,.24,{font,center:true,button:true,icon});
  control.position.set(x,y,.04);
  control.userData.label=name;
  control.userData.action=action;
  hud.add(control);
  return control;
 }

 private layout(){
  if(!this.hud||!this.track||!this.thumb)return;
  const height=this.items.reduce((total,item)=>total+item.height+itemGap,0);
  const viewport=this.top-this.bottom;
  this.extent=Math.max(0,height-itemGap-viewport);
  this.offset=THREE.MathUtils.clamp(this.offset,0,this.extent);
  let upper=this.top+this.offset;
  for(const {mesh,height} of this.items){
   const lower=upper-height;
   cropItem(mesh,upper,upper-mesh.geometry.parameters.height,this.top,this.bottom);
   if(upper>this.bottom-viewport&&lower<this.top+viewport)mesh.userData.loadImage?.();
   else if(upper<this.bottom-viewport*2||lower>this.top+viewport*2)mesh.userData.unloadImage?.();
   upper=lower-itemGap;
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

function resizePlane(mesh:ContentMesh,width:number,height:number){
 if(mesh.geometry.parameters.width===width&&mesh.geometry.parameters.height===height)return;
 mesh.geometry.dispose();
 mesh.geometry=new THREE.PlaneGeometry(width,height);
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
