import {z} from 'zod';import {Matrix4,Quaternion,Euler,Vector3} from 'three';
const finite=z.number().finite(),vec=z.tuple([finite,finite,finite]);
export const CollisionVolumeSchema=z.object({id:z.string().regex(/^[\w-]+$/),type:z.enum(['ball','box']),operation:z.enum(['add','remove']),position:vec,rotation:vec,size:z.tuple([finite.positive(),finite.positive(),finite.positive()])});
export const CollisionOptionsSchema=z.object({detail:z.union([z.literal(.05),z.literal(.1),z.literal(.2),z.literal(.5),z.literal(1)]).default(.1),surface:z.enum(['smooth','blocky']).default('smooth'),smoothing:finite.min(0).max(.45).default(.35),wallHeight:finite.min(.5).max(10).default(3),ignoreTransparent:z.boolean().default(true),opacityCutoff:finite.min(.01).max(.95).default(.15)});
export const CollisionAuthoringSchema=z.object({volumes:z.array(CollisionVolumeSchema).max(128).default([]),options:CollisionOptionsSchema.prefault({})});
export const sceneMatrix=t=>new Matrix4().compose(new Vector3(...t.position),new Quaternion().setFromEuler(new Euler(...t.rotation,'YXZ')),new Vector3(t.scale,t.scale,t.scale));
export function volumeMatrix(volume){const scale=volume.type==='ball'?[volume.size[0],volume.size[0],volume.size[0]]:volume.size;return new Matrix4().compose(new Vector3(...volume.position),new Quaternion().setFromEuler(new Euler(...volume.rotation,'YXZ')),new Vector3(...scale));}
export function compileSelection(volumes){const compiled=volumes.map(volume=>({inverse:volumeMatrix(volume).invert().elements,ball:volume.type==='ball',add:volume.operation==='add'}));return (x,y,z)=>{let selected=false;for(const {inverse:m,ball,add} of compiled){const a=m[0]*x+m[4]*y+m[8]*z+m[12],b=m[1]*x+m[5]*y+m[9]*z+m[13],c=m[2]*x+m[6]*y+m[10]*z+m[14];if(ball?a*a+b*b+c*c<=1+1e-7:Math.max(Math.abs(a),Math.abs(b),Math.abs(c))<=.5+1e-7)selected=add;}return selected;};}
export function selectionStatements(volumes,input,output){const float=value=>Number(value).toExponential(9),lines=[`${output} = ${input};`,`bool collision_selected = false;`];for(let i=0;i<volumes.length;i++){const volume=volumes[i],m=volumeMatrix(volume).invert().elements,point=`collision_point_${i}`;lines.push(`vec3 ${point} = (mat4(${m.map(float).join(',')}) * vec4(${input}.center, 1.0)).xyz;`,`if (${volume.type==='ball'?`dot(${point}, ${point}) <= 1.0000001`:`max(max(abs(${point}.x),abs(${point}.y)),abs(${point}.z)) <= 0.5000001`}) collision_selected = ${volume.operation==='add'?'true':'false'};`);}lines.push(`if (collision_selected) ${output}.rgba.rgb = mix(${input}.rgba.rgb, vec3(0.20,0.92,0.72), 0.65);`);return lines;}
// One texture row per authored volume: four inverse-matrix columns and flags.
// Keeping shape data out of shader source avoids compilation while dragging.
export const SELECTION_TEXTURE_WIDTH=5,SELECTION_TEXTURE_HEIGHT=128;
export function selectionTextureData(volumes){
 if(volumes.length>SELECTION_TEXTURE_HEIGHT)throw Error('Selection exceeds 128 shapes.');
 const data=new Float32Array(SELECTION_TEXTURE_WIDTH*SELECTION_TEXTURE_HEIGHT*4);
 volumes.forEach((volume,index)=>{const offset=index*SELECTION_TEXTURE_WIDTH*4;data.set(volumeMatrix(volume).invert().elements,offset);data[offset+16]=volume.type==='ball'?1:0;data[offset+17]=volume.operation==='add'?1:0;});return data;
}
export function selectionTextureStatements(input,output,texture,count){return [
 `${output} = ${input};`,`bool collision_selected = false;`,
 `for (int collision_index = 0; collision_index < ${count}; ++collision_index) {`,
 `  mat4 collision_inverse = mat4(texelFetch(${texture}, ivec2(0,collision_index),0), texelFetch(${texture}, ivec2(1,collision_index),0), texelFetch(${texture}, ivec2(2,collision_index),0), texelFetch(${texture}, ivec2(3,collision_index),0));`,
 `  vec3 collision_point = (collision_inverse * vec4(${input}.center,1.0)).xyz;`,
 `  vec2 collision_flags = texelFetch(${texture},ivec2(4,collision_index),0).xy;`,
 `  bool collision_inside = collision_flags.x > 0.5 ? dot(collision_point,collision_point) <= 1.0000001 : max(max(abs(collision_point.x),abs(collision_point.y)),abs(collision_point.z)) <= 0.5000001;`,
 `  if (collision_inside) collision_selected = collision_flags.y > 0.5;`,`}`,
 `if (collision_selected) ${output}.rgba.rgb = mix(${input}.rgba.rgb,vec3(0.20,0.92,0.72),0.65);`
 ];}
