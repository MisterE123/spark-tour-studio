import {Vector3} from 'three';
import {CollisionVolumeSchema,sceneMatrix,volumeMatrix} from './collision-selection.mjs';

export const COLLISION_OVERVIEW_SEGMENT_BUDGET=65536;
const MAX_SHAPES=128,MAX_COORDINATE=1e12;
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const point=value=>Array.isArray(value)&&value.length===3&&value.every(finite);
const boundsValid=b=>b&&point(b.min)&&point(b.max)&&b.min.every((v,i)=>v<=b.max[i]&&Math.abs(v)<=MAX_COORDINATE&&Math.abs(b.max[i])<=MAX_COORDINATE);
const transformValid=t=>t&&point(t.position)&&point(t.rotation)&&finite(t.scale)&&t.scale>0;
function boundsOf(points,height=0){const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const p of points)for(let axis=0;axis<3;axis++){if(!finite(p[axis])||Math.abs(p[axis])>MAX_COORDINATE)throw Error('Invalid overview coordinates.');min[axis]=Math.min(min[axis],p[axis]);max[axis]=Math.max(max[axis],p[axis]);}max[1]+=height;if(!boundsValid({min,max}))throw Error('Invalid overview bounds.');return {min,max};}
function lineWriter(){const values=[];return {line(a,b){if([...a,...b].some(v=>!finite(v)||Math.abs(v)>MAX_COORDINATE))throw Error('Invalid overview coordinates.');if(a.every((v,i)=>v===b[i]))return;values.push(...a,...b);},finish:()=>new Float32Array(values)};}
const shifted=(point,height)=>[point[0],point[1]+height,point[2]];
function boxLevel(corners,subdivisions,height){
 const out=lineWriter(),base=corners[0],axes=[4,2,1].map(index=>corners[index].map((v,i)=>v-base[i])),at=(x,y,z)=>base.map((v,i)=>v+x*axes[0][i]+y*axes[1][i]+z*axes[2][i]);
 const emit=(a,b)=>{out.line(a,b);if(height)out.line(shifted(a,height),shifted(b,height));};
 // Twelve boundary edges, then bounded face subdivisions. No voxel cells are read.
 for(let axis=0;axis<3;axis++)for(const sideA of [0,1])for(const sideB of [0,1]){const a=[0,0,0],b=[0,0,0],u=(axis+1)%3,v=(axis+2)%3;a[u]=b[u]=sideA;a[v]=b[v]=sideB;b[axis]=1;emit(at(...a),at(...b));}
 for(let axis=0;axis<3;axis++)for(const side of [0,1])for(let index=1;index<subdivisions;index++)for(const direction of [1,2]){const u=(axis+direction)%3,v=3-axis-u,a=[0,0,0],b=[0,0,0];a[axis]=b[axis]=side;a[v]=b[v]=index/subdivisions;b[u]=1;emit(at(...a),at(...b));}
 if(height)for(const corner of corners)out.line(corner,shifted(corner,height));
 return out.finish();
}
function sphereLevel(center,radius,longitudes,height){
 const out=lineWriter(),latitudes=longitudes/2,at=(latitude,longitude,lift)=>{const polar=latitude*Math.PI/latitudes,azimuth=longitude*2*Math.PI/longitudes;return [center[0]+radius*Math.sin(polar)*Math.cos(azimuth),center[1]+radius*Math.cos(polar)+lift,center[2]+radius*Math.sin(polar)*Math.sin(azimuth)];};
 // A ball swept along generation +Y is a capsule: two hemispheres joined at
 // their equators. Source rotation must never tilt the extrusion direction.
 for(let longitude=0;longitude<longitudes;longitude++)for(let latitude=0;latitude<latitudes;latitude++){const upper=latitude<latitudes/2,lift=upper?height:0;out.line(at(latitude,longitude,lift),at(latitude+1,longitude,lift));if(height&&latitude===latitudes/2)out.line(at(latitude,longitude,0),at(latitude,longitude,height));}
 for(let latitude=1;latitude<latitudes;latitude++){const lifts=height&&latitude===latitudes/2?[0,height]:[latitude<latitudes/2?height:0];for(const lift of lifts)for(let longitude=0;longitude<longitudes;longitude++)out.line(at(latitude,longitude,lift),at(latitude,longitude+1,lift));}
 return out.finish();
}
function boxCorners(matrix){const points=[];for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])points.push(new Vector3(x,y,z).applyMatrix4(matrix).toArray());return points;}
function shapeOverview(volume,source,height){
 const matrix=source.clone().multiply(volumeMatrix(volume));let bounds,levels;
 if(volume.type==='ball'){const center=new Vector3().setFromMatrixPosition(matrix).toArray(),radius=matrix.getMaxScaleOnAxis();bounds=boundsOf([center.map(v=>v-radius),center.map(v=>v+radius)],height);levels=[8,12,20].map(divisions=>sphereLevel(center,radius,divisions,height));}
 else{const corners=boxCorners(matrix);bounds=boundsOf(corners,height);levels=[1,6,20].map(divisions=>boxLevel(corners,divisions,height));}
 return {id:volume.id,operation:volume.operation,bounds,levels};
}
function generationShapes(manifest){
 const g=manifest?.generation;if(!g||!['entire','selected'].includes(g.scope)||!transformValid(manifest.sourceTransform))return undefined;
 const volumes=g.scope==='entire'?[g.bounds]:g.volumes;if(!Array.isArray(volumes)||!volumes.length||volumes.length>MAX_SHAPES)return undefined;
 let height=0;if(g.options!==undefined){if(!g.options||typeof g.options!=='object'||Array.isArray(g.options)||g.options.extrudeUp!==undefined&&typeof g.options.extrudeUp!=='boolean'||g.options.wallHeight!==undefined&&(!finite(g.options.wallHeight)||g.options.wallHeight<0||g.options.wallHeight>1000000))return undefined;if(g.options.extrudeUp){if(g.options.wallHeight===undefined)return undefined;height=g.options.wallHeight;}}
 const parsed=[],ids=new Set();for(const volume of volumes){if(typeof volume?.id!=='string'||volume.id.length>128)return undefined;const result=CollisionVolumeSchema.safeParse(volume);if(!result.success||ids.has(volume.id)||g.scope==='entire'&&(volume.type!=='box'||volume.operation!=='add'))return undefined;ids.add(volume.id);parsed.push(result.data);}if(!parsed.some(volume=>volume.operation==='add'))return undefined;
 try{return parsed.map(volume=>shapeOverview(volume,sceneMatrix(manifest.sourceTransform),height));}catch{return undefined;}
}
/** Global coverage guides only. These lines never certify free space or create physics. */
export function createCollisionOverview(manifest){
 let shapes=generationShapes(manifest);if(!shapes){shapes=[];const bounds=manifest?.bounds;if(boundsValid(bounds)){const corners=[];for(const x of [bounds.min[0],bounds.max[0]])for(const y of [bounds.min[1],bounds.max[1]])for(const z of [bounds.min[2],bounds.max[2]])corners.push([x,y,z]);shapes=[{id:'manifest-bounds',operation:'add',bounds:{min:[...bounds.min],max:[...bounds.max]},levels:[1,6,20].map(divisions=>boxLevel(corners,divisions,0))}];}}
 return {shapes,segmentBudget:COLLISION_OVERVIEW_SEGMENT_BUDGET};
}
/** Perspective screen-size estimate; eye and bounds both use generation metres. */
export function selectCollisionOverviewLevel(bounds,eye,{fov=60,viewportHeight=720,worldScale=1,previousLevel=-1,hysteresis=.15}={}){
 const position=Array.isArray(eye)?eye:[eye?.x,eye?.y,eye?.z];if(!boundsValid(bounds)||!point(position))return 0;
 if(!finite(fov)||fov<=0||fov>=180)fov=60;if(!finite(viewportHeight)||viewportHeight<=0)viewportHeight=720;if(!finite(worldScale)||worldScale<=0)worldScale=1;
 const diameter=Math.hypot(...bounds.max.map((v,i)=>v-bounds.min[i])),distance=Math.hypot(...position.map((v,i)=>Math.max(bounds.min[i]-v,0,v-bounds.max[i]))),pixels=diameter/Math.max(distance,.001/worldScale)*viewportHeight/(2*Math.tan(fov*Math.PI/360));
 const margin=finite(hysteresis)?Math.max(0,Math.min(.45,hysteresis)):0,lower=100,upper=420;
 if(previousLevel===0)return pixels<lower*(1+margin)?0:pixels>=upper*(1+margin)?2:1;
 if(previousLevel===1)return pixels>=upper*(1+margin)?2:pixels<lower*(1-margin)?0:1;
 if(previousLevel===2)return pixels>=upper*(1-margin)?2:pixels<lower*(1-margin)?0:1;
 return pixels>=upper?2:pixels>=lower?1:0;
}
