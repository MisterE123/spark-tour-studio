import test from 'node:test';
import assert from 'node:assert/strict';
import {finestSogLeafFiles,mergeSplatLeafRanges} from '../shared/splat-leaf-ranges.mjs';

function fixture(){
 const levels=3,leaves=4,files=['https://assets.test/fine/meta.json?token=abc','https://assets.test/coarse/meta.json','https://assets.test/coarsest/meta.json','https://assets.test/fallback/meta.json','https://assets.test/unused/meta.json','https://assets.test/fine/meta.json?token=abc#part'];
 return {levels,leaves,files,file:new Int32Array([0,1,2,0,1,2,-1,3,4,5,1,2]),offset:new Uint32Array([0,0,0,6,4,1,0,4,0,10,8,3]),count:new Uint32Array([8,4,2,8,4,2,0,5,2,6,4,2])};
}

test('finest leaves select level zero or the finest available fallback, never LoD ancestors',()=>{
 const tree=fixture(),before={file:tree.file.slice(),offset:tree.offset.slice(),count:tree.count.slice()},files=finestSogLeafFiles(tree);
 assert.deepEqual(files,[{url:'https://assets.test/fine/meta.json?token=abc',ranges:[{offset:0,count:16}]},{url:'https://assets.test/fallback/meta.json',ranges:[{offset:4,count:5}]}]);
 assert.deepEqual(tree.file,before.file);assert.deepEqual(tree.offset,before.offset);assert.deepEqual(tree.count,before.count);
 assert.ok(!files.some(file=>file.url.includes('/coarse/')));assert.ok(!files.some(file=>file.url.includes('/coarsest/')));
});

test('physical aliases union ranges but distinct signed query URLs stay separate',()=>{
 const tree=fixture();tree.files[5]='https://assets.test/fine/meta.json?token=other#part';
 const files=finestSogLeafFiles(tree);assert.equal(files.length,3);assert.equal(files[0].ranges[0].count,14);assert.equal(files[2].url,'https://assets.test/fine/meta.json?token=other');assert.deepEqual(files[2].ranges,[{offset:10,count:6}]);
});

test('environment source is visited once, including an environment alias of a leaf file',()=>{
 const tree=fixture();tree.environment='https://assets.test/environment/meta.json';
 assert.deepEqual(finestSogLeafFiles(tree).at(-1),{url:tree.environment,ranges:null});
 tree.environment=tree.files[0]+'#sky';const files=finestSogLeafFiles(tree);assert.equal(files.length,2);assert.equal(files[0].url,tree.files[0]);assert.equal(files[0].ranges,null);
});

test('range union preserves sparse disjoint gaps and validates against decoded file count',()=>{
 const ranges=[{offset:10,count:3},{offset:0,count:4},{offset:4,count:2},{offset:2,count:3},{offset:11,count:1},{offset:9,count:0}],before=structuredClone(ranges);
 assert.deepEqual(mergeSplatLeafRanges(ranges,13),[{offset:0,count:6},{offset:10,count:3}]);assert.deepEqual(ranges,before);
 for(const range of [{offset:-1,count:1},{offset:1.5,count:1},{offset:Infinity,count:1},{offset:0,count:NaN},{offset:0,count:14},{offset:0xffffffff,count:1},{offset:14,count:0}])assert.throws(()=>mergeSplatLeafRanges([range],13),/range exceeds/);
 assert.throws(()=>mergeSplatLeafRanges([],Infinity),/source splat count/);
});

test('invalid leaf tables, empty leaves and unsafe resource URLs fail before scanning',()=>{
 for(const patch of [{levels:0},{leaves:0},{file:new Int32Array(1)},{levels:33},{files:[]}])assert.throws(()=>finestSogLeafFiles({...fixture(),...patch}),/leaf table/);
 let tree=fixture();tree.file.fill(-1,0,3);assert.throws(()=>finestSogLeafFiles(tree),/no source splats/);
 tree=fixture();tree.file[0]=99;assert.throws(()=>finestSogLeafFiles(tree),/file index/);
 for(const reference of ['javascript:alert(1)','https://user:secret@assets.test/meta.json']){tree=fixture();tree.files[0]=reference;assert.throws(()=>finestSogLeafFiles(tree),/HTTP or HTTPS/);}
});
