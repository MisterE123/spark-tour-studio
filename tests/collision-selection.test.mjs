import test from 'node:test';
import assert from 'node:assert/strict';
import {Matrix4,Vector3,PerspectiveCamera,Scene,Group} from 'three';
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

test('selected boxes expose six face handles by default and retain usable screen size',()=>{
 const layer=new CollisionSelectionLayer(),box=shape('box');layer.rebuild([box],undefined,'box');assert.equal(layer.wallHandles().length,6);
 const camera=new PerspectiveCamera(65,1,.05,1000);camera.position.set(0,0,10);layer.sizeHandles(camera,800);const handle=layer.wallHandles()[0],near=handle.scale.x;
 camera.position.set(0,0,100);layer.sizeHandles(camera,800);assert.ok(handle.scale.x>near*5);
 for(const face of layer.wallHandles()){const patch=layer.patch(face);assert.deepEqual(patch.size,box.size);}
 layer.rebuild([{...box,type:'ball'}],undefined,'box');assert.equal(layer.wallHandles().length,0);layer.clear();
});

test('face handles render in the overlay and follow transformed scene coordinates',()=>{
 const layer=new CollisionSelectionLayer(),content=new Group(),overlay=new Scene();content.position.set(3,5,-2);content.rotation.set(Math.PI,.3,0);content.scale.setScalar(2);content.add(layer.group);layer.mountHandles(overlay);
 const box=shape('overlay-box');layer.rebuild([box],undefined,box.id);layer.syncHandles();
 assert.equal(layer.wallHandles()[0].parent.parent,overlay);
 const face=layer.wallHandles()[0],expected=content.localToWorld(face.position.clone());assert.ok(face.getWorldPosition(new Vector3()).distanceTo(expected)<1e-8);
 content.position.x+=4;layer.syncHandles();assert.ok(face.getWorldPosition(new Vector3()).distanceTo(expected.add(new Vector3(4,0,0)))<1e-8);
 assert.equal(face.material.depthTest,false);assert.equal(face.material.transparent,true);assert.equal(face.children.length,1);assert.equal(face.children[0].material.depthTest,false);
 layer.clear();assert.equal(overlay.children[0].children.length,0);
});
