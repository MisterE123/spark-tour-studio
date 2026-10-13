import {BoxGeometry} from 'three';
export function doorway(gap){
 const vertices=[],faces=[];
 const box=(w,h,d,x,y,z)=>{const g=new BoxGeometry(w,h,d);g.translate(x,y,z);const offset=vertices.length/3;vertices.push(...g.attributes.position.array);faces.push(...Array.from(g.index.array,index=>index+offset));g.dispose();};
 box(14,.2,14,0,-.1,0);const length=(14-gap)/2,z=(14+gap)/4;box(.3,3,length,0,1.5,z);box(.3,3,length,0,1.5,-z);
 return {positions:new Float32Array(vertices),indices:new Uint32Array(faces)};
}
