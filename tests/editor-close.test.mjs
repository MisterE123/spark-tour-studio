import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import {createEditorOperations} from '../shared/editor-operations.mjs';
import {blankProject,ProjectSchema,HostingSchema} from '../shared/project.mjs';
const {attachClose}=createRequire(import.meta.url)('../desktop/close.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
async function until(predicate){for(let i=0;i<100;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,2));}assert.fail('Close fixture did not reach the expected state');}
function fixture(options={}){
 const win=new EventEmitter(),operations=createEditorOperations(),closed=deferred(),messages=[],calls=[];
 const state={dirty:false,project:blankProject(),hosting:{assetBaseUrl:'./',sceneUrls:{}},...options.state};
 let destroyed=false,locked=false,resourceBusy=false,canceled=false,choice=options.choice??0;
 win.webContents=new EventEmitter();win.isDestroyed=()=>destroyed;win.webContents.isDestroyed=()=>false;
 win.destroy=()=>{destroyed=true;closed.resolve();};
 win.webContents.executeJavaScript=async code=>{
  calls.push(code);
  if(code.includes('__studioPrepareClose'))locked=true;
  if(code.includes('__studioCancelOperations')){canceled=true;return;}
  if(code.includes('__studioResumeEditing')){locked=false;return;}
  if(code.includes('__studioWaitForOperations'))return operations.wait();
  if(code.includes('__studioCloseState'))return {...state,pending:operations.pending};
 };
 const api={win,state,operations,closed:closed.promise,messages,calls,get destroyed(){return destroyed;},get locked(){return locked;},get canceled(){return canceled;},set choice(value){choice=value;},set resourceBusy(value){resourceBusy=value;},close(){win.emit('close',{preventDefault(){}});}};
 attachClose({win,dialog:{showMessageBox:async(_win,message)=>{messages.push(message);return {response:typeof choice==='function'?await choice(message):choice};}},model:{ProjectSchema,HostingSchema},getRoot:()=>options.root,getSources:()=>({}),isBusy:()=>false,isResourceBusy:()=>resourceBusy,waitForResources:async()=>{},cancelResources:()=>calls.push('cancel-resources'),cancelJob:()=>calls.push('cancel-job'),waitTimeoutMs:options.waitTimeoutMs??1000,...options.hooks});
 return api;
}

test('operation barrier includes nested reads, authorized apply, failures and newly queued settlement',async()=>{
 const operations=createEditorOperations(),read=deferred(),apply=deferred(),order=[];
 const task=operations.track(async()=>{const value=await operations.track(()=>read.promise);order.push('read');await apply.promise;order.push(value);});
 let settled=false;const waiting=operations.wait().then(()=>{settled=true;order.push('settled');});
 assert.equal(operations.pending,2);read.resolve('applied');await tick();assert.equal(operations.pending,1);assert.equal(settled,false,'Read settlement alone is not import completion');apply.resolve();await task;await waiting;assert.deepEqual(order,['read','applied','settled']);assert.equal(operations.pending,0);
 const failed=operations.track(async()=>{throw Error('failed read');});await assert.rejects(failed,/failed read/);await operations.wait();assert.equal(operations.pending,0,'Failure cannot strand Close');
 const first=deferred(),second=deferred();const chain=operations.track(async()=>{await first.promise;void operations.track(()=>second.promise);});settled=false;const chainedWait=operations.wait().then(()=>{settled=true;});first.resolve();await chain;await tick();assert.equal(settled,false);second.resolve();await chainedWait;assert.equal(operations.pending,0);
});

test('ordinary clean Close exits without an unsaved prompt',async()=>{
 const app=fixture();app.close();await app.closed;assert.equal(app.messages.length,0);assert.equal(app.canceled,false);assert.equal(app.calls.filter(code=>code.includes('__studioCloseState')).length,1);
});

test('Cancel keeps dirty content, pending imports and editing alive',async()=>{
 const app=fixture({state:{dirty:true},choice:2}),read=deferred();const importTask=app.operations.track(()=>read.promise);app.close();await until(()=>app.messages.length===1&&!app.locked);assert.equal(app.destroyed,false);assert.equal(app.canceled,false);assert.equal(app.operations.pending,1);assert.equal(app.calls.includes('cancel-job'),false);read.resolve();await importTask;assert.equal(app.state.dirty,true);
});

