import test from 'node:test';import assert from 'node:assert/strict';
import {blankProject,newScene} from '../shared/project.mjs';
import {addContentBubble,duplicateBubble,duplicateScene} from '../shared/authoring.mjs';
test('duplicating bubbles isolates content and records creation time',()=>{
 const p=blankProject();p.scenes=[newScene('a','A','scene.rad')];addContentBubble(p,'a','b',[1,2,3]);
 const original=p.pages[0];const copy=duplicateBubble(p,'a','b','c');assert.notEqual(copy.target,original.id);assert.ok(copy.createdAt>0);
 p.pages.find(page=>page.id===copy.target).blocks[0].text='Copy only';assert.notEqual(original.blocks[0].text,'Copy only');
});
test('duplicating a scene remaps internal destinations and preserves asset references',()=>{
 const p=blankProject(),scene=newScene('a','A','asset.rad');p.scenes=[scene];addContentBubble(p,'a','info',[0,0,0]);
 scene.hotspots.push({id:'v',kind:'viewpoint',target:scene.entry,label:'legacy',position:[0,0,0]},{id:'self',kind:'scene',target:'a',viewpoint:scene.entry,label:'legacy',position:[0,0,0]});
 let n=0;const clone=duplicateScene(p,'a','new',()=>`id-${++n}`);
 assert.equal(clone.source,'asset.rad');assert.notEqual(clone.entry,scene.entry);assert.equal(clone.hotspots[1].target,clone.entry);assert.equal(clone.hotspots[2].target,'new');assert.equal(clone.hotspots[2].viewpoint,clone.entry);assert.notEqual(clone.hotspots[0].target,scene.hotspots[0].target);
});
