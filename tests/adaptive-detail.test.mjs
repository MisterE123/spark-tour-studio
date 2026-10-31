import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveDetailController} from '../shared/adaptive-detail.mjs';
import {PerformanceSettingsSchema,PerformancePresetSchema,presetFile} from '../shared/performance.mjs';

function harness(){const controller=new AdaptiveDetailController();let time=0;const trace=[];return {controller,trace,drive(duration,{fps=60,targetFps=60,eligible=true,context='scene:desktop',immersive=false}={}){const step=1000/fps,end=time+duration;for(;time<end;time+=step){const before=controller.scale;controller.sample({time,frameMs:step,targetFps,eligible,context,immersive});if(before!==controller.scale)trace.push({time,scale:controller.scale});}return controller.scale;},stall(ms){time+=ms;return controller.sample({time,frameMs:ms,targetFps:60,eligible:true,context:'scene:desktop'});}};}

test('automatic detail is opt-in and survives old and new named preset round trips',()=>{
 const old=PerformanceSettingsSchema.parse({});assert.equal('adaptiveDetail' in old,false);assert.equal('adaptiveTargetFps' in old,false);
 const preset=presetFile({name:'Laptop',settings:{adaptiveDetail:true,adaptiveTargetFps:45,lodSplatScale:.7}});assert.deepEqual(PerformancePresetSchema.parse(JSON.parse(JSON.stringify(preset))),preset);
 for(const invalid of [{adaptiveDetail:'true'},{adaptiveTargetFps:29},{adaptiveTargetFps:61},{adaptiveTargetFps:Infinity}])assert.equal(PerformanceSettingsSchema.safeParse(invalid).success,false);
});

test('empty/loading/inactive time never counts toward a slow-device judgment',()=>{
 const h=harness();h.drive(30000,{fps:10,eligible:false});assert.equal(h.controller.scale,1);h.drive(3900,{fps:10});assert.equal(h.controller.scale,1);h.drive(1900,{fps:10});assert.equal(h.controller.scale,1);h.drive(500,{fps:10});assert.equal(h.controller.scale,.75);
});

test('sustained low visible cadence adapts even if streaming continues, within a fixed authored ceiling',()=>{
 // Deliberately no pager-idle input: an orbit can stream continuously while
 // rendering is already slow. The integration test verifies that gate too.
 const h=harness();h.drive(7000,{fps:10});assert.equal(h.controller.scale,.75);h.drive(60000,{fps:10});assert.equal(h.controller.scale,.25);
 assert.ok(h.trace.every(entry=>entry.scale>=.25&&entry.scale<=1));for(let i=1;i<h.trace.length;i++)assert.ok(h.trace[i].time-h.trace[i-1].time>=5000);
 const authored=.4;assert.equal(authored*h.controller.scale,.1,'the effective multiplier may be below the manual range, never above its authored value');
});

test('sustained 2–3 FPS and varying long frame intervals still reduce detail',()=>{
 for(const fps of [2,3]){const h=harness();h.drive(10000,{fps});assert.ok(h.controller.scale<1,'must adapt at '+fps+' FPS');h.drive(60000,{fps});assert.equal(h.controller.scale,.25);for(let i=1;i<h.trace.length;i++)assert.ok(h.trace[i].time-h.trace[i-1].time>=5000);}
 const controller=new AdaptiveDetailController();let time=0;for(let i=0;i<150;i++){const frameMs=[240,333,500][i%3];time+=frameMs;controller.sample({time,frameMs,targetFps:60,eligible:true});}assert.equal(controller.scale,.25,'cadence varying across 250 ms is still sustained slow viewing');
});

test('sustained visible sub-1-FPS cadence can recover from an excessive detail budget',()=>{
 for(const fps of [.75,.5,.25]){const h=harness();h.drive(30000,{fps});assert.ok(h.controller.scale<1,'must adapt at '+fps+' FPS');h.drive(120000,{fps});assert.equal(h.controller.scale,.25);for(let i=1;i<h.trace.length;i++)assert.ok(h.trace[i].time-h.trace[i-1].time>=5000,'slow frames retain the change cooldown');}
 const controller=new AdaptiveDetailController();let time=0;for(let i=0;i<100;i++){const frameMs=[1100,1700,2200][i%3];time+=frameMs;controller.sample({time,frameMs,targetFps:72,eligible:true,context:'quest:xr:72'});}assert.equal(controller.scale,.25,'consistent varying slow headset intervals also adapt');
});

