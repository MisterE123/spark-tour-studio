import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {createHash} from 'node:crypto';import {zipSync,unzipSync,strFromU8} from 'fflate';
const execute=promisify(execFile),helper=path.resolve('scripts/release-zip.mjs'),publisher=path.resolve('scripts/publish-release.ps1');
const current={product:'3DGS Perspectives Studio',editor:'3DGS-Perspectives-Studio',runtime:'3DGS-Perspectives-Web-Runtime'},legacy={product:'Spark Tour Studio',editor:'Spark-Tour-Studio',runtime:'Spark-Tour-Web-Runtime'};
async function fixture(t,layout=current,version='1.22.0'){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'perspectives-release-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const names=[`${layout.editor}-${version}.exe`,'Launch-Tour.exe',`${layout.runtime}-${version}.zip`];let checksums='';
 for(const name of names){const bytes=Buffer.from('release fixture '+name);await fs.writeFile(path.join(root,name),bytes);checksums+=createHash('sha256').update(bytes).digest('hex')+'  '+name+'\n';}
 await fs.writeFile(path.join(root,'SHA256SUMS.txt'),checksums);await fs.writeFile(path.join(root,'LICENSE'),'fixture MIT license');await fs.writeFile(path.join(root,'THIRD_PARTY.md'),'fixture component notices');
 return {root,names,version,layout,archive:path.join(root,`${layout.editor}-${version}-windows-x64.zip`)};
}
const run=(...args)=>execute(process.execPath,[helper,...args]);

test('current release ZIP uses the exact new product and artifact names, retaining the compatible launcher name',async t=>{
 const f=await fixture(t);await run('pack',f.root,f.version);const entries=unzipSync(await fs.readFile(f.archive));assert.deepEqual(Object.keys(entries).sort(),[...f.names,'LICENSE','THIRD_PARTY.md','SHA256SUMS.txt','README.txt'].sort());const readme=strFromU8(entries['README.txt']);assert.ok(readme.startsWith('3DGS Perspectives Studio 1.22.0 - Windows x64\n'));assert.ok(readme.includes('3DGS-Perspectives-Studio-1.22.0.exe'));assert.ok(readme.includes('3DGS-Perspectives-Web-Runtime-1.22.0.zip'));assert.ok(readme.includes('Launch-Tour.exe'));assert.ok(!readme.includes('Spark Tour'));await run('verify',f.archive,f.version);
});

test('previous Spark release layouts remain verifiable and can be recovered without renaming existing release ZIPs',async t=>{
 const f=await fixture(t,legacy,'1.21.3');await run('pack',f.root,f.version);await run('verify',f.archive,f.version);const entries=unzipSync(await fs.readFile(f.archive));assert.ok(strFromU8(entries['README.txt']).startsWith('Spark Tour Studio 1.21.3'));assert.ok(entries['Spark-Tour-Studio-1.21.3.exe']);await assert.rejects(fs.access(path.join(f.root,'3DGS-Perspectives-Studio-1.21.3-windows-x64.zip')));
});

test('release verification rejects changed binaries, additional assets and mixed branding instead of trusting filenames',async t=>{
 const f=await fixture(t);await run('pack',f.root,f.version);const entries=unzipSync(await fs.readFile(f.archive));
 for(const mutation of ['bytes','extra','mixed']){const changed={...entries};if(mutation==='bytes')changed[f.names[0]]=Buffer.from('changed editor');if(mutation==='extra')changed['unreviewed.exe']=Buffer.from('extra executable');if(mutation==='mixed'){changed[`Spark-Tour-Studio-${f.version}.exe`]=changed[f.names[0]];delete changed[f.names[0]];}const archive=path.join(f.root,mutation+'.zip');await fs.writeFile(archive,zipSync(changed));await assert.rejects(run('verify',archive,f.version),error=>/Checksum mismatch|Unexpected release ZIP entry|Missing release file/.test(error.stderr));}
});

test('packing rejects incomplete or invalid-version artifacts before producing a release',async t=>{
 const f=await fixture(t);await fs.unlink(path.join(f.root,'Launch-Tour.exe'));await assert.rejects(run('pack',f.root,f.version),error=>/Missing release file/.test(error.stderr));await assert.rejects(run('pack',f.root,'../invalid'),error=>/Invalid release version/.test(error.stderr));await assert.rejects(fs.access(f.archive));
});