test('Save-and-close waits for both native I/O and renderer apply then writes fresh synchronous refs',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'studio close import ')),native=deferred(),read=deferred(),apply=deferred();let nativeBusy=true;let savedSources=0;
 try{
  const app=fixture({root,hooks:{isResourceBusy:()=>nativeBusy,waitForResources:()=>native.promise,saveSources:async()=>{savedSources++;},clearRecovery:async()=>{}}});
  const task=app.operations.track(async()=>{await read.promise;await apply.promise;app.state.project.title='Imported and applied';app.state.hosting={assetBaseUrl:'https://cdn.example/',sceneUrls:{}};app.state.dirty=true;});
  app.close();await until(()=>app.calls.some(code=>code.includes('__studioWaitForOperations')));assert.equal(app.locked,true);assert.equal(app.destroyed,false);assert.equal(app.calls.includes('cancel-resources'),false);
  nativeBusy=false;native.resolve();read.resolve();await tick();assert.equal(app.destroyed,false,'Native completion must not bypass the renderer apply');
  apply.resolve();await task;await app.closed;assert.equal(savedSources,1);assert.equal(JSON.parse(await fs.readFile(path.join(root,'config/tour.json'),'utf8')).title,'Imported and applied');assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'config/hosting.json'),'utf8')),app.state.hosting);assert.equal(app.canceled,false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('canceled and failed imports settle cleanly without saving an unchanged project',async()=>{
 for(const failed of [false,true]){
  const app=fixture({hooks:{getRoot:()=>{throw Error('An unchanged project must not save');}}}),read=deferred();
  const task=app.operations.track(async()=>{await read.promise;if(failed)throw Error('read failed');return null;});const handled=task.catch(()=>{});
  app.close();await until(()=>app.messages.length===1);read.resolve();await handled;await app.closed;assert.equal(app.messages.length,1);assert.equal(app.state.dirty,false);
 }
});

test('Close without saving invalidates resources and pending apply, then exits promptly',async()=>{
 const app=fixture({choice:1}),never=deferred();const task=app.operations.track(()=>never.promise);app.resourceBusy=true;app.close();await app.closed;assert.equal(app.canceled,true);assert.ok(app.calls.indexOf('cancel-resources')<app.calls.indexOf('cancel-job'));assert.equal(app.operations.pending,1);never.resolve();await task;
});

test('repeated X wakes one bounded wait and Keep editing does not cancel the import',async()=>{
 const app=fixture({choice:message=>message.buttons[0]==='Save and close'?0:1}),read=deferred();const task=app.operations.track(()=>read.promise);
 app.close();await until(()=>app.calls.some(code=>code.includes('__studioWaitForOperations')));app.close();app.close();await until(()=>app.messages.length===2&&!app.locked);assert.deepEqual(app.messages[1].buttons,['Keep waiting','Keep editing','Close without saving']);assert.equal(app.destroyed,false);assert.equal(app.canceled,false);assert.equal(app.calls.includes('cancel-job'),false);read.resolve();await task;await tick();assert.equal(app.destroyed,false,'A canceled Close must not resume itself when the old waiter settles');
});

test('slow operation timeout offers explicit choices and Keep waiting can finish',async()=>{
 const read=deferred(),app=fixture({waitTimeoutMs:15,choice:message=>{if(message.buttons[0]==='Keep waiting')read.resolve();return 0;}}),task=app.operations.track(()=>read.promise);
 app.close();await app.closed;await task;assert.equal(app.messages.length,2);assert.equal(app.canceled,false);assert.equal(app.win.webContents.listenerCount('render-process-gone'),0);assert.equal(app.win.webContents.listenerCount('destroyed'),0);
});

test('renderer loss during an import wait permits discard without hanging',async()=>{
 const app=fixture({choice:message=>message.buttons[0]==='Save and close'?0:0}),read=deferred(),task=app.operations.track(()=>read.promise);
 app.close();await until(()=>app.calls.some(code=>code.includes('__studioWaitForOperations')));app.win.webContents.emit('render-process-gone',{},{});await app.closed;assert.equal(app.messages.length,2);assert.match(app.messages[1].message,/stopped responding/);assert.equal(app.canceled,true);read.resolve();await task;
});

test('rejected renderer settlement after reload also offers explicit discard',async()=>{
 const app=fixture({state:{dirty:true},choice:0}),original=app.win.webContents.executeJavaScript;
 app.win.webContents.executeJavaScript=code=>code.includes('__studioWaitForOperations')?Promise.reject(Error('Execution context was destroyed')):original(code);
 app.close();await app.closed;assert.equal(app.messages.length,2);assert.deepEqual(app.messages[1].buttons,['Close without saving','Keep editing']);assert.equal(app.canceled,true);
});

test('failed initial renderer snapshot offers Keep editing or explicit discard',async()=>{
 let bad=true;const app=fixture({choice:1});const original=app.win.webContents.executeJavaScript;app.win.webContents.executeJavaScript=code=>code.includes('__studioCloseState')&&bad?Promise.reject(Error('renderer gone')):original(code);
 app.close();await until(()=>app.messages.length===1&&!app.locked);assert.equal(app.destroyed,false);assert.equal(app.canceled,false);assert.deepEqual(app.messages[0].buttons,['Close without saving','Keep editing']);bad=false;app.close();await app.closed;
});

test('a close-save validation failure keeps the project dirty and restores editing',async()=>{
 const app=fixture({state:{dirty:true},choice:0});app.close();await until(()=>app.messages.length===2&&!app.locked);assert.equal(app.messages[1].message,'Could not close the editor');assert.match(app.messages[1].detail,/Create or open a project/);assert.equal(app.destroyed,false);assert.equal(app.state.dirty,true);app.choice=1;app.close();await app.closed;assert.equal(app.canceled,true);
});

test('slow Git operation retains its wait-or-edit choices without resource invalidation',async()=>{
 const history=deferred(),app=fixture({waitTimeoutMs:15,choice:message=>message.buttons[0]==='Wait and close'?0:1,hooks:{isHistoryBusy:()=>true,waitForHistory:()=>history.promise}});app.close();await until(()=>app.messages.length===2);await tick();assert.deepEqual(app.messages[1].buttons,['Keep waiting','Keep editing']);assert.equal(app.destroyed,false);assert.equal(app.canceled,false);assert.equal(app.calls.some(code=>code.includes('__studioCloseState')),false);history.resolve();await tick();assert.equal(app.destroyed,false);
});