test('isolated multi-second gaps and interrupted slow samples cannot look like sustained device load',()=>{
 for(const ms of [1001,1500,3000,5000,7000]){const h=harness();h.drive(20000);h.stall(ms);h.drive(15000);assert.equal(h.controller.scale,1,'isolated '+ms+' ms gap stays excluded');assert.equal(h.trace.length,0);}
 const h=harness();h.drive(10000,{fps:.5,eligible:false});h.drive(9000,{fps:.5});assert.equal(h.controller.scale,1,'ineligible samples cannot complete the three-frame or observation windows');h.drive(4000,{fps:.5});assert.equal(h.controller.scale,.75);
 const controller=new AdaptiveDetailController();for(let time=0;time<100000;time+=7000)controller.sample({time,frameMs:7000,targetFps:60,eligible:true});assert.equal(controller.scale,1,'very large gaps remain ineligible even when repeated');
});

test('isolated screenshot-sized stalls cannot lower an otherwise healthy budget',()=>{
 for(const milliseconds of [300,500,900]){const h=harness();h.drive(20000);h.stall(milliseconds);h.drive(15000);assert.equal(h.controller.scale,1,'isolated '+milliseconds+' ms stall is excluded');assert.equal(h.trace.length,0);}
});

test('a long isolated stall, focus loss and timing discontinuities restart observation',()=>{
 const h=harness();h.drive(10000);h.stall(3000);h.drive(5000,{fps:10});assert.equal(h.controller.scale,1,'one stall plus a partial new window cannot reduce detail');h.drive(2000,{fps:10});assert.equal(h.controller.scale,.75);
 h.drive(20000,{fps:10,eligible:false});h.drive(5000,{fps:10});assert.equal(h.controller.scale,.75);h.drive(2000,{fps:10});assert.ok(h.controller.scale<.75);
 const c=h.controller,before=c.scale;for(const sample of [{time:NaN,frameMs:16,targetFps:60},{time:10,frameMs:0,targetFps:60},{time:11,frameMs:16,targetFps:NaN},{time:-100,frameMs:16,targetFps:60}])assert.equal(c.sample({...sample,eligible:true}),before);
});

test('recovery is cautious, has hysteresis and cannot exceed the authored target',()=>{
 const h=harness();h.drive(7000,{fps:10});assert.equal(h.controller.scale,.75);h.drive(5000,{fps:60});assert.equal(h.controller.scale,.75);h.drive(8000,{fps:60});assert.ok(h.controller.scale>.75&&h.controller.scale<=.95);h.drive(60000,{fps:60});assert.equal(h.controller.scale,1);
 const before=h.trace.length;h.drive(20000,{fps:54});assert.equal(h.controller.scale,1);assert.equal(h.trace.length,before,'small cadence variance does not oscillate quality');
});

test('a healthy new scene recovers its full budget within a minute with bounded recovery steps',()=>{
 const h=harness();h.drive(60000,{fps:10});assert.equal(h.controller.scale,.25);const start=h.trace.length;h.drive(55000,{fps:60,context:'new-scene:desktop'});assert.equal(h.controller.scale,1);const recovery=h.trace.slice(start);assert.ok(recovery.length>0);let previous=.25;for(let i=0;i<recovery.length;i++){assert.ok(recovery[i].scale>previous&&recovery[i].scale-previous<=.100001);assert.ok(recovery[i].scale<=1);if(i)assert.ok(recovery[i].time-recovery[i-1].time>=6000);previous=recovery[i].scale;}
 const changes=h.trace.length;for(let i=0;i<40;i++)h.drive(1000,{fps:1000/(i%2?19:21),context:'new-scene:desktop'});assert.equal(h.controller.scale,1);assert.equal(h.trace.length,changes,'cadence around the slow threshold cannot cause quality oscillation');
});

test('desktop/XR or scene changes restart the window and respect the supplied refresh goal',()=>{
 const h=harness();h.drive(7000,{fps:30,targetFps:30});assert.equal(h.controller.scale,1);h.drive(5000,{fps:30,targetFps:90,context:'scene:xr:90'});assert.equal(h.controller.scale,1);h.drive(2000,{fps:30,targetFps:90,context:'scene:xr:90'});assert.equal(h.controller.scale,.75);h.drive(5000,{fps:30,targetFps:90,context:'next:xr:90'});assert.equal(h.controller.scale,.75);
 assert.equal(h.controller.reset(),1);h.drive(5000,{fps:10});assert.equal(h.controller.scale,1,'applying a preset restores its full target and restarts observation');
});

