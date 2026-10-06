import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPagedRad } from '../shared/rad.mjs';
test('flat RAD containers are rejected before paged rendering or portable export',()=>{
 assert.throws(()=>assertPagedRad({count:34999724}),/34,999,724 splats but no LoD tree/);
 assert.throws(()=>assertPagedRad({count:1,lodTree:false}),/LoD hierarchy/);
 assert.doesNotThrow(()=>assertPagedRad({count:1,lodTree:true}));
});
