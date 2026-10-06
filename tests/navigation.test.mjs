import test from 'node:test';import assert from 'node:assert/strict';
import {buildNavigation} from '../shared/navigation.mjs';
import {BoxGeometry} from 'three';
import {stick,xrMotion} from '../shared/xr-controls.mjs';
import {blankProject,newScene,validateProject} from '../shared/project.mjs';
import {deleteScene,deleteViewpoint} from '../shared/authoring.mjs';
test('walk routes go around a wall, reject disconnected destinations and dispose',async()=>{
 const vertices=[],indices=[];const box=(w,h,d,x,y,z)=>{const g=new BoxGeometry(w,h,d);g.translate(x,y,z);const offset=vertices.length/3;vertices.push(...g.attributes.position.array);indices.push(...Array.from(g.index.array,n=>n+offset));g.dispose();};
 box(14,.2,14,0,-.1,0);box(.3,3,6,0,1.5,0);box(3,.2,3,20,-.1,0);
 const nav=await buildNavigation(new Float32Array(vertices),new Uint32Array(indices));try{const route=nav.path({x:-3,y:0,z:0},{x:3,y:0,z:0});assert.ok(route.some(p=>Math.abs(p.z)>3),'Must detour around wall');assert.throws(()=>nav.path({x:-3,y:0,z:0},{x:20,y:0,z:0}),/route/);assert.throws(()=>nav.path({x:-3,y:0,z:0},{x:100,y:0,z:0}),/surface/);}finally{nav.dispose();}
});
test('Quest axes map to drone lift, turn and translation',()=>{assert.deepEqual(stick([0,0,0,.1]),[0,0]);const left={handedness:'left',gamepad:{axes:[0,0,1,-1]}},right={handedness:'right',gamepad:{axes:[0,0,-1,1]}};assert.deepEqual(xrMotion([left,right],'fly'),{turn:-1,lift:-1,strafe:1,forward:-1});assert.deepEqual(xrMotion([left,right],'fly',true),{turn:1,lift:1,strafe:-1,forward:1});assert.deepEqual(xrMotion([left,right],'jumps'),{turn:-1,lift:0,strafe:0,forward:0});});
test('deleting scenes and viewpoints repairs inbound navigation',()=>{const p=blankProject();p.scenes=[newScene('a','A','a.rad'),newScene('b','B','b.rad')];p.startScene='a';const a=p.scenes[0],b=p.scenes[1],first=a.entry;a.viewpoints.push({...a.viewpoints[0],id:'second'});b.hotspots.push({id:'link',label:'A',position:[0,0,0],kind:'scene',target:'a',viewpoint:first});deleteViewpoint(p,'a',first);assert.equal(a.entry,'second');assert.equal(b.hotspots[0].viewpoint,undefined);assert.deepEqual(validateProject(p),[]);deleteScene(p,'a');assert.equal(p.startScene,'b');assert.deepEqual(b.hotspots,[]);assert.deepEqual(validateProject(p),[]);});
