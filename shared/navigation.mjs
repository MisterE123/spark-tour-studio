import {init, NavMeshQuery,exportNavMesh,importNavMesh} from 'recast-navigation';
import {generateTiledNavMesh} from 'recast-navigation/generators';
import {DEFAULT_STEP_HEIGHT} from './walking.mjs';
// Recast's climb is in vertical cells, while the editor setting is in meters.
// Rounding down keeps generated routes inside the physical stepping limit.
export function navigationClimb(stepHeight=DEFAULT_STEP_HEIGHT,cellHeight=.05){if(!Number.isFinite(stepHeight)||stepHeight<0||!Number.isFinite(cellHeight)||cellHeight<=0)throw Error('Invalid walking step height.');return Math.floor((stepHeight+1e-7)/cellHeight);}
export {walkingPathLength,walkingPathNeedsRefinement} from './walking-path.mjs';
import {walkingPathLength,walkingPathNeedsRefinement} from './walking-path.mjs';
// A successful coarse route can still take a needless detour around a small
// bump/doorway. Keep its safe corridor unless finer geometry gives a shorter one.
export async function refinedNavigationPath(navigation,refinements,start,end){
 let coarse;try{coarse=navigation.path(start,end);}catch(error){if(!refinements)throw error;return refinements.path(start,end);}
 if(!refinements||!walkingPathNeedsRefinement(coarse,start,end))return coarse;
 try{const fine=await refinements.path(start,end);return walkingPathLength(fine)<walkingPathLength(coarse)?fine:coarse;}catch{return coarse;}
}
export async function buildNavigation(positions,indices,cached,options={}){
 await init();
 if(cached)return navigationQuery(importNavMesh(cached).navMesh);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);max[axis]=Math.max(max[axis],positions[i]);}
 const cs=options.cellSize||.1,bounds=options.bounds||[min,max];if(!positions.length||(bounds[1][0]-bounds[0][0])*(bounds[1][2]-bounds[0][2])/(cs*cs)>20000000)throw Error('Collision mesh is too large for click-to-walk. Use a smaller scene collider.');
 if(!options.bounds){min[1]-=.5;max[1]+=3;}
 const result=generateTiledNavMesh(positions,indices,{cs,ch:.05,tileSize:Math.round(6.4/cs),walkableSlopeAngle:45,walkableHeight:34,walkableClimb:navigationClimb(options.stepHeight),walkableRadius:Math.ceil(.25/cs),minRegionArea:4,mergeRegionArea:8,bounds});
 if(!result.success)throw Error(result.error||'No walkable navigation mesh.');
 return navigationQuery(result.navMesh);
}
// A coarse grid can close a doorway that the physical capsule fits through.
// Refine failed queries and bounded successful detours without changing the scene-wide mesh.
export class NavigationRefinements {
 constructor(positions,indices,options={}){this.positions=positions;this.indices=indices;this.options=options;this.regions=[];}
 region(start,end){
  const bounds=[['x','y','z'].map((key,axis)=>Math.floor(Math.min(start[key],end[key]))-(axis===1?1:2)),['x','y','z'].map((key,axis)=>Math.ceil(Math.max(start[key],end[key]))+(axis===1?3:2))];
  if(bounds.flat().some(value=>!Number.isFinite(value))||(bounds[1][0]-bounds[0][0])*(bounds[1][2]-bounds[0][2])>.05*.05*1000000)throw Error('No walkable route to that point.');
  const key=JSON.stringify(bounds);
  const vertices=[],faces=[],mapping=new Map(),source=this.positions;
  for(let i=0;i<this.indices.length;i+=3){const triangle=[this.indices[i],this.indices[i+1],this.indices[i+2]];let outside=false;for(let axis=0;axis<3;axis++)if(triangle.every(index=>source[index*3+axis]<bounds[0][axis])||triangle.every(index=>source[index*3+axis]>bounds[1][axis])){outside=true;break;}if(outside)continue;
   for(const index of triangle){let target=mapping.get(index);if(target===undefined){target=vertices.length/3;mapping.set(index,target);vertices.push(source[index*3],source[index*3+1],source[index*3+2]);}faces.push(target);}
  }
  return {key,bounds,positions:new Float32Array(vertices),indices:new Uint32Array(faces)};
 }
 async path(start,end){
  const {key,bounds,positions,indices}=this.region(start,end),existing=this.regions.find(region=>region.key===key);if(existing)return existing.nav.path(start,end);
  const nav=await buildNavigation(positions,indices,undefined,{...this.options,cellSize:.05,bounds});this.regions.push({key,nav});if(this.regions.length>3)this.regions.shift().nav.dispose();return nav.path(start,end);
 }
 dispose(){for(const region of this.regions)region.nav.dispose();this.regions=[];}
}
function navigationQuery(navMesh){const query=new NavMeshQuery(navMesh,{maxNodes:8192});return {serialize(){return exportNavMesh(navMesh);},path(start,end){return surfaceNavigationPath(query,start,end);},dispose(){query.destroy();navMesh.destroy();}};}

