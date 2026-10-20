import test from 'node:test';import assert from 'node:assert/strict';import {bubbleAppearance,bubbleFadeDistance,bubbleLabel,bubbleVisibility,bubbleOcclusionLimit,pathYaw,resolveBubbleSettings} from '../shared/bubbles.mjs';import {blankProject,newScene,ProjectSchema} from '../shared/project.mjs';
test('bubble preferences and overrides survive project serialization, with old-project defaults',()=>{const p=blankProject(),s=newScene('a','A','a.rad');p.scenes=[s];p.startScene='a';s.hotspots=[{id:'info',label:'Info',position:[0,1,0],kind:'page',target:'content',size:1.5}];p.bubbles={translucency:.7,size:1.4,distanceFade:.8};const saved=ProjectSchema.parse(JSON.parse(JSON.stringify(p)));assert.deepEqual(saved.bubbles,p.bubbles);assert.equal(saved.scenes[0].hotspots[0].size,1.5);delete p.bubbles;delete s.hotspots[0].size;assert.equal(ProjectSchema.parse(p).bubbles,undefined);assert.equal(bubbleAppearance().size,1);for(const bad of [-1,NaN,Infinity,5]){s.hotspots[0].size=bad;assert.equal(ProjectSchema.safeParse(p).success,false);}delete s.hotspots[0].size;p.bubbles={translucency:2};assert.equal(ProjectSchema.safeParse(p).success,false);});
test('base translucency controls glass independently of whole-bubble fading and size',()=>{assert.equal(bubbleAppearance({size:1.4},0).size,1.4);assert.equal(bubbleAppearance({size:1.4},1).size,2.8);const settings={translucency:.75,distanceFade:.8,size:1},near=bubbleAppearance(settings,0,1),far=bubbleAppearance(settings,0,100);assert.equal(near.glassOpacity,.25);assert.equal(far.glassOpacity,.25);assert.equal(near.visibility,1);assert.equal(far.visibility,0);assert.equal(far.size,near.size);assert.equal(bubbleAppearance({translucency:1},0,4).glassOpacity,0);assert.equal(bubbleAppearance({translucency:0},0,4).glassOpacity,1);});
test('distance fade is strong across the slider and has bounded full/hidden ranges',()=>{assert.equal(bubbleFadeDistance(0),Infinity);assert.equal(bubbleFadeDistance(.25),38.375);assert.equal(bubbleFadeDistance(.5),17);assert.equal(bubbleFadeDistance(.75),9.125);assert.equal(bubbleFadeDistance(1),8);for(const strength of [.25,.5,.75,1]){const end=bubbleFadeDistance(strength);assert.equal(bubbleVisibility(strength,0),1);assert.equal(bubbleVisibility(strength,2),1);assert.equal(bubbleVisibility(strength,(2+end)/2),.5);assert.equal(bubbleVisibility(strength,end),0);assert.equal(bubbleVisibility(strength,end+1),0);let previous=1;for(let distance=2;distance<=end;distance+=.1){const visibility=bubbleVisibility(strength,distance);assert.ok(visibility<=previous);previous=visibility;}}for(const distance of [0,1,100,100000])assert.equal(bubbleVisibility(0,distance),1);assert.ok(bubbleVisibility(1,5)<bubbleVisibility(.5,5));});
test('hidden bubbles do not intercept clicks and the selected editor bubble can be revealed',()=>{assert.equal(bubbleAppearance({distanceFade:1},0,7).interactive,true);const fading=bubbleAppearance({distanceFade:1},0,7.3);assert.ok(fading.visibility>0&&fading.visibility<.05);assert.equal(fading.interactive,false);assert.equal(bubbleAppearance({distanceFade:1},0,30).interactive,false);const selected=bubbleAppearance({distanceFade:1},0,30,true);assert.equal(selected.visibility,1);assert.equal(selected.interactive,true);});
test('occlusion leaves forgiving room for rough host surfaces and persists the author setting',()=>{assert.equal(bubbleOcclusionLimit(.2),0);assert.equal(bubbleOcclusionLimit(.5),0);assert.equal(bubbleOcclusionLimit(3),2.35);assert.equal(bubbleOcclusionLimit(100),97.5);const p=blankProject();p.bubbles={occlusion:false};assert.equal(ProjectSchema.parse(p).bubbles.occlusion,false);p.bubbles={occlusion:'true'};assert.equal(ProjectSchema.safeParse(p).success,false);});
test('scene and view bubble labels follow current destination names without overwriting information titles',()=>{const project=blankProject(),scene=newScene('north','North','north.rad');project.scenes=[scene];scene.viewpoints[0].name='Start';const sceneBubble={kind:'scene',target:scene.id,label:'Legacy scene label'},viewBubble={kind:'viewpoint',target:'start',label:'Legacy view label'},infoBubble={kind:'page',target:'content',label:'Elizabeth Wilkins Rowe'};assert.equal(bubbleLabel(sceneBubble,project,scene),'Go to Scene: North');assert.equal(bubbleLabel(viewBubble,project,scene),'Go to View: Start');scene.name='South';scene.viewpoints[0].name='Entrance';assert.equal(bubbleLabel(sceneBubble,project,scene),'Go to Scene: South');assert.equal(bubbleLabel(viewBubble,project,scene),'Go to View: Entrance');assert.equal(bubbleLabel(infoBubble,project,scene),infoBubble.label);assert.equal(bubbleLabel({...sceneBubble,target:'missing'},project,scene),'Go to Scene: Select a scene');assert.equal(sceneBubble.label,'Legacy scene label');});
test('path facing smoothly follows travel and turns the short way across the yaw seam',()=>{let yaw=0;for(let i=0;i<60;i++)yaw=pathYaw(yaw,1,0,1/60);assert.ok(Math.abs(yaw+Math.PI/2)<.02);const seam=pathYaw(Math.PI-.01,-.01,1,.02);assert.ok(seam>Math.PI-.01&&seam<Math.PI+.01);assert.equal(pathYaw(1,1,0,0),1);});

