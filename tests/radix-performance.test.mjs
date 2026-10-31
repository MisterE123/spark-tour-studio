import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {z} from 'zod';
import {RadixPerformanceSettingsSchema,SceneRadixPerformanceSettingsSchema,radixPerformanceSettings,radixRenderSettings,radixAdaptiveXrEntryScale} from '../shared/radix-performance.mjs';
import {PerformanceSettingsSchema,PerformancePresetSchema,ScenePerformanceSettingsSchema,ViewpointPerformanceSettingsSchema,defaultPerformance,presetFile,tourPerformanceSettings,scenePerformanceSettings,viewpointPerformanceSettings} from '../shared/performance.mjs';
import {blankProject,newScene,ProjectSchema} from '../shared/project.mjs';

test('Radix defaults resolve without injecting renderer metadata into legacy projects',()=>{
 const project=blankProject();project.performance=defaultPerformance();
 const before=structuredClone(project),settings=tourPerformanceSettings(project.performance);
 assert.equal(Object.hasOwn(settings,'radix'),false);
 const radix=radixPerformanceSettings(settings);
 assert.equal(radix.method,'ewa');assert.equal(radix.sortMode,'auto');assert.equal(radix.sortBits,24);
 assert.equal(radix.selectedSplatBudget,4000000);assert.equal(radix.residentSplatBudget,16000000);
 assert.equal(radix.lodBudgetMode,'limit');assert.equal(radix.lodUnderfill,5);
 assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(project))),before);
 assert.equal(Object.hasOwn(PerformanceSettingsSchema.parse({}),'radix'),false);
});

test('Radix namespace survives project and named preset exchange while preserving Spark values',()=>{
 const legacy={...defaultPerformance().presets[0].settings,pagedExtSplats:true,lodSplatScale:1.6,lodRenderScale:2,coneFoveate:.6};
 const file=presetFile({name:'Headset Radix',settings:{...legacy,pixelRatio:1,maxSh:1,radix:{sortMode:'cpu',sortBits:16,selectedSplatBudget:2000000,residentSplatBudget:8000000,lodBaseDistance:7}}});
 assert.equal(file.format,'spark-tour-performance-preset');assert.equal(file.version,1);
 const exchanged=PerformancePresetSchema.parse(JSON.parse(JSON.stringify(file)));
 assert.equal(exchanged.settings.radix.lodBaseDistance,7);assert.equal(exchanged.settings.radix.lodMultiplier,3);
 for(const key of ['pagedExtSplats','lodSplatScale','lodRenderScale','coneFoveate'])assert.equal(exchanged.settings[key],legacy[key]);
 const project={...blankProject(),performance:{defaultPresetId:'headset',presets:[{id:'headset',name:file.name,settings:file.settings}]}};
 assert.deepEqual(ProjectSchema.parse(JSON.parse(JSON.stringify(project))).performance,project.performance);
 const draft={...file.settings,radix:{...file.settings.radix,selectedSplatBudget:3000000}};
 project.performance.defaultSettings=draft;
 assert.deepEqual(tourPerformanceSettings(ProjectSchema.parse(project).performance),draft);
 assert.equal(project.performance.presets[0].settings.radix.selectedSplatBudget,2000000);
});

test('Radix rejects unsupported settings, invalid ranges and incoherent budgets',()=>{
 for(const value of [{method:'spark'},{sortBits:20},{sortBits:24.5},{sortMode:'fast'},{selectedSplatBudget:Infinity},{residentSplatBudget:NaN},{selectedSplatBudget:0},{selectedSplatBudget:4000000,residentSplatBudget:3000000},{lodRangeMin:4,lodRangeMax:2},{lodMultiplier:1},{lodUnderfill:2.5},{xrResolutionScale:0},{autoSortAngle:-1},{maxSh:3},{pagedExtSplats:true}])assert.equal(RadixPerformanceSettingsSchema.safeParse(value).success,false,JSON.stringify(value));
 const valid=defaultPerformance().presets[0].settings;
 assert.equal(PerformanceSettingsSchema.safeParse({...valid,radix:null}).success,false);
 assert.equal(PerformanceSettingsSchema.safeParse({...valid,radix:{unknown:true}}).success,false);
 for(const radix of [null,false,0,''])assert.throws(()=>radixPerformanceSettings({radix}));
 assert.equal(RadixPerformanceSettingsSchema.safeParse({lodMultiplier:1.1}).success,false);assert.equal(RadixPerformanceSettingsSchema.safeParse({lodMultiplier:1.2}).success,true);
 assert.equal(PerformanceSettingsSchema.safeParse({...valid,radix:{lodRangeMin:3,lodRangeMax:3,selectedSplatBudget:50000,residentSplatBudget:50000}}).success,true);
});

