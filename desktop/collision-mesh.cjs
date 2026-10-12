const fs=require('node:fs/promises');const path=require('node:path');const crypto=require('node:crypto');const {contained}=require('./server.cjs');
function validateCollision(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<28||bytes.byteLength>160*1024*1024)throw Error('Invalid collision mesh size.');
 const data=Buffer.from(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(data.readUInt32LE(0)!==0x46546c67||data.readUInt32LE(4)!==2||data.readUInt32LE(8)!==data.length||data.readUInt32LE(16)!==0x4e4f534a)throw Error('Expected a complete GLB 2.0 collision mesh.');
 const length=data.readUInt32LE(12),offset=20+length;
 if(length>1024*1024||length%4||offset+8>data.length||data.readUInt32LE(offset+4)!==0x004e4942||offset+8+data.readUInt32LE(offset)!==data.length)throw Error('Invalid collision mesh chunks.');
 let doc;try{doc=JSON.parse(data.toString('utf8',20,offset));}catch{throw Error('Invalid collision mesh metadata.');}
 if(doc.asset?.version!=='2.0'||doc.buffers?.length!==1||doc.buffers[0].uri||doc.buffers[0].byteLength!==data.length-offset-8||doc.meshes?.length!==1||doc.meshes[0].primitives?.length!==1)throw Error('Collision mesh must contain one embedded surface.');
 const p=doc.meshes[0].primitives[0],vertices=doc.accessors?.[p.attributes?.POSITION],triangles=doc.accessors?.[p.indices];
 if(p.mode!==4||vertices?.componentType!==5126||vertices?.type!=='VEC3'||!Number.isSafeInteger(vertices.count)||vertices.count<3||vertices.count>4000000||triangles?.componentType!==5125||triangles?.type!=='SCALAR'||!Number.isSafeInteger(triangles.count)||triangles.count<3||triangles.count%3||triangles.count>6000000)throw Error('Invalid collision mesh geometry.');
 for(const accessor of [vertices,triangles]){const view=doc.bufferViews?.[accessor.bufferView],size=accessor===vertices?12:4;if(!view||view.buffer!==0||!Number.isSafeInteger(view.byteOffset)||view.byteOffset<0||view.byteOffset%4||view.byteLength!==accessor.count*size||view.byteOffset+view.byteLength>doc.buffers[0].byteLength||accessor.byteOffset)throw Error('Collision data exceeds its embedded buffer.');}
 const positionOffset=offset+8+doc.bufferViews[vertices.bufferView].byteOffset,indexOffset=offset+8+doc.bufferViews[triangles.bufferView].byteOffset;
 for(let i=0;i<vertices.count*3;i++)if(!Number.isFinite(data.readFloatLE(positionOffset+i*4)))throw Error('Invalid collision vertex.');
 for(let i=0;i<triangles.count;i++)if(data.readUInt32LE(indexOffset+i*4)>=vertices.count)throw Error('Invalid collision triangle index.');
 return data;
}
async function saveCollisionMesh(projectRoot,bytes){
 const data=validateCollision(bytes),relative='colliders/'+crypto.randomUUID()+'.collision.glb',folder=path.join(projectRoot,'colliders');await fs.mkdir(folder,{recursive:true});if(!contained(await fs.realpath(projectRoot),await fs.realpath(folder)))throw Error('Collision output folder leaves the project.');
 const target=path.join(projectRoot,relative),temporary=target+'.tmp';try{await fs.writeFile(temporary,data,{flag:'wx'});await fs.rename(temporary,target);}finally{await fs.rm(temporary,{force:true});}return relative;
}
module.exports={validateCollision,saveCollisionMesh};
