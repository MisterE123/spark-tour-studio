import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync,strFromU8} from 'fflate';
import {prepareRadixArtifacts} from '../scripts/radix-artifacts.mjs';
import {deliveryMetadata,deliveryName,runtimeName,converterNotices,digestFile,writeDeliveryZip,verifyDeliveryZip} from '../scripts/radix-delivery.mjs';

const license=await fs.readFile(new URL('../src/rendering/radix/vendor/LICENSE',import.meta.url));
const provenance=await fs.readFile(new URL('../src/rendering/radix/vendor/PROVENANCE.json',import.meta.url));
const metadata={version:'1.23.0',experimental:true,branch:'Experiemental-Radix-SOGS',commit:'0123456789abcdef0123456789abcdef01234567',shortCommit:'01234567',dirty:false,artifactName:'3DGS Perspectives Studio 1.23.0 Experimental 01234567.exe'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'radix delivery #100% '));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const write=async(name,bytes)=>{const file=path.join(root,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);};
 await write('experimental-release/studio-build.json',JSON.stringify(metadata));
 await write('experimental-release/'+metadata.artifactName,Buffer.from('MZ experimental portable fixture\0'.repeat(4)));
 await write('launcher/Launch Tour.exe',Buffer.from('MZ bundled launcher fixture'));
 for(const file of ['LICENSE','THIRD_PARTY.md','RADIX_EXPERIMENT.md'])await write(file,'Original complete fixture '+file);
 await write('src/rendering/radix/vendor/LICENSE',license);
 await write('dist/.vite/manifest.json',JSON.stringify({'index.html':{file:'assets/viewer.js',css:['assets/viewer.css'],assets:['assets/sort-worker.js'],dynamicImports:['runtime']},runtime:{file:'assets/runtime.js',assets:['assets/local.wasm']}}));
 for(const file of ['index.html','assets/viewer.js','assets/viewer.css','assets/sort-worker.js','assets/runtime.js','assets/local.wasm','performance-spec/presets.json'])await write('dist/'+file,Buffer.from('visitor fixture '+file));
 await write('dist/editor.html','Never ship the browser editor.');
 await write('dist/licenses/Radix-LICENSE.txt',license);await write('dist/licenses/Radix-PROVENANCE.json',provenance);await write('dist/licenses/Radix-SOGS-ADAPTER.md','Full adapted example source provenance and local changes.');await write('dist/licenses/other.txt','Another full dependency notice.');
 for(const name of converterNotices)await write('sogs-tools/licenses/'+name,'Full converter fixture notice '+name);
 return {root,write,archive:path.join(root,'experimental-artifacts',deliveryName(metadata))};
}
function manifest(text){return new Map(text.trim().split(/\r?\n/).map(line=>{const match=/^([a-f0-9]{64})  (.+)$/.exec(line);assert.ok(match,line);return [match[2],match[1]];}));}

test('Radix experimental delivery is a complete named Windows ZIP with exact binaries, licenses and independent internal/external checksums',async t=>{
 const f=await fixture(t),prepared=await prepareRadixArtifacts(f.root);assert.equal(prepared.path,f.archive);
 const entries=unzipSync(await fs.readFile(f.archive)),expected=[metadata.artifactName,'Launch-Tour-Experimental.exe',runtimeName(metadata),'LICENSE','THIRD_PARTY.md','RADIX_EXPERIMENT.md','studio-build.json','README.txt','RELEASE_NOTES.md','SHA256SUMS.txt','licenses/Radix-LICENSE.txt','licenses/Radix-PROVENANCE.json','licenses/Radix-SOGS-ADAPTER.md','licenses/other.txt',...converterNotices.map(name=>'sogs-tools-licenses/'+name)];
 assert.deepEqual(Object.keys(entries).sort(),expected.sort());
 assert.deepEqual(Buffer.from(entries[metadata.artifactName]),await fs.readFile(path.join(f.root,'experimental-release',metadata.artifactName)));assert.deepEqual(Buffer.from(entries['Launch-Tour-Experimental.exe']),await fs.readFile(path.join(f.root,'launcher/Launch Tour.exe')));
 assert.deepEqual(Buffer.from(entries['licenses/Radix-LICENSE.txt']),license);assert.deepEqual(Buffer.from(entries['licenses/Radix-PROVENANCE.json']),provenance);for(const name of converterNotices)assert.deepEqual(Buffer.from(entries['sogs-tools-licenses/'+name]),await fs.readFile(path.join(f.root,'sogs-tools/licenses',name)));
 const inner=manifest(strFromU8(entries['SHA256SUMS.txt']));assert.equal(inner.size,expected.length-1);assert.ok(!inner.has('SHA256SUMS.txt'));assert.ok(!inner.has(path.basename(f.archive)));for(const [name,hash]of inner)assert.equal(sha(entries[name]),hash,name);
 const outer=manifest(await fs.readFile(path.join(prepared.out,'SHA256SUMS.txt'),'utf8')),loose=await fs.readdir(prepared.out);assert.deepEqual([...outer.keys()].sort(),loose.filter(name=>name!=='SHA256SUMS.txt').sort());assert.ok(outer.has(path.basename(f.archive)));assert.ok(!outer.has('SHA256SUMS.txt'));for(const [name,hash]of outer){assert.ok(!name.includes('/'),'Every externally checksummed file is an actual top-level release attachment.');assert.equal(await digestFile(path.join(prepared.out,name)),hash);}
 const readme=strFromU8(entries['README.txt']);assert.match(readme,/Extract the complete ZIP/);assert.match(readme,/COPY of an existing project/);assert.match(readme,/not an authored tour/);assert.match(readme,/SHA256SUMS.txt INSIDE/);assert.match(readme,/WORLD LABS|World Labs/);
 const runtime=unzipSync(entries[runtimeName(metadata)]);assert.ok(runtime['index.html']);assert.ok(runtime['assets/runtime.js']);assert.ok(runtime['assets/local.wasm']);assert.ok(runtime['assets/sort-worker.js']);assert.ok(!runtime['editor.html']);assert.deepEqual(Buffer.from(runtime['licenses/Radix-LICENSE.txt']),license);
 const verified=await verifyDeliveryZip(f.archive);assert.equal(verified.metadata.commit,metadata.commit);assert.equal(verified.sha256,outer.get(path.basename(f.archive)));
});

