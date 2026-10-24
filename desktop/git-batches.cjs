const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {runGit}=require('./git.cjs'),{atomicJson}=require('./export.cjs'),{redact}=require('./github.cjs');
const batchBytes=256*1024*1024,sha=/^[a-f0-9]{40,64}$/;
function batches(blobs,limit=batchBytes){const result=[];let group=[],bytes=0;for(const blob of blobs){if(group.length&&bytes+blob.bytes>limit){result.push({blobs:group,bytes});group=[];bytes=0;}group.push(blob);bytes+=blob.bytes;}if(group.length)result.push({blobs:group,bytes});return result;}
async function pushCommit({git,root,remote,reference,revision,audit,net,run=runGit,progress=()=>{},limit=batchBytes}){
 const directory=path.resolve(root,(await run(git.executable,root,['rev-parse','--git-path','spark-tour-uploads'])).output.trim());
 const target=(await net(root,['remote','get-url','--push',remote])).output.trim(),key=crypto.createHash('sha256').update(target+'\n'+reference+'\n'+revision).digest('hex'),file=path.join(directory,key+'.json');let state;
 try{state=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('The resumable upload data could not be read. '+redact(error.message));}
 if(state&&(!sha.test(state.revision)||state.revision!==revision||!/^refs\/heads\/spark-tour-upload-[a-f0-9-]+$/.test(state.ref)||!Array.isArray(state.batches)||!state.batches.length||state.batches.some(batch=>!sha.test(batch.commit))))throw Error('Invalid resumable upload data.');
 if(!state&&audit.pendingBytes>limit){
  await fs.mkdir(directory,{recursive:true});const indexFile=path.join(directory,key+'.index');await fs.rm(indexFile,{force:true});
  const plan=batches(audit.pendingBlobs,limit);state={revision,ref:'refs/heads/spark-tour-upload-'+crypto.randomUUID(),batches:[]};let parent='';
  try{await run(git.executable,root,['read-tree','--empty'],{indexFile});for(let i=0;i<plan.length;i++){
   progress('Preparing upload batch '+(i+1)+' of '+plan.length+'…');
   await run(git.executable,root,['update-index','--add','-z','--index-info'],{indexFile,input:Buffer.from(plan[i].blobs.map(blob=>'100644 '+blob.id+'\tobjects/'+blob.id).join('\0')+'\0')});
   const tree=(await run(git.executable,root,['write-tree'],{indexFile})).output.trim(),commit=(await run(git.executable,root,['commit-tree',tree,...parent?['-p',parent]:[],'-m','3DGS Perspectives Studio upload batch '+(i+1)+' of '+plan.length])).output.trim();state.batches.push({commit,bytes:plan[i].bytes});parent=commit;
  }await run(git.executable,root,['update-ref',state.ref,parent,'0'.repeat(parent.length)]);await atomicJson(file,state);
  }finally{await fs.rm(indexFile,{force:true});}
 }
 let count=0,warning='';
 try{
  if(state){const remoteHead=(await net(root,['ls-remote','--heads',remote,state.ref])).output.trim().split(/\s/)[0],done=remoteHead?state.batches.findIndex(batch=>batch.commit===remoteHead):-1;if(remoteHead&&done<0)throw Error('The temporary upload branch changed remotely. It was left untouched.');
   for(let i=done+1;i<state.batches.length;i++){progress('Uploading batch '+(i+1)+' of '+state.batches.length+' · '+(state.batches[i].bytes/1048576).toFixed(0)+' MiB…');await net(root,['push','--porcelain','--progress',remote,state.batches[i].commit+':'+state.ref]);}count=state.batches.length;
  }
  // Bitmap subtraction omits uploaded blobs across independent root histories.
  // Ordinary revision traversal would resend the large original root snapshot.
  if(state){progress('Indexing uploaded assets…');await run(git.executable,root,['-c','pack.threads=2','-c','pack.window=0','repack','-adb']);}
  progress('Publishing saved history…');await net(root,[...state?['-c','push.useBitmaps=true']:[],'push','--porcelain','--progress',remote,revision+':'+reference],{onOutput:text=>{const percent=text.match(/Writing objects:\s*(\d+)%/)?.[1];if(percent)progress('Publishing saved history · '+percent+'%');}});
 }catch(error){throw Error(redact(error.message)+(state?'\nRetry the upload to resume completed batches. Your saved history is unchanged.':''));}
 if(state){const last=state.batches.at(-1).commit;try{const head=(await net(root,['ls-remote','--heads',remote,state.ref])).output.trim().split(/\s/)[0];if(head&&head!==last)throw Error('Temporary branch changed.');if(head)await net(root,['push','--porcelain',remote,':'+state.ref]);await run(git.executable,root,['update-ref','-d',state.ref,last]);await fs.rm(file,{force:true});}catch(error){warning='Upload completed; the temporary upload branch could not be removed. '+redact(error.message);}}
 return {batches:count,warning};
}
module.exports={pushCommit,batches,batchBytes};
