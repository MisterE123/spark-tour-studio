import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const {outputFiles}=await build({entryPoints:['src/xr-rich-text.ts'],bundle:true,write:false,format:'iife',globalName:'reader'});
const browser=await chromium.launch({channel:process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge'});
try {
 const page=await browser.newPage();
 await page.addScriptTag({content:outputFiles[0].text});
 const actual=await page.evaluate(()=>{
  const t=(text,...marks)=>({type:'text',text,marks:marks.map(type=>typeof type==='string'?{type}:type)});
  const p=(...content)=>({type:'paragraph',content});
  const ordered={type:'orderedList',attrs:{start:7},content:[
   {type:'listItem',content:[p(t('Seven'))]}, {type:'listItem',content:[p(t('Eight'))]}]};
  const rich={version:1,doc:{type:'doc',content:[
   {type:'heading',attrs:{level:1,textAlign:'center'},content:[t('History')]},
   p(t('Bold','bold'),t(' and '),t('italic','italic'),{type:'hardBreak'},t('Old','strike'),t(' '),t('New','underline')),
   {type:'blockquote',content:[p(t('Example','code'))]},ordered,
   {type:'image',attrs:{src:'photos/stone.jpg',alt:'Original image'}},
   p(t('Read more',{type:'link',attrs:{href:'story.html'}})),
   {type:'horizontalRule'},p(t('Late paragraph')),p(t('paragraph '.repeat(1600))),p(t('A'.repeat(500)))
  ]}};
  const paint=[],bars=[];
  const originalText=CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText=function(text,x,y,...other){
   if(paint.length<100)paint.push({text,x,y,font:this.font,color:this.fillStyle});
   return originalText.call(this,text,x,y,...other);
  };
  const originalRect=CanvasRenderingContext2D.prototype.fillRect;
  CanvasRenderingContext2D.prototype.fillRect=function(x,y,w,h){if(bars.length<100)bars.push({x,y,w,h});return originalRect.call(this,x,y,w,h)};
  const entries=reader.xrRichContent(rich,1.81,'https://tour.example/assets/');
  const prePaint=paint.length;
  const out=entries.map(e=>{
   if(e.kind==='block')return e.block;
   const mesh=e.create(),canvas=mesh.material.map.image;
   const result={type:'surface',text:mesh.userData.contentText.slice(0,50),w:canvas.width,h:canvas.height,
    pixels:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0)};
   mesh.geometry.dispose();mesh.material.map.dispose();mesh.material.dispose();return result;
  });
  return {out,paint,bars,prePaint};
 });
 const {out,paint,bars}=actual;
 assert.equal(actual.prePaint,0);
 assert.ok(out.filter(x=>x.type==='surface').every(x=>x.w<=936&&x.h<=900&&x.pixels));
 const ink=label=>paint.find(x=>x.text===label);
 assert.match(ink('History').font,/(?:bold|700) 44px/);
 assert.ok(ink('History').x>150);
 assert.match(ink('Bold').font,/(?:bold|700) 32px/);
 assert.match(ink('italic').font,/italic/);
 assert.match(ink('Example').font,/monospace/);
 assert.ok(ink('Old').y>ink('Bold').y);
 for(const [label,y] of [['Old',ink('Old').y-32*.32],['New',ink('New').y+3]]){
  assert.ok(bars.some(r=>Math.abs(r.x-ink(label).x)<.01&&Math.abs(r.y-y)<.01&&r.h===2),label);
 }
 assert.ok(ink('7.')&&ink('8.'));
 assert.notEqual(ink('Read').color,ink('Bold').color);
 const img=out.findIndex(e=>e.type==='image'),next=out.findIndex(e=>e.text==='Late paragraph');
 assert.ok(img>0&&next>img&&out[img].url==='https://tour.example/assets/photos/stone.jpg');
 assert.equal(out.find(x=>x.type==='link').url,'https://tour.example/assets/story.html');
 console.log('PASS wrist reader rich-text pixels, marks, alignments, nested structure, links, inline image order and bounded texture dimensions');
} finally {await browser.close();}

