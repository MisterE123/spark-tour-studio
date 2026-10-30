import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const root=new URL('../src/rendering/radix/',import.meta.url);
test('pinned Radix distributions and full World Labs MIT notice retain original bytes',async()=>{
 const provenance=JSON.parse(await fs.readFile(new URL('vendor/PROVENANCE.json',root),'utf8'));
 assert.equal(provenance.name,'@sparkjsdev/radix');assert.equal(provenance.version,'0.0.1');assert.equal(provenance.license,'MIT');
 for(const [file,expected]of [['radix.module.js',provenance.moduleSha256],['radix-core.module.js',provenance.coreModuleSha256],['LICENSE','a43f71c4260b96d6ae73e29285fb8896cbe5c7e85996f7b5aa7cbb2a6dceaea2']])assert.equal(createHash('sha256').update(await fs.readFile(new URL('vendor/'+file,root))).digest('hex'),expected,file+' differs from its pinned published bytes');
 const notice=(await fs.readFile(new URL('vendor/LICENSE',root),'utf8')).replaceAll('\r','').trim(),third=(await fs.readFile(new URL('../THIRD_PARTY.md',import.meta.url),'utf8')).replaceAll('\r','');
 assert.ok(third.includes(notice),'full upstream permission notice accompanies the distinct adapter attribution');
 assert.match(third,/adapted \*\*SOGS \/ streamed LoD adapter\*\*/);assert.match(third,/PlayCanvas splat-transform/);
});

test('every adapted SOGS example identifies its upstream owner, license and exact source revision',async()=>{
 const provenance=JSON.parse(await fs.readFile(new URL('vendor/PROVENANCE.json',root),'utf8'));
 for(const file of Object.keys(provenance.originalExampleSha256)){
  const source=await fs.readFile(new URL('sog/'+file,root),'utf8');
  assert.ok(source.includes('SPDX-License-Identifier: MIT'),file);assert.ok(source.includes('WORLD LABS TECHNOLOGIES, INC.'),file);
  assert.ok(source.includes(provenance.exampleCommit+'/examples/sogs/'+file),file);assert.ok(source.includes('Local changes:'),file);
 }
});
