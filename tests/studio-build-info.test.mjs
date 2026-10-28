import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {studioBuildInfo,readStudioBuildInfo,experimentalPackageOptions} from '../scripts/studio-build-info.mjs';
const commit='A123B456'+'C'.repeat(32);

test('experimental branch detection leaves main, ordinary branches and release tags stable',()=>{
 assert.equal(studioBuildInfo({branch:'main',commit}).experimental,false);
 assert.equal(studioBuildInfo({branch:'codex/editor-polish',commit}).experimental,false);
 assert.equal(studioBuildInfo({branch:'codex/experimental-experience-2026-10-28',commit}).experimental,true);
 assert.equal(studioBuildInfo({branch:'feature/codex/experimental-tools',commit}).experimental,false);
 assert.equal(studioBuildInfo({refType:'tag',refName:'v1.22.3',commit}).experimental,false);
 assert.equal(studioBuildInfo({branch:'codex/experimental-preview',refType:'tag',refName:'v1.22.3',commit}).experimental,false,'tag CI must not be labeled experimental by a leftover branch name');
});

test('explicit build overrides and detached CI refs resolve predictably',()=>{
 for(const override of ['1','true'])assert.equal(studioBuildInfo({branch:'main',override}).experimental,true);
 for(const override of ['0','false'])assert.equal(studioBuildInfo({branch:'codex/experimental-preview',override}).experimental,false);
 assert.equal(studioBuildInfo({branch:'codex/experimental-preview',override:''}).experimental,true);
 assert.equal(studioBuildInfo({refType:'branch',refName:'codex/experimental-preview'}).experimental,true);
 assert.equal(studioBuildInfo({refName:'123/merge',headRef:'codex/experimental-preview'}).experimental,true);
 for(const override of ['yes','experimental','FALSE'])assert.throws(()=>studioBuildInfo({override}),/SPARK_EXPERIMENTAL_BUILD/);
});

test('Git metadata is read locally, normalized and available without a repository',()=>{
 const calls=[],git=args=>{calls.push(args);return args[0]==='branch'?'codex/experimental-preview':args[0]==='rev-parse'?commit:' M src/editor.tsx\n?? src/studio-build.ts';};
 const info=readStudioBuildInfo({git,env:{}});assert.equal(info.experimental,true);assert.equal(info.branch,'codex/experimental-preview');assert.equal(info.commit,commit.toLowerCase());assert.equal(info.shortCommit,'a123b456');assert.equal(info.dirty,true);assert.deepEqual(calls,[['branch','--show-current'],['rev-parse','HEAD'],['status','--porcelain','--untracked-files=normal']]);
 assert.deepEqual(readStudioBuildInfo({git:()=>'',env:{}}),{experimental:false,branch:'',commit:'',shortCommit:'',dirty:false});
 const detached=readStudioBuildInfo({git:()=>'',env:{GITHUB_REF_TYPE:'branch',GITHUB_REF_NAME:'codex/experimental-ci',GITHUB_SHA:commit}});assert.equal(detached.experimental,true);assert.equal(detached.shortCommit,'a123b456');
 const stable=readStudioBuildInfo({git,env:{SPARK_EXPERIMENTAL_BUILD:'0'}});assert.equal(stable.experimental,false);
});

test('experimental artifacts have a distinct ignored destination and safe commit-specific filename',async()=>{
 const info=studioBuildInfo({branch:'codex/experimental-preview',commit}),options=experimentalPackageOptions('1.22.3',info);
 assert.equal(options.output,'experimental-release');assert.equal(options.publish,'never');assert.equal(options.artifactName,'3DGS Perspectives Studio 1.22.3 Experimental a123b456.exe');assert.equal(path.basename(options.artifactName),options.artifactName);assert.notEqual(path.resolve(options.output),path.resolve('release'));
 assert.equal(experimentalPackageOptions('1.22.3',{...info,dirty:true}).artifactName,'3DGS Perspectives Studio 1.22.3 Experimental a123b456-dirty.exe');
 for(const version of ['../release','1.22.3/evil','',undefined])assert.throws(()=>experimentalPackageOptions(version,info),/Invalid package version/);
 assert.throws(()=>experimentalPackageOptions('1.22.3',{...info,experimental:false}),/requires experimental/);
 for(const shortCommit of ['','unknown','..\\release','a123b456.exe'])assert.throws(()=>experimentalPackageOptions('1.22.3',{...info,shortCommit}),/Git commit/);
 assert.match(await fs.readFile(new URL('../.gitignore',import.meta.url),'utf8'),/^experimental-release\/$/m);
});
