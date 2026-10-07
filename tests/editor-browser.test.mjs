import test from 'node:test';import assert from 'node:assert/strict';
import {browserItems,editorLayout} from '../shared/editor-browser.mjs';
test('browser sorting/filtering preserves authored order and stable ties',()=>{
 const items=[{id:'a',label:'Bubble 10',kind:'page'},{id:'b',label:'Bubble 2',kind:'scene'},{id:'c',label:'Bubble 2',kind:'page',createdAt:100}];
 assert.deepEqual(browserItems(items).map(row=>row.item.id),['b','c','a']);
 assert.deepEqual(browserItems(items,{query:'bubble',type:'page',sort:'created'}).map(row=>row.item.id),['a','c']);
 assert.deepEqual(browserItems(items,{sort:'distance',distance:item=>item.id==='a'?10:2,descending:true}).map(row=>row.item.id),['a','b','c']);
 assert.deepEqual(items.map(item=>item.id),['a','b','c']);
});
test('editor panel layout bounds corrupt preferences and keeps restore state',()=>{
 assert.deepEqual(editorLayout({left:-1,right:9999,browser:false},1000),{left:180,right:500,browser:false,inspector:true});
 const layout=editorLayout({left:300,right:400,inspector:false},1600);assert.equal(layout.left,300);assert.equal(layout.right,400);assert.equal(layout.inspector,false);
});
