import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {ImportQueue}=createRequire(import.meta.url)('../desktop/import-queue.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){const tasks=[];const queue=new ImportQueue((input,progress,id)=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});tasks.push({input,id,resolve,reject,progress});return {promise,cancel:()=>reject(Error('cancelled'))};});return {queue,tasks};}
const input=(name)=>({name,kind:'ply',options:{method:'quick',maxSh:2}});
test('imports run serially, accept later batches, retain settings and require acknowledgement',async()=>{const {queue:q,tasks}=harness();const settings=input('first');q.enqueue([settings,input('second')]);settings.options.maxSh=0;assert.equal(tasks.length,1);assert.equal(tasks[0].input.options.maxSh,2);q.enqueue([input('third')]);tasks[0].progress('Working');assert.equal(q.snapshot().jobs[0].progress,'Working');tasks[0].resolve({id:tasks[0].id});await tick();assert.equal(tasks.length,2);tasks[1].resolve({});await tick();tasks[2].resolve({});await tick();assert.equal(q.hasWork(),true);q.action('clear');assert.equal(q.jobs.length,3);for(const job of q.jobs)q.action('ack',job.id);assert.equal(q.hasWork(),false);q.action('clear');assert.equal(q.jobs.length,0);});
test('pause finishes current job, queued cancellations never start, resume preserves order',async()=>{const {queue:q,tasks}=harness();q.enqueue([input('first'),input('cancel'),input('last')]);q.action('pause');q.action('cancel',q.jobs[1].id);tasks[0].resolve({});await tick();assert.equal(tasks.length,1);q.action('resume');assert.equal(tasks[1].input.name,'last');tasks[1].resolve({});await tick();});
test('failure and active cancellation allow later jobs, retry is explicit',async()=>{const {queue:q,tasks}=harness();q.enqueue([input('bad'),input('cancel'),input('last')]);tasks[0].reject(Error('bad file'));await tick();assert.equal(q.jobs[0].error,'bad file');q.action('cancel',q.jobs[1].id);assert.equal(q.hasWork(),true);await tick();assert.equal(tasks[2].input.name,'last');tasks[2].resolve({});await tick();q.action('retry',q.jobs[0].id);assert.equal(tasks.length,4);tasks[3].resolve({});await tick();assert.equal(q.jobs[0].state,'completed');});
test('cancel all stops the active worker and pending jobs; reset restores automatic processing',async()=>{const {queue:q,tasks}=harness();q.enqueue([input('first'),input('second')]);q.cancelAll();assert.throws(()=>q.action('reset'),/Finish/);await tick();assert.equal(tasks.length,1);assert.equal(q.hasWork(),false);q.action('reset');assert.equal(q.paused,false);q.enqueue([input('new')]);assert.equal(tasks.length,2);tasks[1].resolve({});await tick();});

test('completed conversion details retain the actual backend through scene replacement acknowledgement',async()=>{
 const {queue:q,tasks}=harness();q.enqueue([{...input('replacement'),replaceSceneId:'north',expectedSource:'old.rad'}]);
 tasks[0].progress('Validated, streamable SOG scene ready · CPU uniform.');tasks[0].resolve({id:'north'});await tick();
 const job=q.snapshot().jobs[0];assert.equal(job.detail,'Validated, streamable SOG scene ready · CPU uniform.');
 q.action('ack',job.id);assert.equal(q.snapshot().jobs[0].progress,'Scene updated');assert.equal(q.snapshot().jobs[0].detail,job.detail);
});

test('dismiss removes only the selected cancelled job, broadcasts its removal and keeps retry available for the rest',async()=>{
 const {queue:q,tasks}=harness(),events=[];q.notify=state=>events.push(state);
 q.action('pause');q.enqueue([input('dismiss me'),input('retry me'),input('keep queued')]);const [dismissId,retryId,queuedId]=q.jobs.map(job=>job.id);
 q.action('cancel',dismissId);q.action('cancel',retryId);const before=q.snapshot(),revision=before.revision;
 const dismissed=q.action('dismiss',dismissId);assert.equal(dismissed.revision,revision+1);assert.deepEqual(dismissed.jobs.map(job=>job.id),[retryId,queuedId]);assert.deepEqual(events.at(-1),dismissed);assert.equal(before.jobs.length,3,'previous snapshots stay unchanged');assert.equal(tasks.length,0);
 q.action('retry',dismissId);assert.equal(q.jobs.length,2,'dismissed jobs cannot restart');q.action('retry',retryId);assert.equal(q.jobs[0].state,'queued');q.action('resume');assert.equal(tasks[0].input.name,'retry me');tasks[0].resolve({});await tick();assert.equal(tasks[1].input.name,'keep queued');tasks[1].resolve({});await tick();
});

test('dismiss cannot hide queued, running, cancelling or unapplied completed imports',async()=>{
 const tasks=[],q=new ImportQueue((source,progress,id)=>{let resolve;const promise=new Promise(done=>{resolve=done;});tasks.push({id,source,resolve,cancelled:false});return {promise,cancel:()=>{tasks.at(-1).cancelled=true;}};});
 q.enqueue([input('active'),input('queued')]);const [activeId,queuedId]=q.jobs.map(job=>job.id);q.action('dismiss',activeId);q.action('dismiss',queuedId);assert.equal(q.jobs.length,2);
 q.action('cancel',activeId);q.action('dismiss',activeId);assert.equal(tasks[0].cancelled,true);assert.equal(q.jobs.length,2,'cancelling worker remains visible until it settles');assert.equal(q.snapshot().activeId,activeId);
 tasks[0].resolve({shouldNotApply:true});await tick();assert.equal(q.jobs[0].state,'cancelled');assert.equal(q.jobs[0].result,undefined);q.action('dismiss',activeId);assert.equal(q.jobs.length,1);assert.equal(q.snapshot().activeId,queuedId);
 tasks[1].resolve({id:'new-scene'});await tick();q.action('dismiss',queuedId);assert.equal(q.jobs.length,1,'pending result must be applied or discarded first');assert.equal(q.hasWork(),true);q.action('ack',queuedId);q.action('dismiss',queuedId);assert.equal(q.jobs.length,0);assert.equal(q.hasWork(),false);
});

test('failed entries can be dismissed without clearing other completed or failed entries',async()=>{
 const {queue:q,tasks}=harness();q.enqueue([input('bad'),input('done')]);const failedId=q.jobs[0].id;tasks[0].reject(Error('bad source'));await tick();tasks[1].resolve({id:'scene'});await tick();const completeId=q.jobs[1].id;q.action('dismiss','missing');assert.equal(q.jobs.length,2);q.action('dismiss',failedId);assert.deepEqual(q.jobs.map(job=>job.id),[completeId]);assert.equal(q.jobs[0].result.id,'scene');assert.equal(q.hasWork(),true);
});