// A surface click must not silently choose a different storey. Keep the route
// on its actual polygon corridor, including height changes between corners.
export function surfaceNavigationPath(query,start,end,{maxPathPolys=2048,maxStraightPathPoints=2048}={}){
 const a=query.findClosestPoint(start,{halfExtents:{x:.8,y:.18,z:.8}}),b=query.findClosestPoint(end,{halfExtents:{x:1,y:.18,z:1}});
 if(!a.success||!b.success||!a.polyRef||!b.polyRef||Math.abs(a.point.y-start.y)>.18||Math.abs(b.point.y-end.y)>.18)throw Error('No walkable surface at that point.');
 let corridor,straight;
 try{
  corridor=query.findPath(a.polyRef,b.polyRef,a.point,b.point,{maxPathPolys});
  if(!corridor.success||!corridor.polys.size||corridor.polys.get(corridor.polys.size-1)!==b.polyRef)throw Error('No walkable route to that point.');
  straight=query.findStraightPath(a.point,b.point,corridor.polys,{maxStraightPathPoints,straightPathOptions:2});
  if(!straight.success||!straight.straightPathCount)throw Error('No walkable route to that point.');
  const points=[],push=point=>{const last=points.at(-1);if(!last||Math.hypot(point.x-last.x,point.y-last.y,point.z-last.z)>1e-5)points.push(point);};
  for(let i=0;i<straight.straightPathCount-1;i++){
   const from={x:straight.straightPath.get(i*3),y:straight.straightPath.get(i*3+1),z:straight.straightPath.get(i*3+2)},to={x:straight.straightPath.get((i+1)*3),y:straight.straightPath.get((i+1)*3+1),z:straight.straightPath.get((i+1)*3+2)},ref=straight.straightPathRefs.get(i)||a.polyRef,count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.2));
   if(points.length+count+1>16384)throw Error('This walking route is too long. Choose a nearer point.');
   for(let sample=0;sample<=count;sample++){const t=sample/count,point={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t},surface=query.closestPointOnPoly(ref,point);if(!surface.success||!Number.isFinite(surface.closestPoint.y)||Math.hypot(surface.closestPoint.x-point.x,surface.closestPoint.z-point.z)>.08)throw Error('No walkable route to that point.');push({...surface.closestPoint});}
  }
  push({...b.point});const last=points.at(-1);if(!last||Math.hypot(last.x-b.point.x,last.y-b.point.y,last.z-b.point.z)>.12)throw Error('No walkable route to that point.');return points;
 }finally{corridor?.polys.destroy();straight?.straightPath.destroy();straight?.straightPathFlags.destroy();straight?.straightPathRefs.destroy();}
}

export {walkingRibbonSamples} from './walking-path.mjs';
