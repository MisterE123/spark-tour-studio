const fs=require('node:fs/promises'),path=require('node:path');const {atomicJson}=require('./export.cjs');
function attachClose({win,dialog,model,getRoot,getSources,isBusy,cancelJob,saveSources}){let pending=false,closing=false;
 win.webContents.on('will-prevent-unload',event=>event.preventDefault());
 win.on('close',event=>{if(closing)return;event.preventDefault();if(pending)return;pending=true;void(async()=>{try{
  let state=await win.webContents.executeJavaScript('window.__studioCloseState?.() || {dirty:false}');
  if(state.dirty||isBusy()){const choice=await dialog.showMessageBox(win,{type:'question',buttons:['Save and close','Close without saving','Cancel'],defaultId:0,cancelId:2,message:'Close Spark Tour Studio?',detail:isBusy()?'Pending imports and conversions will be stopped.':'Your tour has unsaved changes.'});if(choice.response===2)return;cancelJob();state=await win.webContents.executeJavaScript('window.__studioCloseState?.() || {dirty:false}');
   if(choice.response===0&&state.dirty){const root=getRoot();if(!root)throw Error('Create or open a project before saving, or choose Close without saving.');model.ProjectSchema.parse(state.project);model.HostingSchema.parse(state.hosting);await atomicJson(path.join(root,'config/tour.json'),state.project);await atomicJson(path.join(root,'config/hosting.json'),state.hosting);if(saveSources)await saveSources();else await atomicJson(path.join(root,'.sources.json'),getSources());await fs.rm(path.join(root,'autosave.json'),{force:true});}}
  cancelJob();closing=true;win.destroy();
 }catch(e){await dialog.showMessageBox(win,{type:'error',message:'Could not close the editor',detail:String(e)});}finally{pending=false;}})();});
}
module.exports={attachClose};
