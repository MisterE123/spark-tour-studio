import test from 'node:test';
import assert from 'node:assert/strict';
import {radixSourceIssue} from '../shared/radix-source.mjs';

test('retained RAD and unsupported sources are identified before renderer allocation',()=>{
 for(const source of ['old.rad','source-lod.RAD?cache=2#part','https://cdn.example/Scan%20%23100%25.rad','chunk.radc','old%2Erad'])assert.match(radixSourceIssue(source),/RAD rendering is unavailable/);
 for(const source of ['',undefined,null])assert.match(radixSourceIssue(source),/no splat source/);
 for(const source of ['scan.ply','scan.zip','wrong.json'])assert.match(radixSourceIssue(source),/cannot render/);
 for(const source of ['data:meta.json','file:///scan/meta.json','https://user:secret@example.com/meta.json'])assert.match(radixSourceIssue(source),/HTTP\(S\)/);
 for(const source of ['http://[','100%.sog'])assert.match(radixSourceIssue(source),/address is invalid/);
});
test('SOG and streamed SOG references retain encoded filename and URL semantics',()=>{
 for(const source of ['scan.sog','Scan%20%23100%25.sog','scan/meta.json','scan/lod-meta.json','https://cdn.example/scan/lod-meta.json?key=2#part'])assert.equal(radixSourceIssue(source),'');
});
