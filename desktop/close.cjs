const fs=require('node:fs/promises'),path=require('node:path');
const {atomicJson}=require('./export.cjs');

function attachClose({win,dialog,model,getRoot,getSources,isBusy,cancelJob,saveSources,clearRecovery,isHistoryBusy=()=>false,waitForHistory=async()=>{},isResourceBusy=()=>false,waitForResources=async()=>{},cancelResources=()=>{},waitTimeoutMs=8000}){
 let pending=false,closing=false,wakeWait;
 const alive=()=>!win.isDestroyed?.()&&!win.webContents.isDestroyed?.();
 const execute=code=>win.webContents.executeJavaScript(code);
 const stateCode='window.__studioCloseState?.() || {dirty:false,pending:0}';
 win.webContents.on('will-prevent-unload',event=>event.preventDefault());

 // A wait always has an escape back to editing. A second X wakes that choice
 // immediately instead of creating another simultaneous close flow or dialog.
 async function wait(work,label,{history=false,renderer=true}={}){
  const task=Promise.resolve().then(work).then(value=>({kind:'done',value}),error=>({kind:'error',error}));
  for(;;){
   let timer,listener,wake;
   const interrupt=new Promise(resolve=>{
    wake=()=>resolve({kind:'waiting'});wakeWait=wake;
    timer=setTimeout(wake,waitTimeoutMs);
    if(renderer){listener=()=>resolve({kind:'renderer'});win.webContents.once('render-process-gone',listener);win.webContents.once('destroyed',listener);if(!alive()||win.webContents.isCrashed?.())listener();}
   });
   const result=await Promise.race([task,interrupt]);
   clearTimeout(timer);if(wakeWait===wake)wakeWait=undefined;
   if(listener){win.webContents.removeListener('render-process-gone',listener);win.webContents.removeListener('destroyed',listener);}
   if(result.kind==='done')return result;
   if(result.kind==='error'&&!renderer)throw result.error;
   // A rejected executeJavaScript promise (for example after a reload) need
   // not emit render-process-gone. Offer the same explicit recovery choice.
   const unavailable=result.kind==='renderer'||result.kind==='error';
   const buttons=history?['Keep waiting','Keep editing']:unavailable?['Close without saving','Keep editing']:['Keep waiting','Keep editing','Close without saving'];
   const choice=await dialog.showMessageBox(win,{type:'question',buttons,defaultId:1,cancelId:1,message:unavailable?'The editor stopped responding.':label,detail:history?'Let the tour version operation finish before closing so the project and Git history stay consistent.':'Closing without saving discards pending content updates. Files already saved or writes already started cannot be undone.'});
   if(choice.response===1)return {kind:'stay'};
   if(!history&&(unavailable||choice.response===2))return {kind:'discard'};
  }
 }

 async function discard(){
  // Invalidate captured native/renderer ownership before canceling converters.
  // File copies themselves need not be interruptible to prevent a late apply.
  await cancelResources();
  if(alive())void execute('window.__studioCancelOperations?.()').catch(()=>{});
  await cancelJob();
 }
 async function destroy(){closing=true;win.destroy();}

 win.on('close',event=>{
  if(closing)return;event.preventDefault();if(pending){wakeWait?.();return;}pending=true;
  void(async()=>{try{
   if(isHistoryBusy()){
    const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Wait and close','Keep editing'],defaultId:1,cancelId:1,message:'A tour version operation is still running.',detail:'Let it finish before closing so the project and Git history stay consistent.'});
    if(choice.response!==0)return;
    const result=await wait(waitForHistory,'A tour version operation is still running.',{history:true,renderer:false});if(result.kind!=='done')return;
    // Allow the completed IPC reply and restored state to reach React first.
    const delivery=await wait(()=>execute('new Promise(resolve=>setTimeout(resolve,100))'),'Waiting for the restored tour.');if(delivery.kind==='stay')return;if(delivery.kind==='discard'){await discard();await destroy();return;}
   }
   let result;
   try{result=await wait(()=>execute('window.__studioPrepareClose?.();'+stateCode),'Waiting for the editor.');}
   catch(error){
    const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Close without saving','Keep editing'],defaultId:1,cancelId:1,message:'The editor could not provide its current project.',detail:'Close without saving to exit, or keep editing and try again. '+String(error)});
    if(choice.response===0){await discard();await destroy();}return;
   }
   if(result.kind==='stay')return;if(result.kind==='discard'){await discard();await destroy();return;}
   let state=result.value;
   if(state.dirty||state.pending||isBusy()||isResourceBusy()){
    const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Save and close','Close without saving','Cancel'],defaultId:0,cancelId:2,message:'Close 3DGS Perspectives Studio?',detail:state.pending||isResourceBusy()?'Save and close waits for pending content imports to finish. Active scene imports and conversions will be stopped.':isBusy()?'Active scene imports and conversions will be stopped.':'Your tour has unsaved changes.'});
    if(choice.response===2)return;
    if(choice.response===1){await discard();await destroy();return;}
    const settled=await wait(()=>Promise.all([waitForResources(),execute('window.__studioWaitForOperations?.()')]),'A content import or save is still running.');
    if(settled.kind==='stay')return;if(settled.kind==='discard'){await discard();await destroy();return;}
    await cancelJob();
    // Never reuse the pre-wait snapshot: an import can apply and become dirty
    // in the same microtask in which its operation barrier settles.
    const fresh=await wait(()=>execute(stateCode),'Waiting for the latest project.');
    if(fresh.kind==='stay')return;if(fresh.kind==='discard'){await discard();await destroy();return;}
    state=fresh.value;
    if(state.dirty){
     const root=getRoot();if(!root)throw Error('Create or open a project before saving, or choose Close without saving.');
     model.ProjectSchema.parse(state.project);model.HostingSchema.parse(state.hosting);
     await atomicJson(path.join(root,'config/tour.json'),state.project);await atomicJson(path.join(root,'config/hosting.json'),state.hosting);
     if(saveSources)await saveSources();else await atomicJson(path.join(root,'.sources.json'),getSources());
     if(clearRecovery)await clearRecovery(root);else await fs.rm(path.join(root,'autosave.json'),{force:true});
    }
   }
   await cancelJob();await destroy();
  }catch(error){if(alive())await dialog.showMessageBox(win,{type:'error',message:'Could not close the editor',detail:String(error)});}
  finally{pending=false;wakeWait=undefined;if(!closing&&alive())void execute('window.__studioResumeEditing?.()').catch(()=>{});}})();
 });
}
module.exports={attachClose};