test('immersive overload sheds a desktop-sized ceiling promptly and can pass the old quarter-budget floor',()=>{
 for(const fps of [20,36]){
  const h=harness(),options={fps,targetFps:72,immersive:true,context:'scene:xr:72'};
  h.drive(1700,options);assert.equal(h.controller.scale,.5,'a sustained overloaded headset should reduce within two seconds');
  h.drive(3500,options);assert.ok(h.controller.scale<=.125,'High detail should reach source-coverage-sized budgets within five seconds');
  h.drive(12000,options);assert.equal(h.controller.scale,.01,'the old .25 floor must not retain a million-splat desktop request');
  assert.ok(h.trace.every(entry=>entry.scale>=.01&&entry.scale<=1));
  for(let i=1;i<h.trace.length;i++)assert.ok(h.trace[i].time-h.trace[i-1].time>=1500-1e-6,'headset changes retain a bounded cooldown');
 }
 const desktop=harness();desktop.drive(1700,{fps:20,targetFps:72});assert.equal(desktop.controller.scale,1,'the existing desktop observation period is unchanged');
});

test('immersive feedback detects missed 72/90 Hz delivery instead of accepting a 60 FPS desktop goal',()=>{
 for(const targetFps of [72,90]){const h=harness();h.drive(2000,{fps:60,targetFps,immersive:true,context:'headset'});assert.ok(h.controller.scale<1,'60 FPS misses '+targetFps+' Hz and should adapt');}
 const h=harness();h.drive(30000,{fps:72,targetFps:72,immersive:true,context:'headset'});assert.equal(h.controller.scale,1,'stable delivery at the headset refresh retains authored detail');
});

test('repeated severe immersive stalls still drive recovery after comparable-frame confirmation',()=>{
 for(const fps of [2,.5]){const h=harness();h.drive(22000,{fps,targetFps:72,immersive:true,context:'headset'});assert.ok(h.controller.scale<.25,'repeated '+fps+' FPS headset delivery must not remain at the old floor');assert.ok(h.controller.scale>=.01);}
});

test('immersive safety exclusions and cautious recovery preserve a seeded device-local ceiling',()=>{
 const h=harness();assert.equal(h.controller.reset(.15),.15);h.drive(30000,{fps:20,targetFps:72,immersive:true,eligible:false});assert.equal(h.controller.scale,.15);
 h.drive(1000,{fps:20,targetFps:72,immersive:true});assert.equal(h.controller.scale,.15,'suspended time cannot complete the new observation window');
 h.drive(2000,{fps:20,targetFps:72,immersive:true});assert.ok(h.controller.scale<.15);
 h.drive(20000,{fps:20,targetFps:72,immersive:true});assert.equal(h.controller.scale,.01);
 const recoveryStart=h.trace.length;h.drive(40000,{fps:72,targetFps:72,immersive:true});
 const recovery=h.trace.slice(recoveryStart);assert.ok(recovery.length>=2);let previous=.01;
 for(let i=0;i<recovery.length;i++){assert.ok(recovery[i].scale>previous&&recovery[i].scale-previous<=.050001);if(i)assert.ok(recovery[i].time-recovery[i-1].time>=10000-1e-6);previous=recovery[i].scale;}
 assert.ok(h.controller.scale<.3,'recovery must not immediately return a headset to an excessive detail request');
 const c=new AdaptiveDetailController();c.reset(.005);for(let time=0;time<10000;time+=50)c.sample({time,frameMs:50,targetFps:72,eligible:true,immersive:true});assert.equal(c.scale,.005,'an already lower explicit seed cannot be increased by a slow-frame floor clamp');
 assert.equal(c.reset(),1);for(const value of [0,-1,1.1,NaN,Infinity])assert.throws(()=>c.reset(value),/Initial automatic detail/);
});

test('an isolated immersive screenshot-sized stall does not cut detail',()=>{
 const c=new AdaptiveDetailController();let time=0;for(let i=0;i<400;i++){const ms=i===100?500:1000/72;time+=ms;c.sample({time,frameMs:ms,targetFps:72,eligible:true,immersive:true});}assert.equal(c.scale,1);
});