test('Radix delivery accepts only clean, exact-branch, matching commit and artifact metadata',()=>{
 for(const bad of [{dirty:true},{experimental:false},{branch:'main'},{shortCommit:'76543210'},{commit:'not-a-commit'},{version:'../1.23.0'},{artifactName:'../editor.exe'},{artifactName:'old-editor.exe'}])assert.throws(()=>deliveryMetadata({...metadata,...bad}),/clean identified|Invalid experimental artifact/);
 assert.equal(deliveryName(metadata),'3DGS-Perspectives-Studio-1.23.0-Radix-SOGS-Experimental-01234567-windows-x64.zip');
});

test('missing/incomplete inputs never replace a previously complete experimental delivery',async t=>{
 for(const missing of ['experimental-release/'+metadata.artifactName,'launcher/Launch Tour.exe','dist/assets/local.wasm','dist/licenses/Radix-PROVENANCE.json','sogs-tools/licenses/Node.txt']){
  const f=await fixture(t),out=path.join(f.root,'experimental-artifacts');await fs.mkdir(out);await fs.writeFile(path.join(out,'previous.zip'),'Previous verified delivery');await fs.unlink(path.join(f.root,missing));
  await assert.rejects(prepareRadixArtifacts(f.root),/ENOENT|Missing experimental ZIP entry|Missing packaged converter notice/);assert.equal(await fs.readFile(path.join(out,'previous.zip'),'utf8'),'Previous verified delivery');assert.deepEqual(await fs.readdir(path.join(f.root,'test-output')),[]);
 }
 const f=await fixture(t);await f.write('dist/licenses/Radix-LICENSE.txt','An attribution link is not the complete MIT license.');await assert.rejects(prepareRadixArtifacts(f.root),/Full World Labs license missing/);await assert.rejects(fs.access(f.archive));
});

test('experimental ZIP verification rejects altered bytes, missing notices, extra payloads, broken manifests and truncation',async t=>{
 const f=await fixture(t);await prepareRadixArtifacts(f.root);const original=unzipSync(await fs.readFile(f.archive));
 const cases=[
  ['changed editor',entries=>{entries[metadata.artifactName]=Buffer.from('different binary');},/checksum mismatch/],
  ['missing launcher',entries=>{delete entries['Launch-Tour-Experimental.exe'];},/Missing experimental ZIP entry/],
  ['missing full adapter license',entries=>{delete entries['licenses/Radix-LICENSE.txt'];},/Missing experimental ZIP entry/],
  ['extra executable',entries=>{entries['unknown.exe']=Buffer.from('unreviewed');},/Incomplete experimental checksum manifest/],
  ['checksum self-cycle',entries=>{entries['SHA256SUMS.txt']=Buffer.from(strFromU8(entries['SHA256SUMS.txt'])+sha(entries['SHA256SUMS.txt'])+'  SHA256SUMS.txt\n');},/Invalid experimental checksum manifest/],
  ['traversal entry',entries=>{entries['../outside.exe']=Buffer.from('unsafe');},/Unsafe experimental artifact path/]
 ];
 for(const [name,change,message]of cases){const entries={...original};change(entries);const file=path.join(f.root,name+'.zip');await fs.writeFile(file,zipSync(entries,{level:0}));await assert.rejects(verifyDeliveryZip(file),message,name);}
 const truncated=path.join(f.root,'truncated.zip'),bytes=await fs.readFile(f.archive);await fs.writeFile(truncated,bytes.subarray(0,bytes.length-10));await assert.rejects(verifyDeliveryZip(truncated),/Incomplete experimental ZIP/);
});

test('ZIP reread compares every entry with the source hashes and rejects duplicate entries',async t=>{
 const f=await fixture(t);await prepareRadixArtifacts(f.root);const entries=unzipSync(await fs.readFile(f.archive)),hashes=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,sha(bytes)]));
 await verifyDeliveryZip(f.archive,{expectedHashes:hashes});hashes[metadata.artifactName]='0'.repeat(64);await assert.rejects(verifyDeliveryZip(f.archive,{expectedHashes:hashes}),/source checksum mismatch/);
 const duplicate=path.join(f.root,'duplicate.zip');await writeDeliveryZip(duplicate,path.join(f.root,'experimental-artifacts'),['LICENSE','LICENSE']);await assert.rejects(verifyDeliveryZip(duplicate),/Duplicate experimental ZIP entry/);
});

test('unsafe runtime dependency paths are rejected before preparing a publishable bundle',async t=>{
 const f=await fixture(t);await f.write('dist/.vite/manifest.json',JSON.stringify({'index.html':{file:'../private.js'}}));await assert.rejects(prepareRadixArtifacts(f.root),/Unsafe experimental artifact path/);await assert.rejects(fs.access(f.archive));
});
