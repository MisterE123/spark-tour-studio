import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {newScene} from '../shared/project.mjs';

const entry=fileURLToPath(new URL('../src/collision-job.ts',import.meta.url));
const bundled=await build({entryPoints:[entry],bundle:true,write:false,platform:'node',format:'esm',define:{'import.meta.url':JSON.stringify(pathToFileURL(entry).href)},logLevel:'silent'});
let CollisionJob;try{({CollisionJob}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].contents).toString('base64')));}catch(error){throw Error('Collision job test bundle could not load: '+String(error?.message||error).replace(/data:text[^\s]+/g,'[in-memory module]').slice(0,1000));}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function until(predicate,message='condition did not settle'){for(let i=0;i<100;i++){if(predicate())return;await tick();}assert.fail(message);}
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const stats={scanned:20,leaves:20,selected:10,ignored:0,footprint:4,voxels:50,triangles:12};

function fixture(t,{format='glb',bridge={}}={}){
 const globals=new Map(['window','document','Worker'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)])),workers=[],progressListeners=new Set(),calls={diagnostics:[],logs:[],begin:[],abort:[],finalize:[],save:[],complete:[],bounds:[],statuses:[]};
 class FakeWorker {
  constructor(url,options){this.url=url;this.options=options;this.messages=[];this.terminated=false;workers.push(this);}
  postMessage(message){this.messages.push(message);}
  terminate(){this.terminated=true;}
  emit(data){return this.onmessage?.({data});}
 }
 const scene=newScene('north','North','north.rad');scene.collisionAuthoring={format,volumes:[{id:'area',type:'box',operation:'add',position:[0,0,0],rotation:[0,0,0],size:[8,4,8]}]};
 const other=newScene('south','South','south.rad'),scenes=new Map([[scene.id,scene],[other.id,other]]),state={root:'D:/test-tour',selected:scene.id};
 const studio={
  async beginCollisionDiagnostics(summary){calls.diagnostics.push(summary);return {id:'diagnostics-1',path:'collision-logs/job.jsonl'};},
  async appendCollisionDiagnostics(id,event){calls.logs.push({id,...event});},
  onProgress(listener){progressListeners.add(listener);return()=>progressListeners.delete(listener);},
  async beginPagedCollision(){calls.begin.push(true);return 'session-1';},
  async abortPagedCollision(id){calls.abort.push(id);},
  async appendPagedCollision(){},async pagedCollisionKeys(){return [];},async readPagedCollision(){return {cells:new Uint32Array(),done:true};},async writePagedCollisionTile(){},
  async finalizePagedCollision(id,manifest,stepHeight){calls.finalize.push({id,manifest,stepHeight});return 'colliders/generated/scene.collision.json';},
  async saveCollisionGlb(bytes){calls.save.push(bytes);return 'colliders/generated.collision.glb';},
  ...bridge
 };
 Object.defineProperty(globalThis,'window',{configurable:true,writable:true,value:{studio}});
 Object.defineProperty(globalThis,'document',{configurable:true,writable:true,value:{baseURI:'https://editor.test/app/editor.html'}});
 Object.defineProperty(globalThis,'Worker',{configurable:true,writable:true,value:FakeWorker});
 const job=new CollisionJob(),environment={context:id=>{const scene=scenes.get(id);return scene?{root:state.root,scene,navigation:state.navigation,hosting:{assetBaseUrl:'./',sceneUrls:{}},base:'https://editor.test/tour/'}:undefined;},complete:async(id,ref)=>{calls.complete.push({id,ref});scenes.get(id).collider=ref;},bounds:(id,bounds)=>calls.bounds.push({id,bounds}),status:text=>calls.statuses.push(text)};
 job.configure(environment);
 t.after(()=>{job.dispose();for(const [key,descriptor]of globals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];});
 return {job,workers,studio,calls,scenes,state,environment,progressListeners};
}

test('one collision job retains progress across subscriptions and applies to its original scene',async t=>{
 const f=fixture(t);let oldNotifications=0,newNotifications=0;const off=f.job.subscribe(()=>oldNotifications++);
 f.job.start('north');await until(()=>f.workers.length===1);const before=f.job.getSnapshot(),oldCount=oldNotifications;off();const offNew=f.job.subscribe(()=>newNotifications++);
 f.state.selected='south';f.job.configure({...f.environment});f.job.start('south');
 assert.equal(f.workers.length,1);assert.equal(f.job.getSnapshot().sceneId,'north');
 f.workers[0].emit({type:'progress',phase:'Reading original splat pages…',completed:3,total:10,workerOnly:'must not enter diagnostics'});
 assert.equal(f.job.getSnapshot().progress.completed,3);assert.equal(oldNotifications,oldCount);assert.ok(newNotifications>0);assert.notEqual(f.job.getSnapshot(),before,'published snapshots are immutable');
 assert.deepEqual(f.calls.logs.find(event=>event.type==='phase'),{id:'diagnostics-1',type:'phase',phase:'Reading original splat pages…',completed:3,total:10},'actual worker progress becomes a clean diagnostic phase event');
 assert.ok(!f.calls.logs.some(event=>event.type==='progress'||Object.hasOwn(event,'workerOnly')),'worker message fields cannot override the diagnostic event type');
 f.workers[0].emit({type:'complete',bytes:new Uint8Array([1,2,3]),stats});await until(()=>!f.job.getSnapshot().working);offNew();
 assert.deepEqual(f.calls.complete,[{id:'north',ref:'colliders/generated.collision.glb'}]);assert.equal(f.scenes.get('south').collider,'');assert.equal(f.calls.logs.at(-1).type,'success');assert.equal(f.progressListeners.size,0);
});

