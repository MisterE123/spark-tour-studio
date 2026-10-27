import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import {Vector3} from 'three';
import {blankProject,newScene,identity} from '../shared/project.mjs';
import {sceneMatrix} from '../shared/collision-selection.mjs';
import {encodeCollisionTile,collisionCellId,collisionTileBounds,collisionSha256,validatePagedCollisionManifest} from '../shared/paged-collision.mjs';
import {radFixture} from '../tests/fixtures.mjs';

const require=createRequire(import.meta.url),{startServer}=require('../desktop/server.cjs');
const output=path.resolve('test-output','collision overview '+Date.now()),dist=path.resolve(process.env.SPARK_PACKAGED?'release/win-unpacked/resources/viewer':'dist');
const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const actualManifest=option('--manifest');
await fs.mkdir(path.join(output,'config'),{recursive:true});await fs.mkdir(path.join(output,'physics/tiles'),{recursive:true});

const volume=(id,type,operation,position,size)=>({id,type,operation,position,rotation:[0,0,0],size});
const generation={scope:'selected',options:{detail:.2,pageSize:8,extrudeUp:false,wallHeight:3},volumes:[volume('corridor','box','add',[96,1.5,4],[192,3,8]),volume('room','box','add',[4,1.5,4],[8,3,8]),volume('exclusion','ball','remove',[80,1.5,4],[2,2,2])]};
const manifest={format:'spark-tour-collision',version:1,representation:'allowed-space',detail:.2,tileCells:40,tileSize:8,coordinateSystem:'generation',sourceTransform:identity(),bounds:{min:[0,0,0],max:[192,8,8]},tiles:[],generation};
for(let x=0;x<24;x++){
 const coord=[x,0,0],occupied=[];
 for(let a=0;a<40;a++)for(let b=0;b<15;b++)for(let c=0;c<40;c++){
  const world=[x*8+(a+.5)*.2,(b+.5)*.2,(c+.5)*.2];
  if(Math.hypot(world[0]-80,world[1]-1.5,world[2]-4)>2)occupied.push(collisionCellId(a,b,c,40));
 }
 const bytes=encodeCollisionTile({coord,tileCells:40,occupied}),url=`tiles/${x}_0_0.scv`;
 manifest.tiles.push({key:coord.join(','),coord,url,bytes:bytes.length,sha256:await collisionSha256(bytes),bounds:collisionTileBounds(coord,8),voxels:occupied.length});await fs.writeFile(path.join(output,'physics',url),bytes);
}
validatePagedCollisionManifest(manifest);await fs.writeFile(path.join(output,'physics/scene.collision.json'),JSON.stringify(manifest));
// The second saved collider describes the same generation-space domain through
// a different source frame. This catches a missing inverse sourceTransform.
const transformed=structuredClone(manifest);transformed.sourceTransform={position:[5,1,-3],rotation:[0,.37,0],scale:1.4};
const inverse=sceneMatrix(transformed.sourceTransform).invert();
for(const shape of transformed.generation.volumes){shape.position=new Vector3(...shape.position).applyMatrix4(inverse).toArray();shape.rotation[1]-=transformed.sourceTransform.rotation[1];shape.size=shape.size.map(value=>value/transformed.sourceTransform.scale);}
await fs.writeFile(path.join(output,'physics/transformed.collision.json'),JSON.stringify(transformed));
const project=blankProject(),scene=newScene('corridor','Whole-domain collision guides','scan.rad');scene.collider='physics/scene.collision.json';scene.modes=['jumps','fly','explore'];scene.viewpoints[0].position=[4,1.7,4];
// Deliberately unfinished authoring edits must not replace the saved domain.
scene.collisionAuthoring={scope:'selected',format:'paged',volumes:[volume('draft','box','add',[10000,1,0],[2,2,2])],options:{detail:.2,pageSize:8}};
const empty=newScene('empty','No collision','scan.rad');project.scenes=[scene,empty];project.startScene=scene.id;
await fs.writeFile(path.join(output,'scan.rad'),radFixture().rad);await fs.writeFile(path.join(output,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(output,'config/hosting.json'),'{}');
let real;
if(actualManifest){const file=path.resolve(actualManifest),data=validatePagedCollisionManifest(JSON.parse(await fs.readFile(file,'utf8')));real={folder:path.dirname(file),file:path.basename(file),manifest:data,allowed:new Set([path.basename(file),...data.tiles.map(entry=>entry.url),...(data.navigation?.tiles||[]).map(entry=>entry.url)])};}
const {server,url}=await startServer({root:dist,resolve:name=>{
 if(name.startsWith('saved-collision/')){const relative=name.slice('saved-collision/'.length);return real?.allowed.has(relative)?{root:real.folder,relative}:false;}
 return /^(config|physics)\//.test(name)||name==='scan.rad'?{root:output,relative:name}:undefined;
}});
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-webgl','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
let page;const errors=[],external=[],requests=[],report={};
try{
 page=await browser.newPage({viewport:{width:1280,height:850}});page.setDefaultTimeout(60000);
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const target=request.url();if(/\/tiles\/.*\.scv/.test(target))requests.push(target);if(/^https?:/.test(target)&&!target.startsWith(url))external.push(target);});
 await page.goto(url+'?diagnostics=1');await page.getByRole('button',{name:'Enter tour',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 assert.equal(await page.evaluate(()=>!!window.tourRuntime.pagedCollider),false,'viewpoints do not load physics or guides preemptively');
 await page.evaluate(async()=>{const r=window.tourRuntime;r.setMode('fly');await r.modeTransition;r.renderer.setAnimationLoop(null);await r.pagedCollider.ensure({x:4,y:1.7,z:4});});
 const stats=()=>page.evaluate(()=>{const r=window.tourRuntime,p=r.pagedCollider;let colliders=0;r.world.forEachCollider(()=>colliders++);return {pages:p.residentTiles,bytes:p.residentBytes,chunks:p.physicsChunks,triangles:p.physicsTriangles,colliders};});
 const guide=()=>page.evaluate(()=>{const r=window.tourRuntime,p=r.pagedCollider,g=p.overview.group;g.updateWorldMatrix(true,true);const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];let lines=0,segments=0,capacity=0,visible=true;g.traverse(object=>{if(!object.isLineSegments)return;lines++;const position=object.geometry.getAttribute('position'),start=object.geometry.drawRange.start||0,count=Math.min(position.count-start,object.geometry.drawRange.count);capacity+=position.count/2;segments+=count/2;visible=visible&&object.visible;for(let i=start;i<start+count;i++){const point=new r.rig.position.constructor().fromBufferAttribute(position,i).applyMatrix4(object.matrixWorld);for(let axis=0;axis<3;axis++){const value=point.getComponent(axis);low[axis]=Math.min(low[axis],value);high[axis]=Math.max(high[axis],value);}}});return {lines,segments,capacity,visible:g.visible&&visible,parentOverlay:g.parent===r.overlay,insidePhysicsGroup:!!g.parent&&g.parent===p.group,low,high};});
 const camera=async(position,target)=>page.evaluate(({position,target})=>{const r=window.tourRuntime;r.stopFlight();r.navigator=undefined;r.rig.position.fromArray(position);r.rig.rotation.set(0,0,0);r.camera.position.set(0,0,0);r.camera.lookAt(new r.rig.position.constructor().fromArray(target));r.scene.updateMatrixWorld(true);r.pagedCollider.updateOverview(r.camera,850);},{position,target});
 const render=()=>page.evaluate(()=>{const r=window.tourRuntime;r.renderer.autoClear=true;r.renderer.render(r.scene,r.camera);r.renderer.autoClear=false;r.renderer.clearDepth();r.renderer.render(r.overlay,r.camera);r.renderer.autoClear=true;});
 const baseline=await stats(),requestCount=requests.length;assert.ok(baseline.chunks>0&&baseline.triangles>0);assert.ok(new Set(requests).size<5,'the initial physics patch is local');
 await camera([96,900,900],[96,1.5,4]);await page.evaluate(()=>{const r=window.tourRuntime;r.showCollider(true);r.pagedCollider.updateOverview(r.camera,850);});const far=await guide();
 assert.equal(far.parentOverlay,true);assert.equal(far.insidePhysicsGroup,false);assert.equal(far.visible,true);assert.equal(far.lines,1,'one merged draw object represents the whole domain');assert.ok(far.segments>0&&far.segments<=65536);assert.ok(far.capacity<=65536);assert.ok(far.low[0]<.01&&far.high[0]>191.99,'guides span even the unloaded far end');assert.ok(far.high[0]<1000,'unsaved collision-authoring changes do not alter the saved domain');assert.deepEqual(await stats(),baseline);assert.equal(requests.length,requestCount,'showing the whole scene downloads no distant collision pages');
 const draws=await page.evaluate(()=>{const r=window.tourRuntime,g=r.pagedCollider.overview.group,saved=r.overlay.children.map(object=>[object,object.visible]);try{for(const [object]of saved)object.visible=object===g;r.renderer.info.reset();r.renderer.render(r.overlay,r.camera);return r.renderer.info.render.calls;}finally{for(const [object,visible]of saved)object.visible=visible;}});assert.equal(draws,1,'the far overview renders in one draw call');await render();await page.screenshot({path:path.join(output,'whole-scene-overview.png')});
 await page.evaluate(()=>{const r=window.tourRuntime;r.showCollider(false);r.pagedCollider.updateOverview(r.camera,850);});assert.equal((await guide()).visible,false);await page.evaluate(()=>window.tourRuntime.showCollider(true));
 await camera([96,4,10],[96,1.5,4]);const near=await guide();assert.ok(near.segments>far.segments,'distance LOD refines nearby guides');assert.ok(near.segments<=65536);assert.deepEqual(await stats(),baseline);assert.equal(requests.length,requestCount,'guide LOD and show/hide never request physics pages');await render();await page.screenshot({path:path.join(output,'near-guide-refinement.png')});
 await page.evaluate(async()=>{const p=window.tourRuntime.pagedCollider;await p.ensure({x:180,y:1.7,z:4});});const detailed=await stats();assert.ok(detailed.chunks>0&&detailed.triangles>0);assert.ok(detailed.chunks<=2048&&detailed.triangles<=600000);assert.ok(new Set(requests).size<8,'moving physics focus still leaves most distant pages unloaded');
 const floor=await page.evaluate(()=>{const r=window.tourRuntime,p=r.pagedCollider,hit=r.world.castRayAndGetNormal({origin:{x:180,y:1.7,z:4},dir:{x:0,y:-1,z:0}},3,true,undefined,undefined,r.capsule);return {floor:hit?.timeOfImpact,allowed:p.allows({x:180,y:.9,z:4},.6,.24),old:p.allows({x:4,y:.9,z:4},.6,.24)};});assert.ok(Math.abs(floor.floor-1.7)<.05);assert.equal(floor.allowed,true);assert.equal(floor.old,false,'overview guides never count as prepared physics');
 const transformedState=await page.evaluate(async()=>{const r=window.tourRuntime,s=structuredClone(r.active);s.transform={position:[10,2,-5],rotation:[.1,.4,0],scale:1.3};s.colliderTransform={position:[-2,.5,3],rotation:[0,-.2,0],scale:.8};r.updateScene(s);await r.colliderTransition;r.pagedCollider.updateOverview(r.camera,850);const p=r.pagedCollider;r.collider.updateWorldMatrix(true,false);return {guide:p.overview.group.matrixWorld.elements,physics:p.group.matrixWorld.elements,expected:r.collider.matrixWorld.clone().multiply(p.group.matrix).elements};});report.transformedState=transformedState;for(let i=0;i<16;i++){assert.ok(Math.abs(transformedState.guide[i]-transformedState.physics[i])<1e-8,'guide and exact physics retain the same world frame');assert.ok(Math.abs(transformedState.physics[i]-transformedState.expected[i])<1e-8,'parent scene and collider transforms update before a render');}
 const retire=()=>page.evaluate(()=>{const r=window.tourRuntime,p=r.pagedCollider;window.retiredOverview={pager:p,group:p.overview.group,geometry:0,material:0};p.overview.group.traverse(object=>{object.geometry?.addEventListener('dispose',()=>window.retiredOverview.geometry++);for(const material of Array.isArray(object.material)?object.material:[object.material].filter(Boolean))material.addEventListener('dispose',()=>window.retiredOverview.material++);});});
 const disposed=()=>page.evaluate(()=>{const old=window.retiredOverview;return {detached:!old.group.parent,geometry:old.geometry,material:old.material,pages:old.pager.residentTiles,chunks:old.pager.physicsChunks,triangles:old.pager.physicsTriangles};});
 await retire();const immediateFrame=await page.evaluate(async()=>{const r=window.tourRuntime,s=structuredClone(r.active);s.collider='physics/transformed.collision.json';r.updateScene(s);await r.colliderTransition;const p=r.pagedCollider,point=new r.rig.position.constructor().set(4,1.7,4);r.collider.updateWorldMatrix(true,false);const expected=point.clone().applyMatrix4(p.group.matrix).applyMatrix4(r.collider.matrixWorld),actual=p.fromGeneration(point);p.updateOverview(r.camera,850);return {expected:expected.toArray(),actual:actual.toArray()};});report.immediateFrame=immediateFrame;assert.ok(Math.hypot(...immediateFrame.actual.map((value,index)=>value-immediateFrame.expected[index]))<1e-7,'source-frame conversion must work immediately before the first render');const replacement=await disposed();assert.equal(replacement.detached,true);assert.ok(replacement.geometry>0&&replacement.material>0);assert.equal(replacement.pages,0);assert.equal(replacement.chunks,0);assert.equal(replacement.triangles,0);
 const inverseFrame=await page.evaluate(()=>{const p=window.tourRuntime.pagedCollider;p.group.updateWorldMatrix(true,true);p.overview.group.updateWorldMatrix(true,true);return {guide:p.overview.group.matrixWorld.elements,physics:p.group.matrixWorld.elements,groups:window.tourRuntime.overlay.children.filter(object=>object===p.overview.group).length};});for(let i=0;i<16;i++)assert.ok(Math.abs(inverseFrame.guide[i]-inverseFrame.physics[i])<1e-8,'replacement retains the inverse source-transform frame');assert.equal(inverseFrame.groups,1);
 await retire();await page.evaluate(()=>window.tourRuntime.selectScene('empty'));const switched=await disposed();assert.equal(switched.detached,true);assert.ok(switched.geometry>0&&switched.material>0);assert.equal(switched.pages,0);assert.equal(switched.chunks,0);
 Object.assign(report,{baseline,far,near,draws,detailed,floor,replacement,switched,requests:requests.length});
 if(real){
  await page.evaluate(async({source,bounds})=>{const r=window.tourRuntime,s=structuredClone(r.active);s.collider=source;s.viewpoints[0].position=bounds.min.map((value,axis)=>(value+bounds.max[axis])/2);r.updateScene(s);await r.colliderTransition;r.showCollider(true);},{source:'saved-collision/'+real.file,bounds:real.manifest.bounds});
  const bounds=real.manifest.bounds,center=bounds.min.map((value,axis)=>(value+bounds.max[axis])/2),extent=Math.max(...bounds.max.map((value,axis)=>value-bounds.min[axis]));
  const shot=await page.evaluate(({center,extent})=>{const r=window.tourRuntime,p=r.pagedCollider;r.scene.updateMatrixWorld(true);const target=p.fromGeneration({x:center[0],y:center[1],z:center[2]}),position=target.clone().add(new r.rig.position.constructor().set(0,extent,extent));r.rig.position.copy(position);r.rig.rotation.set(0,0,0);r.camera.position.set(0,0,0);r.camera.lookAt(target);r.scene.updateMatrixWorld(true);p.updateOverview(r.camera,850);r.renderer.render(r.overlay,r.camera);return {pages:p.residentTiles,chunks:p.physicsChunks,triangles:p.physicsTriangles,camera:r.camera.getWorldPosition(new r.rig.position.constructor()).toArray(),target:target.toArray(),projectedTarget:target.clone().project(r.camera).toArray(),sourceTransform:p.manifest.sourceTransform,frame:p.group.matrixWorld.elements,url:p.url};},{center,extent});
  await page.screenshot({path:path.join(output,'saved-collider-overview.png')});report.saved={manifest:path.resolve(actualManifest),...shot};
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await fs.writeFile(path.join(output,'result.json'),JSON.stringify(report,null,2));console.log('PASS whole-scene guides, bounded one-draw distance LOD, zero visualization downloads/physics growth, nearby exact physics, saved-domain provenance, transforms, replacement and disposal. '+output);
}catch(error){if(page){await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({error:String(error),errors,requests,text:await page.locator('body').innerText().catch(()=>''),report},null,2));}throw error;}
finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
