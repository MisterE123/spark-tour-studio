import test from 'node:test';import assert from 'node:assert/strict';
import {guideSteps,guideStorageKey} from '../shared/onboarding.mjs';
import {glassVariables} from '../shared/appearance.mjs';
import {blankProject,newScene,ProjectSchema} from '../shared/project.mjs';

test('tour guide follows the available input and movement mode',()=>{
 for(const mode of ['jumps','fly','explore'])for(const touch of [false,true]){
  const steps=guideSteps(mode,touch);assert.equal(steps.length,7);assert.ok(steps.every(step=>step.title&&step.body&&step.icon));
  if(touch){assert.match(steps[1].body,/Tap/);assert.doesNotMatch(steps[1].body,/Mouse look/);}else assert.match(steps[1].body,/Escape/);
 }
 assert.match(guideSteps('fly')[2].body,/Space or E rises; Shift or Q descends/);
 assert.match(guideSteps('explore')[2].body,/Space or E jumps; Shift or Q crouches/);
 assert.match(guideSteps('fly',true)[2].body,/left pad/);
 assert.notEqual(guideStorageKey('Museum','/tour-a/'),guideStorageKey('Museum','/tour-b/'));
});

test('neutral glass shade survives project parsing and older tours retain the default',()=>{
 const p=blankProject();p.scenes=[newScene('a','Scene','scene.rad')];p.startScene='a';
 assert.equal(ProjectSchema.parse(p).appearance,undefined);assert.equal(glassVariables(undefined)['--glass-strong'],'rgba(0,0,0,0.26)');
 p.appearance={glassShade:.58};const saved=ProjectSchema.parse(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.appearance,{glassShade:.58});
 assert.equal(glassVariables(saved.appearance)['--glass-strong'],'rgba(0,0,0,0.58)');assert.equal(glassVariables({glassShade:0})['--glass-strong'],'rgba(0,0,0,0)');
 for(const glassShade of [-1,1.01,NaN,Infinity])assert.equal(ProjectSchema.safeParse({...p,appearance:{glassShade}}).success,false);
});