test('cancelling while diagnostics starts prevents worker and session creation',async t=>{
 const diagnostics=deferred();let begun=0;const f=fixture(t,{format:'paged',bridge:{beginCollisionDiagnostics(){begun++;return diagnostics.promise;}}});
 f.job.start('north');assert.equal(begun,1);f.job.cancel();await tick();assert.equal(f.job.getSnapshot().working,true);assert.equal(f.job.getSnapshot().cancelling,true);assert.equal(f.workers.length,0);
 diagnostics.resolve({id:'pending-log',path:'collision-logs/pending.jsonl'});await until(()=>!f.job.getSnapshot().working);
 assert.equal(f.workers.length,0);assert.equal(f.calls.begin.length,0);assert.equal(f.calls.complete.length,0);assert.equal(f.calls.logs.at(-1).type,'cancelled');
});

test('cancelling during session creation waits for its native cleanup before becoming idle',async t=>{
 const session=deferred(),abort=deferred();let beginCalls=0,abortCalls=0;const f=fixture(t,{format:'paged',bridge:{beginPagedCollision(){beginCalls++;return session.promise;},abortPagedCollision(id){assert.equal(id,'pending-session');abortCalls++;return abort.promise;}}});
 f.job.start('north');await until(()=>beginCalls===1);f.job.cancel();session.resolve('pending-session');await until(()=>abortCalls>0);
 assert.equal(f.job.getSnapshot().working,true);assert.equal(f.job.getSnapshot().cancelling,true);assert.equal(f.workers.length,0);assert.equal(f.calls.complete.length,0);
 abort.resolve();await until(()=>!f.job.getSnapshot().working);assert.equal(f.calls.logs.at(-1).type,'cancelled');assert.equal(f.progressListeners.size,0);
});

for(const change of ['source','transform','authoring','step-height','deleted','project'])test(`a ${change} change to the original job target prevents stale application`,async t=>{
 const f=fixture(t);f.job.start('north');await until(()=>f.workers.length===1);
 if(change==='source')f.scenes.get('north').source='replacement.rad';
 else if(change==='transform')f.scenes.get('north').transform.scale=2;
 else if(change==='authoring')f.scenes.get('north').collisionAuthoring.volumes[0].size[0]=10;
 else if(change==='step-height')f.scenes.get('north').walkStepHeight=.2;
 else if(change==='deleted')f.scenes.delete('north');
 else f.state.root='D:/different-tour';
 f.workers[0].emit({type:'complete',bytes:new Uint8Array([1,2,3]),stats});await until(()=>!f.job.getSnapshot().working);
 assert.equal(f.calls.save.length,0);assert.equal(f.calls.complete.length,0);assert.match(f.job.getSnapshot().result,/Scene changed during generation/);assert.equal(f.calls.logs.at(-1).type,'error');
});

test('cancelled native finalization drains after abort before progress and busy state are released',async t=>{
 const finalized=deferred();let finalizing=false,aborted=0;const f=fixture(t,{format:'paged',bridge:{finalizePagedCollision(){finalizing=true;return finalized.promise;},async abortPagedCollision(){aborted++;}}});
 f.job.start('north');await until(()=>f.workers.length===1);const worker=f.workers[0],sink=worker.emit({type:'sink',id:7,method:'finalize',args:[{fixture:true}]});await until(()=>finalizing);
 f.job.cancel();await until(()=>aborted>0);await tick();assert.equal(worker.terminated,true);assert.equal(f.job.getSnapshot().working,true,'abort acknowledgement does not imply pending finalization has drained');assert.equal(f.progressListeners.size,1);
 f.job.start('south');assert.equal(f.workers.length,1,'a second job cannot start while cancellation drains');
 for(const listener of f.progressListeners)listener('Preparing walking tiles… 99 / 100');assert.equal(f.job.getSnapshot().progress.phase,'Cancelling collision generation…','late native progress does not replace cancellation state');
 finalized.resolve('colliders/late/scene.collision.json');await sink;await until(()=>!f.job.getSnapshot().working);
 assert.equal(f.calls.complete.length,0);assert.equal(f.progressListeners.size,0);assert.equal(f.calls.logs.at(-1).type,'cancelled');assert.ok(!worker.messages.some(message=>message.type==='sinkResult'),'terminated workers receive no late persistence response');
});

