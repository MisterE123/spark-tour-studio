import {init, NavMeshQuery,exportNavMesh,importNavMesh} from 'recast-navigation';
import {generateTiledNavMesh} from 'recast-navigation/generators';
export async function buildNavigation(positions,indices,cached,options={}){
 await init();
 if(cached)return navigationQuery(importNavMesh(cached).navMesh);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);max[axis]=Math.max(max[axis],positions[i]);}
 const cs=options.cellSize||.1,bounds=options.bounds||[min,max];if(!positions.length||(bounds[1][0]-bounds[0][0])*(bounds[1][2]-bounds[0][2])/(cs*cs)>20000000)throw Error('Collision mesh is too large for click-to-walk. Use a smaller scene collider.');
 if(!options.bounds){min[1]-=.5;max[1]+=3;}
 const result=generateTiledNavMesh(positions,indices,{cs,ch:.05,tileSize:Math.round(6.4/cs),walkableSlopeAngle:45,walkableHeight:34,walkableClimb:5,walkableRadius:Math.ceil(.25/cs),minRegionArea:4,mergeRegionArea:8,bounds});
 if(!result.success)throw Error(result.error||'No walkable navigation mesh.');
 return navigationQuery(result.navMesh);
}
// A coarse grid can close a doorway that the physical capsule fits through.
// Refine only around a failed click; keep ordinary scene preparation unchanged.
export class NavigationRefinements {
 constructor(positions,indices){this.positions=positions;this.indices=indices;this.regions=[];}
 async path(start,end){
  const bounds=[['x','y','z'].map((key,axis)=>Math.floor(Math.min(start[key],end[key]))-(axis===1?1:2)),['x','y','z'].map((key,axis)=>Math.ceil(Math.max(start[key],end[key]))+(axis===1?3:2))];
  if(bounds.flat().some(value=>!Number.isFinite(value))||(bounds[1][0]-bounds[0][0])*(bounds[1][2]-bounds[0][2])>.05*.05*1000000)throw Error('No walkable route to that point.');
  const key=JSON.stringify(bounds),existing=this.regions.find(region=>region.key===key);if(existing)return existing.nav.path(start,end);
  const vertices=[],faces=[],mapping=new Map(),source=this.positions;
  for(let i=0;i<this.indices.length;i+=3){const triangle=[this.indices[i],this.indices[i+1],this.indices[i+2]];let outside=false;for(let axis=0;axis<3;axis++)if(triangle.every(index=>source[index*3+axis]<bounds[0][axis])||triangle.every(index=>source[index*3+axis]>bounds[1][axis])){outside=true;break;}if(outside)continue;
   for(const index of triangle){let target=mapping.get(index);if(target===undefined){target=vertices.length/3;mapping.set(index,target);vertices.push(source[index*3],source[index*3+1],source[index*3+2]);}faces.push(target);}
  }
  const nav=await buildNavigation(new Float32Array(vertices),new Uint32Array(faces),undefined,{cellSize:.05,bounds});this.regions.push({key,nav});if(this.regions.length>3)this.regions.shift().nav.dispose();return nav.path(start,end);
 }
 dispose(){for(const region of this.regions)region.nav.dispose();this.regions=[];}
}
function navigationQuery(navMesh){const query=new NavMeshQuery(navMesh,{maxNodes:8192});query.defaultQueryHalfExtents={x:.8,y:2,z:.8};return {serialize(){return exportNavMesh(navMesh);},path(start,end){const a=query.findClosestPoint(start),b=query.findClosestPoint(end,{halfExtents:{x:2,y:2,z:2}});if(!a.success||!b.success||!a.polyRef||!b.polyRef)throw Error('No walkable surface at that point.');const found=query.computePath(a.point,b.point,{maxPathPolys:2048,maxStraightPathPoints:1024});const last=found.path.at(-1);if(!found.success||!last||Math.hypot(last.x-b.point.x,last.y-b.point.y,last.z-b.point.z)>.12)throw Error('No walkable route to that point.');return found.path;},dispose(){query.destroy();navMesh.destroy();}};}