test('backend mapping shares supported rendering values without reinterpreting Spark tuning',()=>{
 const settings=PerformanceSettingsSchema.parse({pixelRatio:1.2,maxSh:2,minAlpha:.004,maxStdDev:2.5,minPixelRadius:.2,maxPixelRadius:768,lodSplatCount:7000000,lodSplatScale:1.8,pagedExtSplats:true,radix:{method:'3dgut',selectedSplatBudget:6000000,residentSplatBudget:18000000,autoSortAngle:6}});
 const result=radixRenderSettings(settings);
 assert.equal(result.maxShDegree,2);assert.equal(result.pixelRatio,1.2);assert.equal(result.minAlpha,.004);assert.equal(result.maxStdDev,2.5);assert.equal(result.minPixelRadius,.2);assert.equal(result.maxPixelRadius,768);
 assert.equal(result.method,'3dgut');assert.equal(result.selectedSplatBudget,6000000);assert.equal(result.autoSortAngle,6);
 for(const key of ['radix','maxSh','pagedExtSplats','lodSplatScale','lodSplatCount','sortRadial','coneFoveate','xrFoveation','adaptiveDetail'])assert.equal(Object.hasOwn(result,key),false,key+' is not a Radix backend setting');
});

test('automatic detail changes only effective selection and never saved settings or residency',()=>{
 const settings=PerformanceSettingsSchema.parse({radix:{selectedSplatBudget:6000000,residentSplatBudget:18000000}}),before=structuredClone(settings);
 assert.equal(radixRenderSettings(settings,.25).selectedSplatBudget,1500000);
 assert.equal(radixRenderSettings(settings,.25).residentSplatBudget,18000000);
 assert.equal(radixRenderSettings(settings,Number.MIN_VALUE).selectedSplatBudget,1);
 assert.deepEqual(settings,before);
 for(const scale of [0,-1,1.01,Infinity,NaN])assert.throws(()=>radixRenderSettings(settings,scale),/Automatic detail scale/);
});

test('automatic immersive entry starts below a desktop-sized ceiling without changing authored presets',()=>{
 for(const budget of [50000,750000,4000000,5000000,32000000]){
  const settings=PerformanceSettingsSchema.parse({adaptiveDetail:true,radix:{selectedSplatBudget:budget,residentSplatBudget:Math.max(budget,16000000)}}),before=structuredClone(settings),scale=radixAdaptiveXrEntryScale(settings),effective=radixRenderSettings(settings,scale);
  assert.equal(effective.selectedSplatBudget,Math.min(budget,750000));assert.equal(effective.residentSplatBudget,settings.radix.residentSplatBudget);assert.deepEqual(settings,before);
  assert.equal(radixAdaptiveXrEntryScale({...settings,adaptiveDetail:false}),1,'opting out retains the authored entry request');
 }
 assert.equal(radixAdaptiveXrEntryScale(undefined),1);assert.equal(radixAdaptiveXrEntryScale({}),1);
 assert.equal(radixRenderSettings({adaptiveDetail:true},radixAdaptiveXrEntryScale({adaptiveDetail:true})).selectedSplatBudget,750000,'legacy presets use resolved Radix defaults without injecting metadata');
});

test('published Radix schema and example agree with runtime validation',async()=>{
 const schema=JSON.parse(await fs.readFile(new URL('../specs/performance/radix.schema.json',import.meta.url),'utf8'));
 const expected=z.toJSONSchema(RadixPerformanceSettingsSchema,{io:'input'});
 assert.deepEqual(schema.properties,expected.properties);assert.equal(schema.additionalProperties,false);
 const preset=JSON.parse(await fs.readFile(new URL('../specs/performance/preset.schema.json',import.meta.url),'utf8'));
 assert.equal(preset.properties.settings.properties.radix.$ref,'radix.schema.json');
 const example=JSON.parse(await fs.readFile(new URL('../specs/performance/radix-balanced.performance.json',import.meta.url),'utf8'));
 assert.deepEqual(PerformancePresetSchema.parse(example),example);
 assert.deepEqual(example.settings.radix,RadixPerformanceSettingsSchema.parse({}));
});

