import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from '@playwright/test';

const {outputFiles}=await build({
 stdin:{contents:"export * as THREE from 'three'; export * from './src/xr-content'; export {releaseUI} from './src/spatial-ui';",resolveDir:process.cwd()},
 bundle:true,write:false,format:'iife',globalName:'reader'
});
const browserChannel=process.env.SPARK_TEST_BROWSER_CHANNEL||'msedge';
const browser=await chromium.launch({channel:browserChannel==='bundled'?undefined:browserChannel,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:720,height:600}});
 const images={
  '/portrait.svg':'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="400"><path fill="#fae000" d="M0 0h200v200H0z"/><path fill="#0044ff" d="M0 200h200v200H0z"/></svg>',
  '/wide.svg':'<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="2000" viewBox="0 0 400 200"><path fill="#ff2000" d="M0 0h200v200H0z"/><path fill="#00d040" d="M200 0h200v200H200z"/></svg>'
 };
 await page.route('http://wrist-reader.test/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  if(pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><link rel="icon" href="data:,"><style>body{margin:0}</style>'});
  const image=images[pathname];
  return image?route.fulfill({contentType:'image/svg+xml',body:image}):route.fulfill({status:404});
 });
 await page.goto('http://wrist-reader.test/');
 await page.addScriptTag({content:outputFiles[0].text});
 await page.evaluate(()=>{
  const {THREE,XRContent,XR_CONTENT_CARD,releaseUI}=reader;
  const {width,height,scale}=XR_CONTENT_CARD;
  const content=new XRContent(),scene=new THREE.Scene(),hud=new THREE.Group();
  const camera=new THREE.PerspectiveCamera(55,720/600,.05,20);
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(720,600);
  renderer.setClearColor('#59718c');
  document.body.append(renderer.domElement);
  scene.add(hud);
  hud.scale.setScalar(scale);
  hud.position.set(-.08,-.05,-.62);
  hud.lookAt(camera.position);
  const text=(text)=>({type:'text',text,url:''});
  const photo=(url,text)=>({type:'image',url,text});
  const wide=photo('wide.svg','Wide landscape'),portrait=photo('portrait.svg','Portrait caption '+('long caption line '.repeat(40)));
  const article={id:'reading-card',title:'A long card title '.repeat(25),html:'',blocks:[
   wide,{type:'text',text:'',url:'',richText:{version:1,doc:{type:'doc',content:[
    {type:'image',attrs:{src:portrait.url,alt:portrait.text}},
    {type:'heading',attrs:{level:2},content:[{type:'text',text:'After the photograph'}]}
   ]}}},
   text('longword'.repeat(350)),text('End of document')
  ]};
  const missing={id:'missing',title:'Missing photograph',html:'',blocks:[photo('absent.svg','Missing caption'),text('Still readable')]};
  let closed=0,menu=0,opened=0,page=article,glassShade=.36;
  const actions={close:()=>{closed++;},menu:()=>{menu++;},openScene:()=>{opened++;}};
  const render=()=>{
   for(const child of [...hud.children])releaseUI(child);
   content.render(hud,page,location.href,render,actions,glassShade);
   scene.updateMatrixWorld(true);
  };
  const tick=()=>renderer.render(scene,camera);
  const backing=()=>hud.children.find(o=>o.userData.contentCard);
  const labeled=label=>hud.children.find(o=>o.userData.label===label);
  const rasters=()=>hud.children.filter(o=>o.material.map).map(o=>{
   const {width,height}=o.material.map.image;
   return Math.max(width,height);
  });
  const images=()=>hud.children.filter(o=>o.userData.imageState);
  const bounds=o=>{
   const {width,height}=o.geometry.parameters;
   const halfX=width*o.scale.x/2,halfY=height*o.scale.y/2;
   return {left:o.position.x-halfX,right:o.position.x+halfX,top:o.position.y+halfY,bottom:o.position.y-halfY};
  };
  const pixels=(object,x,y)=>{
   const p=object.localToWorld(new THREE.Vector3(x,y,.002)).project(camera);
   const gl=renderer.getContext(),rgba=new Uint8Array(4);
   gl.readPixels(Math.round((p.x+1)*gl.drawingBufferWidth/2),Math.round((p.y+1)*gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
   return Array.from(rgba);
  };
  const hit=(x,y)=>{
   hud.updateWorldMatrix(true,true);
   const start=new THREE.Vector3(.20,-.10,-.27),point=hud.localToWorld(new THREE.Vector3(x,y,0));
   const ray=new THREE.Raycaster(start,point.sub(start).normalize());
   return ray.intersectObjects(hud.children,false).find(hit=>hit.object.visible&&content.accepts(hit))?.object;
  };
  const click=(object)=>{
   if(hit(object.position.x,object.position.y)!==object)throw Error('Ray missed '+object.userData.label);
   object.userData.action();
  };
  window.layout={content,hud,backing,images,labeled,tick,rasters,bounds,pixels,hit,click,physicalWidth:width*scale,physicalHeight:height*scale,
   portraitLabel:'Enlarge image: '+portrait.text,actionCounts:()=>({closed,menu,opened}),
   useMissing:()=>{page=missing;render();},useShade:value=>{glassShade=value;render();}};
  render();
 });
 await page.waitForFunction(()=>layout.images().every(o=>o.userData.imageState==='ready'));
 const initial=await page.evaluate(()=>{
  const check=layout,{content,hud,bounds,labeled}=check;
  const card=bounds(check.backing()),close=labeled('Close content');
  const footer=['Tour menu','Up','Down'].map(labeled).map(bounds);
  const {width,height}=check.images()[0].geometry.parameters;
  const closeBounds=bounds(close);
  check.tick();
  const wide=check.images()[0],left=check.pixels(wide,-width/4,0),right=check.pixels(wide,width/4,0);
  const named=hud.children.map(o=>o.userData.label||o.userData.contentText||'');
  const inlinePortrait=check.images()[1].geometry.parameters;
  return {width:check.physicalWidth,height:check.physicalHeight,aspect:width/height,wideWidth:width*hud.scale.x,inlinePortraitHeight:inlinePortrait.height*hud.scale.x,above:closeBounds.bottom>content.top,
   corners:closeBounds.left>0&&closeBounds.right<card.right&&closeBounds.top<card.top&&close.geometry.parameters.width*hud.scale.x>=.04,
   footer:footer.every((b,i)=>b.top<content.bottom&&b.bottom>card.bottom&&(!i||b.left>footer[i-1].right)),
   visibleBounds:hud.children.filter(o=>o.visible&&o.userData.contentItem).every(o=>{
    const b=bounds(o);
    return b.top<=content.top+1e-9&&b.bottom>=content.bottom-1e-9;
   }),
   ordered:named.indexOf(check.portraitLabel)<named.indexOf('After the photograph'),
   rasterMax:Math.max(...check.rasters().filter(n=>n!==1536)),wideRaster:wide.material.map.image.width,left,right};
 });
 assert.ok(initial.width>.34&&initial.width<.35&&initial.height<.34);
 assert.equal(initial.aspect,2);
 assert.ok(initial.wideWidth>.29&&initial.inlinePortraitHeight>.17&&initial.inlinePortraitHeight<.18);
 assert.ok(initial.above&&initial.corners&&initial.footer&&initial.ordered&&initial.visibleBounds);
 assert.ok(initial.rasterMax<=936&&initial.wideRaster===1536);
 assert.ok(initial.left[0]>initial.left[1]*2&&initial.right[1]>initial.right[0]*2,JSON.stringify(initial));

 const cropped=await page.evaluate(()=>{
  const check=layout,{content,hud,images,pixels,hit}=check,wide=images()[0];
  content.scroll(.17);
  hud.position.x-=.11;
  hud.rotation.y+=.16;
  check.tick();
  const uv=wide.geometry.attributes.uv;
  const outsideY=content.top+.025;
  const outside=pixels(hud,wide.position.x-wide.geometry.parameters.width/4,outsideY);
  const rayMiss=hit(wide.position.x,outsideY)!==wide;
  const clipped={top:check.bounds(wide).top,expected:content.top,scale:wide.scale.y,vTop:uv.getY(0),vBottom:uv.getY(2),outside,rayMiss};
  content.scroll(-100);
  return clipped;
 });
 assert.ok(Math.abs(cropped.top-cropped.expected)<1e-9&&cropped.scale<1&&cropped.vTop<1&&cropped.vBottom===0);
 assert.ok(cropped.rayMiss&&cropped.outside[0]<cropped.outside[1]*2,JSON.stringify(cropped));

 const offset=await page.evaluate(()=>{
  const check=layout;
  check.click(check.labeled('Down'));
  const before=check.content.offset;
  check.click(check.labeled(check.portraitLabel));
  return before;
 });
 await page.waitForFunction(()=>layout.images().length===1&&layout.images()[0].userData.imageState==='ready');
 const portrait=await page.evaluate(()=>{
  const check=layout,photo=check.images()[0],before=check.content.offset;
  check.tick();
  const {width,height}=photo.geometry.parameters;
  const photoBounds=check.bounds(photo),backBounds=check.bounds(check.labeled('Back to content'));
  const fullyShown=photo.scale.y===1&&photoBounds.top<=check.content.top+1e-9&&photoBounds.bottom>backBounds.top;
  const upper=check.pixels(photo,0,height/4),lower=check.pixels(photo,0,-height/4);
  check.click(check.labeled('Down'));
  const captionScroll=check.content.offset>before;
  check.click(check.labeled('Back to content'));
  return {aspect:width/height,height:height*check.hud.scale.x,upper,lower,captionScroll,fullyShown};
 });
 assert.equal(portrait.aspect,.5);assert.ok(portrait.height>.22&&portrait.height<.24&&portrait.captionScroll&&portrait.fullyShown);
 assert.ok(portrait.upper[0]>2*portrait.upper[2]&&portrait.upper[1]>2*portrait.upper[2]&&portrait.lower[2]>2*portrait.lower[0],JSON.stringify(portrait));
 await page.waitForFunction(()=>layout.images().every(o=>o.userData.imageState==='ready'));
 assert.ok(Math.abs(await page.evaluate(()=>layout.content.offset)-offset)<.001);
 const last=await page.evaluate(()=>{
  layout.content.scroll(100);
  return {
   reachable:layout.hud.children.some(o=>o.visible&&o.userData.contentText==='End of document'),
   unloaded:layout.images().every(o=>o.userData.imageState==='idle')
  };
 });
 assert.deepEqual(last,{reachable:true,unloaded:true});
 await page.evaluate(()=>layout.useMissing());
 await page.waitForFunction(()=>layout.images()[0].userData.imageState==='error');
 const recovery=await page.evaluate(()=>{
  const check=layout;
  check.click(check.labeled('Close content'));
  check.click(check.labeled('Tour menu'));
  return {readable:check.hud.children.some(o=>o.visible&&o.userData.contentText==='Still readable'),actions:check.actionCounts()};
 });
 assert.deepEqual(recovery,{readable:true,actions:{closed:1,menu:1,opened:0}});
 const shades=await page.evaluate(()=>{
  const check=layout;
  return [.16,.36,.75].map(value=>{
   check.useShade(value);
   const canvas=check.backing().material.map.image;
   return Array.from(canvas.getContext('2d').getImageData(canvas.width/2,canvas.height/2,1,1).data);
  });
 });
 assert.ok(shades.every(([r,g,b,a])=>r===g&&g===b&&a>0&&a<255));
 assert.ok(shades[0][3]<shades[1][3]&&shades[1][3]<shades[2][3]);
 console.log('PASS neutral wrist glass and adjustable shade, larger portrait and landscape pixels, controller hit regions, scroll recovery and failed media');
}finally{await browser.close();}
