// Minimal, synthetic RAD v1 fixture following Spark's public RAD0/RADC layout.
// One leaf splat: useful for exercising actual WASM metadata/streaming without a scan.
function envelope(magic,meta,payload=Buffer.alloc(0)){const json=Buffer.from(JSON.stringify(meta));const head=Buffer.alloc(8+Math.ceil(json.length/8)*8);head.write(magic);head.writeUInt32LE(json.length,4);json.copy(head,8);const size=magic==='RADC'?Buffer.alloc(8):Buffer.alloc(0);if(size.length)size.writeBigUInt64LE(BigInt(payload.length));return Buffer.concat([head,size,payload]);}
export function radFixture(chunkFilename){
 const properties=[],parts=[];let offset=0;
 for(const [property,values,encoding] of [['center',[0,1.7,0],'f32'],['alpha',[1],'f32'],['rgb',[.18,.85,.65],'f32'],['scales',[.5,.5,.5],'f32'],['orientation',[0,0,0],'f32'],['child_count',[0],'u16'],['child_start',[0],'u32']]){const stride=encoding==='u16'?2:4;const bytes=Buffer.alloc(Math.ceil(values.length*stride/8)*8);values.forEach((x,i)=>encoding==='f32'?bytes.writeFloatLE(x,i*stride):encoding==='u16'?bytes.writeUInt16LE(x,i*stride):bytes.writeUInt32LE(x,i*stride));properties.push({offset,bytes:values.length*stride,property,encoding});offset+=bytes.length;parts.push(bytes);}
 const chunk=envelope('RADC',{version:1,base:0,count:1,payloadBytes:offset,maxSh:0,lodTree:true,properties},Buffer.concat(parts));
 const meta={version:1,type:'gsplat',count:1,maxSh:0,lodTree:true,chunkSize:65536,allChunkBytes:chunk.length,chunks:[{offset:0,bytes:chunk.length,...(chunkFilename?{filename:chunkFilename}:{})}]};
 return {rad:envelope('RAD0',meta,chunkFilename?undefined:chunk),chunk,meta};
}
// A 20-meter floor GLB, used to exercise the real GLTFLoader and collider transform path.
export function floorGlb(){
 const vertices=new Float32Array([-10,0,-10,10,0,-10,10,0,10,-10,0,10]);const indices=new Uint32Array([0,2,1,0,3,2]);const bin=Buffer.concat([Buffer.from(vertices.buffer),Buffer.from(indices.buffer)]);
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:48,target:34962},{buffer:0,byteOffset:48,byteLength:24,target:34963}],accessors:[{bufferView:0,componentType:5126,count:4,type:'VEC3',min:[-10,0,-10],max:[10,0,10]},{bufferView:1,componentType:5125,count:6,type:'SCALAR'}]};const raw=Buffer.from(JSON.stringify(gltf)),json=Buffer.alloc(Math.ceil(raw.length/4)*4,32);raw.copy(json);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+bin.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([header,json,bh,bin]);
}
export function plyFixture(count=128){
 const fields=['x','y','z','f_dc_0','f_dc_1','f_dc_2','opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
 const header=Buffer.from(`ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n${fields.map(f=>'property float '+f).join('\n')}\nend_header\n`);
 const data=Buffer.alloc(count*fields.length*4);for(let i=0;i<count;i++){const row=[(i%8-3.5)*.12,1.7+(Math.floor(i/8)%8-3.5)*.12,Math.floor(i/64)*.08,0,1,0,4,-2.8,-2.8,-2.8,1,0,0,0];row.forEach((v,j)=>data.writeFloatLE(v,(i*fields.length+j)*4));}return Buffer.concat([header,data]);
}
