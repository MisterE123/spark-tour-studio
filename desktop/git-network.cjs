const gitTools=require('./git.cjs'),github=require('./github.cjs');
const privatePath=name=>/(?:^|\/)(?:\.env(?:\..*)?|\.sources\.json(?:\.tmp)?|autosave\.json(?:\.tmp)?|\.spark-tour-(?:history|publish)\.json(?:\.tmp)?|(?:credentials|hosts)\.ya?ml|\.git-credentials|\.netrc|\.gitconfig|\.aws|\.ssh|node_modules|\.spark-viewer-backups)(?:\/|$)|\.(?:pem|key|pfx|p12|exe|ckpt|safetensors|log)$/i.test(name);
const secretPattern=/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[opusr]_[A-Za-z0-9_]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bAKIA[A-Z0-9]{16}\b/;
const networkEnv={GIT_TRACE:undefined,GIT_TRACE_CURL:undefined,GIT_CURL_VERBOSE:undefined,GIT_TRACE_PACKET:undefined,GH_DEBUG:undefined,GH_TOKEN:undefined,GITHUB_TOKEN:undefined,GH_ENTERPRISE_TOKEN:undefined,GITHUB_ENTERPRISE_TOKEN:undefined,GCM_INTERACTIVE:'never',GIT_SSH_COMMAND:'ssh -o BatchMode=yes'};
function networkRunner(git,{gh,run=gitTools.runGit}={}){return (root,args,options={})=>run(git.executable,root,[...gh?github.credentialArgs(gh):[],...args],{env:networkEnv,...options});}
async function auditUpload({git,root,provider='github',base='',revision='HEAD',run=gitTools.runGit,progress=()=>{}}){
 progress('Checking versioned files before upload…');
 const names=(await run(git.executable,root,['log','--format=','--name-only','-z',revision])).output.split('\0').map(name=>name.trim()).filter(Boolean),privateFiles=[...new Set(names.filter(privatePath))];
 if(privateFiles.length)throw Error('Private or generated files are already in Git history. They were not uploaded:\n'+privateFiles.slice(0,8).join('\n')+'\nRemove them from the upload history with your Git client first.');
 const objects=(await run(git.executable,root,['rev-list','--objects',revision])).output.trim().split('\n').filter(Boolean).map(line=>{const split=line.indexOf(' ');return {id:split<0?line:line.slice(0,split),path:split<0?'':line.slice(split+1)};});
 const metadata=(await run(git.executable,root,['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{input:objects.map(o=>o.id).join('\n')+'\n'})).output.trim().split('\n');let bytes=0,files=0;const blobs=new Map();
 for(let i=0;i<objects.length;i++){const [,type,size]=metadata[i].split(' '),object=objects[i];if(type!=='blob')continue;const length=Number(size);blobs.set(object.id,length);files++;bytes+=length;
  if(provider==='github'&&length>104857600)throw Error('GitHub cannot accept this file in ordinary Git: '+object.path+' ('+(length/1048576).toFixed(1)+' MiB). Keep it on an external asset host or use your Git client to set up LFS.');
  if(/\.(?:json|txt|ya?ml|html?|css|[mc]?js|ts|md|csv|xml)$/i.test(object.path)||/(?:^|\/)\.gitignore$/.test(object.path)){const text=(await run(git.executable,root,['cat-file','blob',object.id])).output;if(secretPattern.test(text))throw Error('A possible credential was found in versioned content. It was not uploaded: '+object.path);}
 }
 const pending=(await run(git.executable,root,['rev-list','--objects','--no-object-names',revision,...base?['^'+base]:[]])).output.trim().split('\n');const pendingBytes=pending.reduce((sum,id)=>sum+(blobs.get(id)||0),0);
 if(provider==='github'&&pendingBytes>2147483648)throw Error('The pending upload is larger than GitHub’s 2 GiB single-push limit before compression. Put large assets on a separate host or push in smaller batches with your Git client.');
 return {files,bytes,pendingBytes};
}
async function pushVersions({root,git,gh,remote,progress=()=>{},run=gitTools.runGit,githubClient}){
 if(!git)throw Error('Install or select Git first.');await gitTools.requireRepository(git.executable,root);const state=await gitTools.gitState({root,git});if(!state.enabled)throw Error('Enable tour history first.');remote=gitTools.remoteName(remote);if(!state.remotes.some(r=>r.name===remote))throw Error('Choose an existing remote.');if(state.branch==='Detached HEAD')throw Error('Check out a branch with your Git client before pushing.');
 const target=(await run(git.executable,root,['remote','get-url','--push',remote])).output.trim();gitTools.remoteUrl(target);const isGithub=/^(?:https:\/\/github\.com\/|git@github\.com:)/i.test(target);
 if(isGithub){if(!gh)throw Error('GitHub support is missing from this build.');const auth=await (githubClient||github.client(gh)).authState();if(!auth.authenticated)throw Error('Sign in to GitHub before pushing.');}
 const net=networkRunner(git,{gh:isGithub?gh:null,run});const branch=state.branch;await run(git.executable,root,['check-ref-format','--branch',branch]);const reference='refs/heads/'+branch;
 const head=(await run(git.executable,root,['rev-parse','--verify','HEAD'])).output.trim();const destination=(await net(root,['ls-remote','--heads',remote,reference])).output.trim(),base=destination.split(/\s/)[0];
 if(base){if((await run(git.executable,root,['cat-file','-e',base+'^{commit}'],{allowFailure:true})).code||(await run(git.executable,root,['merge-base','--is-ancestor',base,head],{allowFailure:true})).code)throw Error('The remote has commits that are not included locally. Fetch and merge them with your Git client, then try again.');}
 const audit=await auditUpload({git,root,provider:isGithub?'github':'other',base,revision:head,run,progress});progress('Uploading saved tour versions…');
 try{await net(root,['push','--porcelain','--progress',remote,head+':'+reference],{onOutput:text=>{const percent=text.match(/(?:Writing objects|Uploading|Compressing objects):\s*(\d+)%/)?.[1];if(percent)progress('Uploading versions · '+percent+'%');}});}catch(error){throw Error(github.redact(error.message));}
 await run(git.executable,root,['config','--local','branch.'+branch+'.remote',remote]);await run(git.executable,root,['config','--local','branch.'+branch+'.merge',reference]);
 return {commit:head,remote,branch,...audit};
}
module.exports={auditUpload,pushVersions,networkRunner,privatePath,secretPattern};