test('scene detail overrides remain sparse across project/save/export JSON round trips',()=>{
 const project=blankProject();project.scenes=[newScene('room','Room','room/lod-meta.json'),newScene('aerial','Aerial','aerial/lod-meta.json')];project.startScene='room';project.performance=defaultPerformance();
 project.scenes[1].performance={radix:{lodBaseDistance:180,lodMultiplier:2.5,lodRangeMax:5,lodUpdateDistance:3,lodBudgetMode:'target'}};
 const before=structuredClone(project),parsed=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(parsed,before);assert.equal(Object.hasOwn(parsed.scenes[0],'performance'),false);
 assert.deepEqual(SceneRadixPerformanceSettingsSchema.parse({}),{});assert.deepEqual(ScenePerformanceSettingsSchema.parse({radix:{}}),{radix:{}});
 const settings=tourPerformanceSettings(parsed.performance),room=scenePerformanceSettings(settings,parsed.scenes[0]),aerial=scenePerformanceSettings(settings,parsed.scenes[1]);
 assert.equal(Object.hasOwn(room,'radix'),false);assert.equal(radixRenderSettings(room).lodBaseDistance,5);assert.equal(radixRenderSettings(aerial).lodBaseDistance,180);assert.equal(aerial.radix.lodMultiplier,2.5);assert.equal(aerial.radix.lodBudgetMode,'target');
 assert.deepEqual(project,before,'resolving may not inject defaults into saved scene or named preset data');
});

test('scene inheritance follows tour and visitor changes without leaking overrides to another scene',()=>{
 const scene={performance:{radix:{lodBaseDistance:200,lodBehindPenalty:4,autoSortDistance:.2}}};
 const tour=PerformanceSettingsSchema.parse({pixelRatio:1,maxSh:1,radix:{selectedSplatBudget:2000000,residentSplatBudget:8000000,lodBaseDistance:8,lodMultiplier:2}}),before=structuredClone({tour,scene});
 let effective=scenePerformanceSettings(tour,scene);assert.equal(effective.radix.lodBaseDistance,200);assert.equal(effective.radix.lodMultiplier,2);assert.equal(effective.radix.lodBehindPenalty,4);assert.equal(effective.radix.autoSortDistance,.2);
 assert.equal(effective.pixelRatio,1);assert.equal(effective.maxSh,1);assert.equal(effective.radix.selectedSplatBudget,2000000);assert.equal(effective.radix.residentSplatBudget,8000000);
 const visitor=PerformanceSettingsSchema.parse({...tour,pixelRatio:.75,radix:{...tour.radix,lodMultiplier:4,selectedSplatBudget:1000000}});
 effective=scenePerformanceSettings(visitor,scene);assert.equal(effective.radix.lodBaseDistance,200);assert.equal(effective.radix.lodMultiplier,4);assert.equal(effective.radix.selectedSplatBudget,1000000);assert.equal(effective.pixelRatio,.75);
 assert.equal(scenePerformanceSettings(visitor,{performance:{radix:{lodBaseDistance:2}}}).radix.lodBaseDistance,2);
 assert.deepEqual(scenePerformanceSettings(visitor,{}),visitor);assert.deepEqual(scenePerformanceSettings(visitor,{performance:{radix:{}}}),visitor);
 assert.deepEqual(scenePerformanceSettings(visitor,{performance:{radix:{lodBaseDistance:undefined}}}),visitor,'an optional undefined value inherits instead of resetting to the renderer default');
 assert.deepEqual({tour,scene},before);assert.equal(radixRenderSettings(effective,.5).selectedSplatBudget,500000);
});

test('partial LoD endpoint overrides stay valid when tour preset endpoints change',()=>{
 const defaults=PerformanceSettingsSchema.parse({radix:{lodRangeMin:3,lodRangeMax:7}});
 const high=scenePerformanceSettings(defaults,{performance:{radix:{lodRangeMin:9}}}),low=scenePerformanceSettings(defaults,{performance:{radix:{lodRangeMax:1}}});
 assert.deepEqual([high.radix.lodRangeMin,high.radix.lodRangeMax],[9,9]);assert.deepEqual([low.radix.lodRangeMin,low.radix.lodRangeMax],[1,1]);
 assert.deepEqual(defaults.radix,radixPerformanceSettings({radix:{lodRangeMin:3,lodRangeMax:7}}));
 assert.equal(SceneRadixPerformanceSettingsSchema.safeParse({lodRangeMin:5,lodRangeMax:2}).success,false);
});

test('scene policy rejects device/backend overrides, unknown data and invalid physical values',()=>{
 for(const value of [{pixelRatio:1},{maxSh:0},{selectedSplatBudget:1000000},{residentSplatBudget:4000000},{sortMode:'gpu'},{method:'ewa'},{xrResolutionScale:.5},{lodBaseDistance:0},{lodBaseDistance:Infinity},{lodMultiplier:1},{lodUnderfill:1.5},{lodUpdateDistance:-1},{lodBudgetMode:'fast'},{autoSortAngle:91}]){
  assert.equal(SceneRadixPerformanceSettingsSchema.safeParse(value).success,false,JSON.stringify(value));
  const project=blankProject();project.scenes=[{...newScene('one','One','one.sog'),performance:{radix:value}}];assert.equal(ProjectSchema.safeParse(project).success,false);
 }
 for(const value of [{spark:{}},{unknown:true},{radix:null}])assert.equal(ScenePerformanceSettingsSchema.safeParse(value).success,false);
});