test('tour defaults and per-scene meter distances survive saving without changing source defaults',()=>{
 const project=blankProject(),room=newScene('room','Room','room.rad'),aerial=newScene('aerial','Overview','aerial.rad');
 project.scenes=[room,aerial];project.startScene='room';project.bubbles={fadeDistance:25,size:1.2,translucency:.8,occlusion:true};
 aerial.bubbles={fadeDistanceMultiplier:40,sizeMultiplier:.75,occlusion:false,translucency:.9};
 const saved=ProjectSchema.parse(JSON.parse(JSON.stringify(project))),defaults=resolveBubbleSettings(saved),near=resolveBubbleSettings(saved,saved.scenes[0]),far=resolveBubbleSettings(saved,saved.scenes[1]);
 assert.deepEqual(near,defaults);assert.equal(near.fadeDistance,25);assert.equal(far.fadeDistance,1000);assert.equal(far.fadeStartDistance,200);assert.ok(Math.abs(far.size-.9)<1e-9);assert.equal(far.occlusion,false);assert.equal(far.translucency,.9);
 assert.equal(bubbleAppearance(far,0,200).visibility,1);assert.equal(bubbleAppearance(far,0,600).visibility,.5);assert.equal(bubbleAppearance(far,0,1000).visibility,0);assert.equal(bubbleAppearance(near,0,200).visibility,0);
 assert.deepEqual(project.bubbles,{fadeDistance:25,size:1.2,translucency:.8,occlusion:true});assert.deepEqual(saved.scenes[1].bubbles,aerial.bubbles);
});

test('legacy project strength fading retains its curve until explicitly edited',()=>{
 for(const strength of [0,.25,.5,.8,1]){
  const project={bubbles:{distanceFade:strength}},settings=resolveBubbleSettings(project),scaled=resolveBubbleSettings(project,{bubbles:{fadeDistanceMultiplier:50}});
  assert.equal(settings.fadeDistance,strength===0?null:bubbleFadeDistance(strength));
  for(const distance of [0,1,2,5,10,50,100]){
   assert.equal(bubbleAppearance(settings,0,distance).visibility,bubbleVisibility(strength,distance));
   assert.ok(Math.abs(bubbleAppearance(scaled,0,distance*50).visibility-bubbleVisibility(strength,distance))<1e-12);
  }
 }
});

test('scene fade overrides, unlimited visibility and reset have unambiguous inheritance',()=>{
 const project={bubbles:{distanceFade:1,fadeDistance:20}},scene={bubbles:{fadeDistance:700,fadeDistanceMultiplier:100}};
 assert.equal(resolveBubbleSettings(project,scene).fadeDistance,700);
 scene.bubbles.fadeDistance=null;assert.equal(resolveBubbleSettings(project,scene).fadeDistance,null);assert.equal(bubbleAppearance(resolveBubbleSettings(project,scene),0,1000000).visibility,1);
 delete scene.bubbles.fadeDistance;assert.equal(resolveBubbleSettings(project,scene).fadeDistance,2000);
 delete scene.bubbles;assert.equal(resolveBubbleSettings(project,scene).fadeDistance,20);
 project.bubbles.fadeDistance=null;assert.equal(resolveBubbleSettings(project,{bubbles:{fadeDistanceMultiplier:100}}).fadeDistance,null);
 assert.equal(resolveBubbleSettings(project,{bubbles:{fadeDistance:100}}).fadeDistance,100);
 assert.equal(bubbleAppearance(resolveBubbleSettings(project,{bubbles:{fadeDistance:100}}),0,100,true).interactive,true);
 assert.equal(bubbleAppearance(resolveBubbleSettings(project,{bubbles:{fadeDistance:100}}),0,100).interactive,false);
});

test('bubble meter distances reject malformed data and are independent of scene and VR scale',()=>{
 const project=blankProject(),scene=newScene('aerial','Overview','aerial.rad');project.scenes=[scene];project.startScene=scene.id;
 project.bubbles={fadeDistance:100};scene.bubbles={fadeDistanceMultiplier:10};const before=resolveBubbleSettings(project,scene);
 scene.transform.scale=100;scene.vrScale=.01;scene.viewpoints[0].vrScale=4;assert.deepEqual(resolveBubbleSettings(project,scene),before);
 for(const value of [0,-1,Infinity,NaN,1000001,'100']){project.bubbles.fadeDistance=value;assert.equal(ProjectSchema.safeParse(project).success,false,String(value));}
 project.bubbles.fadeDistance=null;assert.equal(ProjectSchema.safeParse(project).success,true);
 for(const field of ['fadeDistanceMultiplier','sizeMultiplier'])for(const value of [0,-1,Infinity,NaN,'5']){scene.bubbles={[field]:value};assert.equal(ProjectSchema.safeParse(project).success,false,field+String(value));}
 scene.bubbles={fadeDistance:500,fadeDistanceMultiplier:20,sizeMultiplier:.05,occlusion:false};assert.equal(ProjectSchema.safeParse(project).success,true);
});
