import test from 'node:test';import assert from 'node:assert/strict';
import {blankProject,newScene,ProjectSchema} from '../shared/project.mjs';
import {walkingSettings,DEFAULT_WALK_HEIGHT,DEFAULT_WALK_STEP_HEIGHT} from '../shared/navigation-settings.mjs';
import {DEFAULT_STEP_HEIGHT} from '../shared/walking.mjs';

test('walking defaults inherit project values while preserving explicit legacy scene settings',()=>{
 assert.deepEqual(walkingSettings(),{height:1.7,stepHeight:.5334});assert.equal(DEFAULT_WALK_STEP_HEIGHT,DEFAULT_STEP_HEIGHT);assert.equal(DEFAULT_WALK_HEIGHT,1.7);
 const project=blankProject(),scene=newScene('room','Room','room.rad');project.scenes=[scene];project.startScene=scene.id;project.navigation={baseSpeed:4,walkHeight:1.85,walkStepHeight:.25};
 const saved=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));assert.deepEqual(walkingSettings(saved,saved.scenes[0]),{height:1.85,stepHeight:.25});assert.equal(saved.scenes[0].walkHeight,undefined);assert.equal(saved.scenes[0].walkStepHeight,undefined);
 scene.walkHeight=1.35;scene.walkStepHeight=0;assert.deepEqual(walkingSettings(project,scene),{height:1.35,stepHeight:0});project.navigation.walkHeight=2;project.navigation.walkStepHeight=.6;assert.deepEqual(walkingSettings(project,scene),{height:1.35,stepHeight:0});
 delete scene.walkHeight;delete scene.walkStepHeight;assert.deepEqual(walkingSettings(project,scene),{height:2,stepHeight:.6});delete project.navigation;assert.deepEqual(walkingSettings(project,scene),{height:1.7,stepHeight:.5334});
});

test('walking default units are independent of scene size and validate before use',()=>{
 const project=blankProject(),scene=newScene('aerial','Overview','aerial.rad');project.scenes=[scene];project.startScene=scene.id;project.navigation={baseSpeed:2,walkHeight:1.8,walkStepHeight:.3};scene.transform.scale=50;scene.vrScale=10;
 assert.deepEqual(walkingSettings(project,scene),{height:1.8,stepHeight:.3});
 for(const [key,values]of [['walkHeight',[0,.99,2.41,Infinity,NaN,'1.7']],['walkStepHeight',[-1,1.1,Infinity,NaN,'0.5']]])for(const value of values){const invalid=structuredClone(project);invalid.navigation[key]=value;assert.equal(ProjectSchema.safeParse(invalid).success,false,key+' '+value);}
 project.navigation.walkStepHeight=0;assert.equal(ProjectSchema.safeParse(project).success,true);
});