for(const lowercaseDrive of [false,true])test('manual publishing recovers a tested pre-rename workflow and space-named loose assets with local-only mocked GitHub calls'+(lowercaseDrive?' despite Windows path casing':''),{skip:process.platform!=='win32'},async t=>{
 const f=await fixture(t,legacy,'1.21.3');
 // PowerShell Resolve-Path canonicalizes the drive, including on CI runners
 // whose TEMP spelling differs. Exercise that difference on every Windows run.
 if(lowercaseDrive){f.root=f.root[0].toLowerCase()+f.root.slice(1);f.archive=path.join(f.root,path.basename(f.archive));}
 const download=path.join(f.root,'download');await fs.mkdir(download);for(const name of [...f.names,'LICENSE','THIRD_PARTY.md'])await fs.rename(path.join(f.root,name),path.join(download,name));
 const oldNames=[`Spark Tour Studio ${f.version}.exe`,'Launch Tour.exe',f.names[2]];await fs.rename(path.join(download,f.names[0]),path.join(download,oldNames[0]));await fs.rename(path.join(download,f.names[1]),path.join(download,oldNames[1]));let checksums='';for(const name of oldNames)checksums+=createHash('sha256').update(await fs.readFile(path.join(download,name))).digest('hex')+'  '+name+'\n';await fs.writeFile(path.join(download,'SHA256SUMS.txt'),checksums);
 const literal=value=>"'"+value.replaceAll("'","''")+"'",wrapper=path.join(f.root,'mock-publish.ps1');
 await fs.writeFile(wrapper,`$ErrorActionPreference='Stop'
$global:Calls=[Collections.Generic.List[object]]::new()
$global:Sha='0123456789012345678901234567890123456789'
$global:Download=${literal(download)}
$global:Node=${literal(process.execPath)}
$global:Helper=${literal(helper)}
function gh {
 $a=@($args);$global:Calls.Add($a);$global:LASTEXITCODE=0
 if($a[0] -eq 'run' -and $a[1] -eq 'view'){return (@{headSha=$global:Sha;workflowName='Build Spark Tour Studio';jobs=@(@{name='Windows x64 checks and package';conclusion='success'})}|ConvertTo-Json -Depth 5 -Compress)}
 if($a[0] -eq 'api'){return $global:Sha}
 if($a[0] -eq 'run' -and $a[1] -eq 'download'){
  if($a -contains ('3DGS-Perspectives-Studio-windows-x64-'+$global:Sha)){$global:LASTEXITCODE=1;return}
  if($a -notcontains ('spark-tour-studio-windows-x64-'+$global:Sha)){throw 'Unexpected download artifact'}
  New-Item -ItemType Directory -Path artifacts -Force|Out-Null
  Get-ChildItem -LiteralPath $global:Download -File|ForEach-Object{Copy-Item -LiteralPath $_.FullName -Destination (Join-Path artifacts $_.Name)}
  return
 }
 if($a[0] -eq 'release' -and $a[1] -eq 'view'){
  if($a -contains 'tagName'){$global:LASTEXITCODE=1;return}
  return (@{assets=@(@{name='Spark-Tour-Studio-${f.version}.exe'},@{name='Launch-Tour.exe'},@{name='Spark-Tour-Studio-${f.version}-windows-x64.zip'})}|ConvertTo-Json -Depth 5 -Compress)
 }
 if($a[0] -eq 'release' -and $a[1] -in @('create','delete-asset')){return}
 throw ('Unexpected GitHub call: '+($a -join ' '))
}
function node {& $global:Node $global:Helper @($args|Select-Object -Skip 1);$global:LASTEXITCODE=$LASTEXITCODE}
& ${literal(publisher)}
[IO.File]::WriteAllText((Join-Path $PWD 'calls.json'),(ConvertTo-Json -InputObject @($global:Calls) -Depth 5))
`);
 await execute('pwsh.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',wrapper],{cwd:f.root,env:{...process.env,RELEASE_TAG:'v'+f.version,BUILD_RUN_ID:'12345',GITHUB_REPOSITORY:'fixture/local-only'},maxBuffer:1024*1024});
 const archive=path.join(f.root,'artifacts',path.basename(f.archive));await run('verify',archive,f.version);const calls=JSON.parse(await fs.readFile(path.join(f.root,'calls.json'),'utf8')),downloads=calls.filter(a=>a[0]==='run'&&a[1]==='download');assert.equal(downloads.length,2);assert.ok(downloads[0].includes('3DGS-Perspectives-Studio-windows-x64-0123456789012345678901234567890123456789'));assert.ok(downloads[1].includes('spark-tour-studio-windows-x64-0123456789012345678901234567890123456789'));const create=calls.find(a=>a[0]==='release'&&a[1]==='create');assert.ok(create,'the verified archive is published');assert.equal(create.filter(arg=>/\.zip$/i.test(arg)).length,1,'publish exactly one release ZIP');assert.equal(await fs.realpath(create[3]),await fs.realpath(archive),'publish the exact verified file despite equivalent Windows path spellings');if(lowercaseDrive)assert.notEqual(create[3],archive,'the case-variant fixture must exercise distinct path spellings');assert.ok(create.includes('Spark Tour Studio v1.21.3'));const removed=calls.filter(a=>a[0]==='release'&&a[1]==='delete-asset').map(a=>a[3]);assert.deepEqual(removed,['Spark-Tour-Studio-1.21.3.exe','Launch-Tour.exe']);
});