test('published sparse scene-performance schema matches runtime validation without inherited defaults',async()=>{
 const schema=JSON.parse(await fs.readFile(new URL('../specs/performance/scene.schema.json',import.meta.url),'utf8'));
 assert.deepEqual(schema,z.toJSONSchema(ScenePerformanceSettingsSchema,{io:'input'}));
 assert.equal(JSON.stringify(schema).includes('"default"'),false,'scene omission means inheritance, never a copied default');
});

test('viewpoint policies inherit scene then tour values without leaking into other views',()=>{
 const base=PerformanceSettingsSchema.parse({pixelRatio:1,radix:{lodBaseDistance:8,lodMultiplier:2,lodBehindPenalty:2,selectedSplatBudget:2000000,residentSplatBudget:4000000}}),scene={performance:{radix:{lodBaseDistance:200,lodBehindPenalty:4}}},view={performance:{radix:{lodBaseDistance:25,lodMultiplier:1.5}}},before=structuredClone({base,scene,view});
 const effective=viewpointPerformanceSettings(base,scene,view);assert.equal(effective.radix.lodBaseDistance,25);assert.equal(effective.radix.lodMultiplier,1.5);assert.equal(effective.radix.lodBehindPenalty,4);assert.equal(effective.radix.selectedSplatBudget,2000000);assert.equal(effective.pixelRatio,1);
 assert.deepEqual(viewpointPerformanceSettings(base,scene,{}),scenePerformanceSettings(base,scene));assert.deepEqual(viewpointPerformanceSettings(base,{},{}),base);assert.deepEqual(viewpointPerformanceSettings(base,scene,undefined),scenePerformanceSettings(base,scene));
 const visitor=PerformanceSettingsSchema.parse({...base,radix:{...base.radix,selectedSplatBudget:1000000,lodBaseDistance:3}});assert.equal(viewpointPerformanceSettings(visitor,scene,view).radix.selectedSplatBudget,1000000);assert.equal(viewpointPerformanceSettings(visitor,scene,view).radix.lodBaseDistance,25);assert.deepEqual({base,scene,view},before);
});
test('one-sided viewpoint level endpoints constrain the inherited scene interval independently',()=>{
 const base=PerformanceSettingsSchema.parse({}),scene={performance:{radix:{lodRangeMin:4,lodRangeMax:10}}};
 const lower=viewpointPerformanceSettings(base,scene,{performance:{radix:{lodRangeMax:2}}}),higher=viewpointPerformanceSettings(base,scene,{performance:{radix:{lodRangeMin:12}}});
 assert.deepEqual([lower.radix.lodRangeMin,lower.radix.lodRangeMax],[2,2]);assert.deepEqual([higher.radix.lodRangeMin,higher.radix.lodRangeMax],[12,12]);
 assert.deepEqual(scene.performance,{radix:{lodRangeMin:4,lodRangeMax:10}});
});
test('viewpoint overrides survive project JSON without inherited metadata and reject device settings',async()=>{
 const scene=newScene('aerial','Aerial','aerial/lod-meta.json');scene.performance={radix:{lodBaseDistance:200}};scene.viewpoints.push({...structuredClone(scene.viewpoints[0]),id:'detail',name:'Detail',performance:{radix:{lodBaseDistance:25,lodBudgetMode:'target'}}});
 const project={...blankProject(),startScene:'aerial',scenes:[scene]},parsed=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));assert.deepEqual(parsed,project);assert.equal(Object.hasOwn(parsed.scenes[0].viewpoints[0],'performance'),false);
 for(const radix of [{residentSplatBudget:4000000},{selectedSplatBudget:1000000},{sortMode:'gpu'},{xrResolutionScale:.5},{lodBaseDistance:0},{lodRangeMin:4,lodRangeMax:2}]){const invalid=structuredClone(project);invalid.scenes[0].viewpoints[1].performance={radix};assert.equal(ProjectSchema.safeParse(invalid).success,false);}
 const schema=JSON.parse(await fs.readFile(new URL('../specs/performance/viewpoint.schema.json',import.meta.url),'utf8'));assert.deepEqual(schema,z.toJSONSchema(ViewpointPerformanceSettingsSchema,{io:'input'}));assert.equal(JSON.stringify(schema).includes('"default"'),false);
});
