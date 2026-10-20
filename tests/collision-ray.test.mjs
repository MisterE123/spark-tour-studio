import test from 'node:test';import assert from 'node:assert/strict';
import {raycastCollision} from '../shared/collision-ray.mjs';
function fixture(){
 const loaded=new Set(),requests=[],entries=new Map(['0,0,0','1,0,0','2,0,0'].map(key=>[key,{key}]));
 return {manifest:{detail:1,tileCells:4},entries,requests,load:async entry=>{loaded.add(entry.key);requests.push(entry.key);},hasCell:cell=>loaded.has(cell.map(v=>Math.floor(v/4)).join(','))&&cell[0]>=0&&cell[0]<11&&cell[1]>=0&&cell[1]<4&&cell[2]>=0&&cell[2]<4};
}
test('click rays cross cold page seams and hit the actual collision boundary',async()=>{
 const stream=fixture(),hit=await raycastCollision(stream,[1,1,1],[1,0,0]);
 assert.deepEqual(hit.point,[11,1,1]);assert.deepEqual(hit.normal,[-1,0,0]);assert.equal(hit.distance,10);assert.deepEqual(stream.requests,['0,0,0','1,0,0','2,0,0']);
 const floor=await raycastCollision(fixture(),[1,2,1],[1,-.3,0]);assert.ok(Math.abs(floor.point[0]-(1+2/.3))<1e-8);assert.ok(Math.abs(floor.point[1])<1e-8);assert.deepEqual(floor.normal,[0,1,0]);
});
test('ray bounds, exact edges, cancellation and failed pages stay closed',async()=>{
 assert.equal(await raycastCollision(fixture(),[1,1,1],[1,0,0],{maxDistance:3}),null);
 assert.equal(await raycastCollision(fixture(),[1,1,1],[1,0,0],{maxPages:1}),null);
 assert.equal(await raycastCollision(fixture(),[1,1,1],[0,0,0]),null);
 const edge=await raycastCollision(fixture(),[4,1,1],[-1,0,0]);assert.deepEqual(edge.point,[0,1,1]);
 const cancelled=fixture();let current=true;cancelled.load=async()=>{current=false;};assert.equal(await raycastCollision(cancelled,[1,1,1],[1,0,0],{isCurrent:()=>current}),null);assert.deepEqual(cancelled.requests,[]);
 const failed=fixture();failed.load=async()=>{throw Error('503');};await assert.rejects(raycastCollision(failed,[1,1,1],[1,0,0]),/503/);
});
