import {init, NavMeshQuery,exportNavMesh,importNavMesh} from 'recast-navigation';
import {generateTiledNavMesh} from 'recast-navigation/generators';
export async function buildNavigation(positions,indices,cached){
 await init();
 if(cached)return navigationQuery(importNavMesh(cached).navMesh);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(let i=0;i<positions.length;i++) {const axis=i%3;min[axis]=Math.min(min[axis],positions[i]);max[axis]=Math.max(max[axis],positions[i]);}
 if(!positions.length||(max[0]-min[0])*(max[2]-min[2])/.01>20000000)throw Error('Collision mesh is too large for click-to-walk. Use a smaller scene collider.');
 min[1]-=.5;max[1]+=3;
 const result=generateTiledNavMesh(positions,indices,{cs:.1,ch:.05,tileSize:64,walkableSlopeAngle:45,walkableHeight:34,walkableClimb:5,walkableRadius:3,minRegionArea:4,mergeRegionArea:8,bounds:[min,max]});
 if(!result.success)throw Error(result.error||'No walkable navigation mesh.');
 return navigationQuery(result.navMesh);
}
function navigationQuery(navMesh){const query=new NavMeshQuery(navMesh,{maxNodes:8192});query.defaultQueryHalfExtents={x:.8,y:2,z:.8};return {serialize(){return exportNavMesh(navMesh);},path(start,end){const a=query.findClosestPoint(start),b=query.findClosestPoint(end,{halfExtents:{x:2,y:2,z:2}});if(!a.success||!b.success||!a.polyRef||!b.polyRef)throw Error('No walkable surface at that point.');const found=query.computePath(a.point,b.point,{maxPathPolys:2048,maxStraightPathPoints:1024});const last=found.path.at(-1);if(!found.success||!last||Math.hypot(last.x-b.point.x,last.y-b.point.y,last.z-b.point.z)>.12)throw Error('No walkable route to that point.');return found.path;},dispose(){query.destroy();navMesh.destroy();}};}
