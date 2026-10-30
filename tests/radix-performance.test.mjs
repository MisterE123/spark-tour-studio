import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {z} from 'zod';
import {RadixPerformanceSettingsSchema,radixPerformanceSettings,radixRenderSettings} from '../shared/radix-performance.mjs';
import {PerformanceSettingsSchema,PerformancePresetSchema,defaultPerformance,presetFile,tourPerformanceSettings} from '../shared/performance.mjs';
import {blankProject,ProjectSchema} from '../shared/project.mjs';

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
