import test from 'node:test';
import assert from 'node:assert/strict';
import {blankProject,newScene,ProjectSchema,validateProject} from '../shared/project.mjs';
import {applySceneImport,duplicateScene} from '../shared/authoring.mjs';
import {DEFAULT_STEP_HEIGHT,normalizeStepHeight} from '../shared/walking.mjs';

function project(){const p=blankProject();p.scenes=[newScene('north','North','north.rad'),newScene('south','South','south.rad')];p.startScene='north';return p;}

test('old projects retain optional step height and use the 1.75 ft default in meters',()=>{
 const p=ProjectSchema.parse(project());
 assert.equal(p.scenes[0].walkStepHeight,undefined);
 assert.equal(DEFAULT_STEP_HEIGHT,.5334);
 assert.equal(normalizeStepHeight(p.scenes[0].walkStepHeight),.5334);
 assert.deepEqual(validateProject(p),[]);
});

test('per-scene step heights retain exact values through project save and exported data parsing',()=>{
 for(const value of [0,.15,.5334,1]){
  const p=project();p.scenes[0].walkStepHeight=value;p.scenes[1].walkStepHeight=.35;
  const saved=JSON.stringify(ProjectSchema.parse(p)),reopened=ProjectSchema.parse(JSON.parse(saved));
  assert.equal(reopened.scenes[0].walkStepHeight,value);
  assert.equal(reopened.scenes[1].walkStepHeight,.35);
  assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(reopened))),reopened);
  assert.deepEqual(validateProject(reopened),[]);
 }
});

test('step height rejects non-finite, out-of-range and nonnumeric authored values',()=>{
 for(const value of [-.01,1.01,Infinity,-Infinity,NaN,'0.5',null]){
  const p=project();p.scenes[0].walkStepHeight=value;
  assert.equal(ProjectSchema.safeParse(p).success,false,String(value));
  assert.ok(validateProject(p).some(error=>error.includes('walkStepHeight')));
 }
});

test('scene duplication and PLY replacement preserve the authored step height',()=>{
 const p=project();p.scenes[0].walkStepHeight=.45;
 const copy=duplicateScene(p,'north','copy',()=> 'copied-start');assert.equal(copy.walkStepHeight,.45);
 const before=structuredClone(p.scenes[0]);
 const result=applySceneImport(p,{id:'replacement',state:'completed',name:'North',replaceSceneId:'north',expectedSource:'north.rad',result:newScene('replacement','Replacement','new.rad')});
 assert.equal(result.status,'replaced');before.source='new.rad';assert.deepEqual(p.scenes[0],before);
 assert.equal(ProjectSchema.parse(p).scenes[0].walkStepHeight,.45);
});
