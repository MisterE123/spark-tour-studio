import {_electron as electron} from '@playwright/test';import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';import {radFixture} from '../tests/fixtures.mjs';import {boxWallPosition} from '../shared/box-walls.mjs';
const root=path.resolve('test-output','box faces '+Date.now()),folder=path.join(root,'project');await fs.mkdir(path.join(folder,'config'),{recursive:true});
const project=blankProject(),scene=newScene('a','Box handles','scene.rad');scene.viewpoints[0].position=[6,4,7];
scene.collisionAuthoring={scope:'selected',format:'paged',options:{},volumes:[{id:'box',type:'box',operation:'add',position:[0,1,0],rotation:[.1,.3,.1],size:[4,3,4]}]};project.scenes=[scene];project.startScene='a';
await fs.writeFile(path.join(folder,'scene.rad'),radFixture().rad);await fs.writeFile(path.join(folder,'config/tour.json'),JSON.stringify(project));await fs.writeFile(path.join(folder,'config/hosting.json'),'{}');
const app=await electron.launch({executablePath:path.resolve('release/win-unpacked/Spark Tour Studio.exe'),env:{...process.env,SPARK_TEST:'1',SPARK_TEST_PROFILE:path.join(root,'profile')},timeout:60000});
try{
 const page=await app.firstWindow();await page.waitForSelector('.studio');await page.goto(page.url()+'?diagnostics=1');
 await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({filePaths:[folder],canceled:false});},folder);
 await page.getByRole('button',{name:'File',exact:true}).click();await page.getByRole('menuitem',{name:'Open project',exact:true}).click();await page.waitForFunction(()=>window.tourRuntime?.ready);
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Generate collider',exact:true}).click();
 await page.getByRole('button',{name:'Frame selected shape',exact:true}).click();
 for(const mode of ['Move','Rotate','Scale']){
  await page.locator('.collision-gizmos').getByRole('button',{name:mode,exact:true}).click();
  const before=await page.evaluate(()=>window.tourRuntime.selectionRequest.volumes[0]);
  const screen=await page.evaluate(()=>{const r=window.tourRuntime;r.scene.updateMatrixWorld(true);const faces=r.collisionSelection.wallHandles();if(faces.length!==6)throw Error('Expected six face handles');const face=faces.find(face=>face.userData.collisionFace.axis===0&&face.userData.collisionFace.sign===1),rect=r.renderer.domElement.getBoundingClientRect(),from=face.getWorldPosition(r.rig.position.clone()),to=face.localToWorld(new (r.rig.position.constructor)(6,0,0));const a=from.project(r.camera),b=to.project(r.camera),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);return {x:rect.x+(a.x+1)*rect.width/2,y:rect.y+(1-a.y)*rect.height/2,dx:dx/length*45,dy:-dy/length*45};});
  await page.mouse.move(screen.x,screen.y);await page.mouse.down();await page.mouse.move(screen.x+screen.dx,screen.y+screen.dy,{steps:15});await page.mouse.up();
  await page.waitForTimeout(150);const after=await page.evaluate(()=>window.tourRuntime.selectionRequest.volumes[0]);
  assert.ok(Math.abs(after.size[0]-before.size[0])>.05,mode+' face drag changes size');
  const a=boxWallPosition(before,0,-1),b=boxWallPosition(after,0,-1);assert.ok(Math.hypot(...a.map((value,i)=>value-b[i]))<.001,mode+' keeps opposite face fixed');
 }
 await page.screenshot({path:path.join(root,'handles.png')});await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Project saved.',{exact:true}).waitFor();
 const saved=JSON.parse(await fs.readFile(path.join(folder,'config/tour.json'),'utf8'));assert.ok(Math.abs(saved.scenes[0].collisionAuthoring.volumes[0].size[0]-4)>.1);
 console.log('PASS: packaged Move/Rotate/Scale direct face drags and saved dimensions',root);
}finally{await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(win=>win.destroy())).catch(()=>{});await app.close();}
