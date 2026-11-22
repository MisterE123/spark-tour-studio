import * as THREE from 'three';
import type {Block, RichTextDocument, RichTextNode} from './model';
import {resolveContentResource, resolveRichReference} from '../shared/rich-text.mjs';

type Surface = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
type Entry = {kind:'surface'; create:()=>Surface} | {kind:'block'; block:Block};
type Ink = {font:string; link:boolean; underline:boolean; strike:boolean; code:boolean};
type Word = {text:string; width:number; ink:Ink};
type Line = {words:Word[]; used:number; wrapped:boolean};

// Canvas text is uploaded in short strips. Opening an enlarged photo should
// never allocate textures for the entire document underneath it.
const DENSITY = 450;
const MAX_HEIGHT = 900;

export function xrRichContent(documentValue:RichTextDocument, width:number, base:string):Entry[] {
 const entries:Entry[] = [];
 const pixels = Math.min(936, Math.round(width * DENSITY));
 const measure = document.createElement('canvas').getContext('2d')!;
 function surface(height:number, text:string, paint:(ctx:CanvasRenderingContext2D)=>void) {
  entries.push({kind:'surface', create:()=>{
   const canvas=document.createElement('canvas');
   canvas.width=pixels;
   canvas.height=height;
   paint(canvas.getContext('2d')!);
   const map=new THREE.CanvasTexture(canvas);
   map.colorSpace=THREE.SRGBColorSpace;
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height*width/pixels),
    new THREE.MeshBasicMaterial({map,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));
   mesh.renderOrder=100;
   mesh.userData.contentText=text;
   return mesh;
  }});
 }

 function paragraph(node:RichTextNode, indent:number, quoteDepth:number, marker:string) {
  const heading=node.type==='heading';
  const size=heading?([44,40,36][Number(node.attrs?.level)-1]??36):32;
  const lineHeight=Math.ceil(size*1.35);
  const left=14+indent*28;
  const available=Math.max(80,pixels-left-14);
  const lines:Line[]=[];
  const links=new Map<string,string>();
  let words:Word[]=[],used=0;
  const flush=(wrapped=false)=>{
   while(words.length&&words[words.length-1].text===' ') used-=words.pop()!.width;
   lines.push({words,used,wrapped});words=[];used=0;
  };
  function add(value:string,ink:Ink){
   measure.font=ink.font;
   const push=(text:string,w:number)=>{words.push({text,width:w,ink});used+=w;};
   for(const token of value.match(/\s+|\S+/gu)||[]){
    const space=/^\s/u.test(token);
    if(space&&(!words.length||words[words.length-1].text===' '))continue;
    const text=space?' ':token,w=measure.measureText(text).width;
    if(!space&&words.length&&used+w>available)flush(true);
    if(w<=available){push(text,w);continue;}
    // URLs and uninterrupted words still have to fit the card. Keep Unicode
    // code points intact, and measure each completed piece with its real font.
    let piece='',advance=0;
    for(const ch of text){
     const cw=measure.measureText(ch).width;
     if(piece&&advance+cw>available){push(piece,measure.measureText(piece).width);flush(true);piece='';advance=0;}
     piece+=ch;advance+=cw;
    }
    if(piece)push(piece,measure.measureText(piece).width);
   }
  }
  const styled=(n:RichTextNode):Ink=>{
   const marks=n.marks||[],has=(type:string)=>marks.some(m=>m.type===type);
   const url=resolveRichReference(marks.find(m=>m.type==='link')?.attrs?.href,base);
   if(url&&n.text)links.set(url,(links.get(url)||'')+n.text);
   return {font:`${has('italic')?'italic ':''}${heading||has('bold')?700:500} ${size}px ${has('code')?'monospace':'system-ui'}`,
    link:!!url,underline:!!url||has('underline'),strike:has('strike'),code:has('code')};
  };
  if(marker)add(marker+' ',styled({type:'text'}));
  for(const n of node.content||[]) {
   if(n.type==='hardBreak')flush();
   else if(n.type==='text')add(n.text||'',styled(n));
  }
  flush();
  const alignment=node.attrs?.textAlign;
  const chunkSize=Math.floor((MAX_HEIGHT-8)/lineHeight);
  for(let start=0;start<lines.length;start+=chunkSize){
   const chunk=lines.slice(start,start+chunkSize);
   surface(chunk.length*lineHeight+8,chunk.map(l=>l.words.map(w=>w.text).join('')).join('\n'),ctx=>{
    ctx.textBaseline='alphabetic';
    if(quoteDepth){ctx.fillStyle='#a4b4ba';ctx.fillRect(left-11,3,3,chunk.length*lineHeight);}
    chunk.forEach((line,index)=>{
     const spare=Math.max(0,available-line.used);
     let x=left+(alignment==='right'?spare:alignment==='center'?spare/2:0);
     const spaces=line.words.filter(w=>w.text===' ').length;
     const justify=alignment==='justify'&&line.wrapped&&spaces?spare/spaces:0;
     const y=4+index*lineHeight+size;
     for(const word of line.words){
      const {ink}=word,advance=word.width+(word.text===' '?justify:0);
      ctx.font=ink.font;
      if(ink.code){ctx.fillStyle='rgba(255,255,255,.13)';ctx.fillRect(x,y-size,advance,lineHeight-3);}
      ctx.fillStyle=ink.link?'#a7ddff':'#f5f5f5';
      ctx.fillText(word.text,x,y);
      if(ink.underline)ctx.fillRect(x,y+3,advance,2);
      if(ink.strike)ctx.fillRect(x,y-size*.32,advance,2);
      x+=advance;
     }
    });
   });
  }
  // Keep external addresses available in the reader through the existing link
  // block presentation and URL validation used by other tour content.
  for(const [url,text] of links)entries.push({kind:'block',block:{type:'link',text,url}});
 }
 function visit(node:RichTextNode, indent=0, quotes=0, marker='') {
  if(node.type==='paragraph'||node.type==='heading'){paragraph(node,indent,quotes,marker);return;}
  if(node.type==='horizontalRule'){surface(18,'',c=>{c.fillStyle='#97a4a9';c.fillRect(14,8,pixels-28,2);});return;}
  if(node.type==='image'){
   const url=resolveContentResource(node.attrs?.src,base),text=String(node.attrs?.alt||node.attrs?.title||'');
   if(url||text)entries.push({kind:'block',block:{type:url?'image':'text',url:url||'',text}});
   return;
  }
  const list=node.type==='orderedList'||node.type==='bulletList',quote=node.type==='blockquote';
  const start=Number(node.attrs?.start)||1;
  (node.content||[]).forEach((child,i)=>visit(child,indent+Number(list||quote),quotes+Number(quote),
   list?(node.type==='orderedList'?`${start+i}.`:'•'):i===0?marker:''));
 }
 visit(documentValue.doc);
 return entries;
}
