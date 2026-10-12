// Geometry and GLB packaging authored for Spark Tour. Meshing libraries supply
// vertices/triangles only; no Lichtfeld extension source is included here.
export function finishSurface(surface,grid,inverse){
 const {positions,indices}=surface;
 if(!positions.length||indices.length%3||indices.length>6000000)throw Error('Collision surface exceeds two million triangles or is empty. Choose coarser detail.');
 if(grid){const roofY=grid.roof*grid.detail;let top=-Infinity;for(let i=1;i<positions.length;i+=3)top=Math.max(top,positions[i]);if(top>roofY)for(let i=1;i<positions.length;i+=3)if(positions[i]>=roofY)positions[i]=roofY+(positions[i]-roofY)*(grid.ceiling-roofY)/(top-roofY);}
 let volume=0;const origin=[positions[0],positions[1],positions[2]];
 for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;if(c+2>=positions.length||b+2>=positions.length||a+2>=positions.length)throw Error('Invalid collision triangle.');const ax=positions[a]-origin[0],ay=positions[a+1]-origin[1],az=positions[a+2]-origin[2],bx=positions[b]-origin[0],by=positions[b+1]-origin[1],bz=positions[b+2]-origin[2],cx=positions[c]-origin[0],cy=positions[c+1]-origin[1],cz=positions[c+2]-origin[2];volume+=ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx);}
 if(volume<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 if(inverse){const m=inverse.elements;for(let i=0;i<positions.length;i+=3){const x=positions[i],y=positions[i+1],z=positions[i+2];positions[i]=m[0]*x+m[4]*y+m[8]*z+m[12];positions[i+1]=m[1]*x+m[5]*y+m[9]*z+m[13];positions[i+2]=m[2]*x+m[6]*y+m[10]*z+m[14];}}
 const normals=new Float32Array(positions.length),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(let i=0;i<positions.length;i++){if(!Number.isFinite(positions[i]))throw Error('Collision surface contains an invalid vertex.');min[i%3]=Math.min(min[i%3],positions[i]);max[i%3]=Math.max(max[i%3],positions[i]);}
 for(let i=0;i<indices.length;i+=3){const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,x=positions[b]-positions[a],y=positions[b+1]-positions[a+1],z=positions[b+2]-positions[a+2],u=positions[c]-positions[a],v=positions[c+1]-positions[a+1],w=positions[c+2]-positions[a+2],n=[y*w-z*v,z*u-x*w,x*v-y*u];for(const id of [a,b,c])for(let k=0;k<3;k++)normals[id+k]+=n[k];}
 for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2]);if(length)for(let k=0;k<3;k++)normals[i+k]/=length;}
 return {positions,indices,normals,min,max};
}
export function collisionGlb(surface,metadata={}){
 const {positions,normals,indices,min,max}=surface,binLength=positions.byteLength+normals.byteLength+indices.byteLength;
 const doc={asset:{version:'2.0',generator:'Spark Tour collision builder'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{name:'Collision enclosure',primitives:[{attributes:{POSITION:0,NORMAL:1},indices:2,mode:4}],extras:metadata}],buffers:[{byteLength:binLength}],bufferViews:[{buffer:0,byteOffset:0,byteLength:positions.byteLength,target:34962},{buffer:0,byteOffset:positions.byteLength,byteLength:normals.byteLength,target:34962},{buffer:0,byteOffset:positions.byteLength+normals.byteLength,byteLength:indices.byteLength,target:34963}],accessors:[{bufferView:0,componentType:5126,count:positions.length/3,type:'VEC3',min,max},{bufferView:1,componentType:5126,count:normals.length/3,type:'VEC3'},{bufferView:2,componentType:5125,count:indices.length,type:'SCALAR'}]};
 const json=new TextEncoder().encode(JSON.stringify(doc)),jsonSize=Math.ceil(json.length/4)*4,bytes=new Uint8Array(28+jsonSize+binLength),head=new DataView(bytes.buffer);head.setUint32(0,0x46546c67,true);head.setUint32(4,2,true);head.setUint32(8,bytes.length,true);head.setUint32(12,jsonSize,true);head.setUint32(16,0x4e4f534a,true);bytes.fill(32,20,20+jsonSize);bytes.set(json,20);head.setUint32(20+jsonSize,binLength,true);head.setUint32(24+jsonSize,0x004e4942,true);let offset=28+jsonSize;for(const array of [positions,normals,indices]){bytes.set(new Uint8Array(array.buffer,array.byteOffset,array.byteLength),offset);offset+=array.byteLength;}return bytes;
}
