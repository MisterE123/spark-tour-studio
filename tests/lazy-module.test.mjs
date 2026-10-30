import test from 'node:test';import assert from 'node:assert/strict';
import {memoizedModule} from '../shared/lazy-module.mjs';

test('concurrent and later consumers share one module import',async()=>{
 let calls=0,release;const load=memoizedModule(()=>{calls++;return new Promise(resolve=>release=resolve);});
 const first=load(),second=load();assert.equal(first,second);await Promise.resolve();assert.equal(calls,1);
 const module={loaded:true};release(module);assert.equal(await first,module);assert.equal(load(),first);assert.equal(await load(),module);assert.equal(calls,1);
});
test('failed imports retry and do not replace a newer in-flight attempt',async()=>{
 let calls=0;const load=memoizedModule(async()=>{if(++calls===1)throw Error('network unavailable');return {loaded:true};});
 const failed=load();await assert.rejects(failed,/network unavailable/);const retried=load();assert.notEqual(retried,failed);assert.equal(load(),retried);assert.deepEqual(await retried,{loaded:true});assert.equal(calls,2);
});
test('synchronous importer failures are asynchronous and retryable',async()=>{
 let calls=0;const load=memoizedModule(()=>{if(++calls===1)throw Error('import setup');return Promise.resolve('ready');});
 await assert.rejects(load(),/import setup/);assert.equal(await load(),'ready');assert.equal(calls,2);
});
