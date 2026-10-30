import {execFileSync} from 'node:child_process';

function experimentalOverride(value){
 if(value===undefined||value==='')return undefined;
 if(value==='1'||value==='true')return true;
 if(value==='0'||value==='false')return false;
 throw Error('SPARK_EXPERIMENTAL_BUILD must be 1, 0, true or false.');
}
/** Resolve build identity without touching the filesystem or starting Git. */
export function studioBuildInfo({branch='',commit='',dirty=false,override,refType='',refName='',headRef=''}={}){
 const currentBranch=branch||(refType==='tag'?'':headRef||refName),hash=/^[0-9a-f]{7,40}$/i.test(commit)?commit.toLowerCase():'';
 return {experimental:experimentalOverride(override)??(refType!=='tag'&&currentBranch.startsWith('codex/experimental-')),branch:currentBranch,commit:hash,shortCommit:hash.slice(0,8),dirty:!!dirty};
}
/** Read repository metadata at build time only; no visitor code imports this. */
export function readStudioBuildInfo({cwd=process.cwd(),env=process.env,git}={}){
 const read=git||((args)=>{try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],windowsHide:true,timeout:3000}).trim();}catch{return '';}});
 return studioBuildInfo({branch:read(['branch','--show-current']),commit:read(['rev-parse','HEAD'])||env.GITHUB_SHA||'',dirty:!!read(['status','--porcelain','--untracked-files=normal']),override:env.SPARK_EXPERIMENTAL_BUILD,refType:env.GITHUB_REF_TYPE,refName:env.GITHUB_REF_NAME,headRef:env.GITHUB_HEAD_REF});
}
/** Distinct, fixed output routing keeps preview builds out of stable releases. */
export function experimentalPackageOptions(version,metadata){
 if(!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version))throw Error('Invalid package version.');
 if(!metadata.experimental)throw Error('Experimental packaging requires experimental build metadata.');
 if(!/^[0-9a-f]{7,8}$/.test(metadata.shortCommit))throw Error('A Git commit is required to identify this experimental build.');
 return {output:'experimental-release',artifactName:`3DGS Perspectives Studio ${version} Experimental ${metadata.shortCommit}${metadata.dirty?'-dirty':''}.exe`,publish:'never'};
}