test('a target changed during saving keeps the completed file separate from project annotations',async t=>{
 const saved=deferred();let saving=false;const f=fixture(t,{bridge:{saveCollisionGlb(){saving=true;return saved.promise;}}});
 f.job.start('north');await until(()=>f.workers.length===1);f.workers[0].emit({type:'complete',bytes:new Uint8Array([1]),stats});await until(()=>saving);
 f.scenes.get('north').source='new-source.rad';assert.equal(f.job.getSnapshot().working,true);saved.resolve('colliders/old-source.collision.glb');await until(()=>!f.job.getSnapshot().working);
 assert.equal(f.calls.complete.length,0);assert.equal(f.scenes.get('north').collider,'');assert.equal(f.calls.logs.at(-1).ref,'colliders/old-source.collision.glb');assert.equal(f.calls.logs.at(-1).type,'error');
});

test('applying saved collision is not cancelled partway through a project change',async t=>{
 const applied=deferred(),f=fixture(t);let applying=false;f.job.configure({...f.environment,complete:async(id,ref)=>{applying=true;f.calls.complete.push({id,ref});await applied.promise;}});
 f.job.start('north');await until(()=>f.workers.length===1);f.workers[0].emit({type:'complete',bytes:new Uint8Array([1]),stats});await until(()=>applying);
 assert.equal(f.job.getSnapshot().cancellable,false);f.job.cancel();assert.equal(f.job.getSnapshot().cancelling,false);assert.equal(f.job.getSnapshot().working,true);
 applied.resolve();await until(()=>!f.job.getSnapshot().working);assert.equal(f.calls.logs.at(-1).type,'success');assert.equal(f.calls.complete.length,1);
});

test('bounds estimation survives inspector remount and selection changes',async t=>{
 const f=fixture(t);f.job.start('north','estimate');assert.equal(f.workers.length,1);const off=f.job.subscribe(()=>{});off();f.state.selected='south';
 const bounds={id:'scene-bounds',type:'box',operation:'add',position:[0,2,0],rotation:[0,0,0],size:[20,8,12]};f.workers[0].emit({type:'bounds',bounds});await until(()=>!f.job.getSnapshot().working);
 assert.deepEqual(f.calls.bounds,[{id:'north',bounds}]);assert.equal(f.calls.complete.length,0);assert.match(f.job.getSnapshot().result,/Scene bounds estimated/);assert.equal(f.progressListeners.size,0);
});


test('paged generation captures the scene step height in meters for native walking tiles',async t=>{
 const f=fixture(t,{format:'paged'});f.scenes.get('north').walkStepHeight=.42;f.scenes.get('north').transform.scale=3;
 f.job.start('north');await until(()=>f.workers.length===1);const worker=f.workers[0];await worker.emit({type:'sink',id:8,method:'finalize',args:[{fixture:true}]});assert.equal(f.calls.finalize[0].stepHeight,.42,'generation geometry is already in authored world meters; scene scale must not scale the setting again');worker.emit({type:'complete',ref:'colliders/generated/scene.collision.json',stats});await until(()=>!f.job.getSnapshot().working);assert.equal(f.calls.complete.length,1);
});

test('paged generation inherits the project step height without creating a scene override',async t=>{
 const f=fixture(t,{format:'paged'});f.state.navigation={baseSpeed:2,walkStepHeight:.3};f.job.start('north');await until(()=>f.workers.length===1);const worker=f.workers[0];
 await worker.emit({type:'sink',id:9,method:'finalize',args:[{fixture:true}]});assert.equal(f.calls.finalize[0].stepHeight,.3);assert.equal(f.scenes.get('north').walkStepHeight,undefined);
 worker.emit({type:'complete',ref:'colliders/generated/scene.collision.json',stats});await until(()=>!f.job.getSnapshot().working);assert.equal(f.calls.complete.length,1);
});

for(const overridden of [false,true])test(`project step changes ${overridden?'preserve explicit scene generation':'prevent stale inherited generation'}`,async t=>{
 const f=fixture(t);f.state.navigation={baseSpeed:2,walkStepHeight:.3};if(overridden)f.scenes.get('north').walkStepHeight=0;
 f.job.start('north');await until(()=>f.workers.length===1);f.state.navigation={baseSpeed:8,walkStepHeight:.6};f.workers[0].emit({type:'complete',bytes:new Uint8Array([1]),stats});await until(()=>!f.job.getSnapshot().working);
 assert.equal(f.calls.complete.length,overridden?1:0);if(!overridden)assert.match(f.job.getSnapshot().result,/Scene changed during generation/);
});
