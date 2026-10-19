import test from 'node:test';
import assert from 'node:assert/strict';
import {keyboardMotion,isJumpKey,lookRotation} from '../shared/navigation-input.mjs';
import {ViewNavigation} from '../shared/viewpoints.mjs';

test('flight altitude aliases agree and Shift descends without boosting speed',()=>{
 for(const key of ['Space','KeyE'])assert.equal(keyboardMotion(new Set([key]),'fly').lift,1);
 for(const key of ['ShiftLeft','ShiftRight','KeyQ'])assert.equal(keyboardMotion(new Set([key]),'fly').lift,-1);
 assert.equal(keyboardMotion(new Set(['Space','KeyE']),'fly').lift,1);
 assert.equal(keyboardMotion(new Set(['Space','KeyQ']),'fly').lift,0);
});
test('walk aliases crouch without flight and jump keys are explicit',()=>{
 for(const key of ['ShiftLeft','ShiftRight','KeyQ'])assert.deepEqual(keyboardMotion(new Set([key]),'explore'),{x:0,z:0,lift:0,crouch:true});
 for(const key of ['Space','KeyE']){assert.ok(isJumpKey(key));assert.equal(keyboardMotion(new Set([key]),'explore').lift,0);}
 assert.equal(isJumpKey('KeyQ'),false);
 for(const [key,arrow] of [['KeyW','ArrowUp'],['KeyA','ArrowLeft'],['KeyS','ArrowDown'],['KeyD','ArrowRight']])assert.deepEqual(keyboardMotion(new Set([key]),'explore'),keyboardMotion(new Set([arrow]),'explore'));
});
test('free drag grabs the scene, captured movement aims, both clamp pitch',()=>{
 assert.deepEqual(lookRotation(0,0,20,10,false),{yaw:.06,pitch:.03});
 assert.deepEqual(lookRotation(0,0,20,10,true),{yaw:-.06,pitch:-.03});
 assert.equal(lookRotation(0,0,0,10000,false).pitch,1.5);
 const view=new ViewNavigation({id:'view',name:'View',position:[0,1.7,3],rotation:[0,0,0]});
 const pose=view.drag(20,10);assert.deepEqual(pose.rotation,[.03,.06,0]);
 const orbit=new ViewNavigation({id:'orbit',name:'Orbit',position:[0,0,3],rotation:[0,0,0],type:'orbit',orbit:{center:[0,0,0],radius:3}});
 assert.ok(orbit.drag(20,0).position[0]<0,'orbit grab moves camera left so the scene follows right');
});
