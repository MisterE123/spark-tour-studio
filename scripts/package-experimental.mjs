import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {readStudioBuildInfo,experimentalPackageOptions} from './studio-build-info.mjs';

if(process.platform!=='win32')throw Error('Build the Windows x64 experimental Studio on Windows.');
const root=fileURLToPath(new URL('../',import.meta.url)),env={...process.env,SPARK_EXPERIMENTAL_BUILD:'1'};
const {version}=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')),metadata=readStudioBuildInfo({cwd:root,env}),options=experimentalPackageOptions(version,metadata);
// npm supplies its own CLI path. Launch it through Node rather than relying on
// shell quoting or Windows .cmd execution; arguments containing spaces stay intact.
const npmCli=process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');
await fs.access(npmCli).catch(()=>{throw Error('Run this build with npm run package:experimental.');});
async function run(script,args=[]){
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:root,env,stdio:'inherit',windowsHide:true});child.on('error',reject);child.on('exit',(code,signal)=>code===0?resolve():reject(Error(`${path.basename(script)} failed (${signal||code}).`)));});
}
for(const task of ['build','bundle:github','launcher'])await run(npmCli,['run',task]);
await run(path.join(root,'node_modules','electron-builder','out','cli','cli.js'),['--win','portable','--x64','--publish',options.publish,`--config.directories.output=${options.output}`,`--config.artifactName=${options.artifactName}`]);
await fs.writeFile(path.join(root,options.output,'studio-build.json'),JSON.stringify({version,...metadata,artifactName:options.artifactName},null,2)+'\n');
console.log('Experimental Studio ready: '+path.join(root,options.output,options.artifactName));
