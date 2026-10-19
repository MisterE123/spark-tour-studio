import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3} from 'three';
import {dyno} from '@sparkjsdev/spark';
import {CollisionSelectionLayer} from '../src/collision-selection.ts';
import {compileSelection,selectionTextureData,SELECTION_TEXTURE_WIDTH} from '../shared/collision-selection.mjs';

const shape=(id,type='box',operation='add',position=[0,0,0])=>({id,type,operation,position,rotation:[.1,.3,0],size:[4,4,4]});
function meshStub(){return {objectModifier:undefined,compiles:0,updates:0,updateGenerator(){this.compiles++;},set needsUpdate(value){if(value)this.updates++;}};}

test('selection texture preserves rotated, ordered ball and box operations',()=>{
 const volumes=[shape('a'),shape('b','ball','remove',[1,0,0]),{...shape('c'),size:[.5,.5,.5]}],data=selectionTextureData(volumes),selected=compileSelection(volumes);
 const fromTexture=(point)=>{let yes=false;volumes.forEach((_,index)=>{const offset=index*SELECTION_TEXTURE_WIDTH*4,p=new Vector3(...point).applyMatrix4(new Matrix4().fromArray(data,offset)),ball=data[offset+16]>.5,inside=ball?p.lengthSq()<=1.0000001:Math.max(Math.abs(p.x),Math.abs(p.y),Math.abs(p.z))<=.5000001;if(inside)yes=data[offset+17]>.5;});return yes;};
 for(let x=-4;x<4;x+=.17)for(let y=-2;y<2;y+=.31)for(let z=-2;z<2;z+=.53)assert.equal(fromTexture([x,y,z]),selected(x,y,z));
 assert.equal(data.byteLength,10240);assert.throws(()=>selectionTextureData(Array(129).fill(shape('a'))),/128/);
});

test('moving, resizing and choosing shapes retain geometry and a single shader',()=>{
 const layer=new CollisionSelectionLayer(),mesh=meshStub(),box=shape('a'),ball=shape('b','ball'),object=layer.rebuild([box,ball],mesh,'a',true),surface=object.children[0],wall=layer.wallHandles()[0],program=mesh.objectModifier;let disposed=0;surface.geometry.addEventListener('dispose',()=>disposed++);
 assert.equal(mesh.compiles,1);const compilation=new dyno.Compilation(),shader=program.compile({inputs:{gsplat:'splatIn'},outputs:{gsplat:'splatOut'},compile:compilation}).join('\n');assert.match(shader,/texelFetch/);assert.equal(Object.keys(compilation.uniforms).length,2);
 for(let step=0;step<50;step++){object.position.x=.05*step;layer.preview(object);}
 assert.equal(mesh.compiles,1);assert.equal(mesh.objectModifier,program);assert.ok(mesh.updates>=50);
 layer.rebuild([{...box,position:[3,0,0]},ball],mesh,'a',true);assert.equal(layer.shapes.children[0],object);assert.equal(object.children[0],surface);assert.equal(layer.wallHandles()[0],wall);assert.equal(mesh.compiles,1);
 const updates=mesh.updates;layer.rebuild([{...box,position:[3,0,0]},ball],mesh,'b',false);assert.equal(mesh.compiles,1);assert.equal(mesh.updates,updates);assert.equal(disposed,0);
 layer.rebuild([ball],mesh,'b');assert.equal(disposed,1);assert.equal(mesh.compiles,1);layer.clear();assert.equal(mesh.compiles,2);assert.equal(mesh.objectModifier,undefined);assert.equal(layer.shapes.children.length,0);
});
