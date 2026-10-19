// Preserve each surface segment's heights; a cubic spline can dip below steps
// and slopes even when all its control points are above the ground.
export function walkingRibbonSamples(points,spacing=.12){const samples=[];for(let i=0;i<points.length;i++){const to=points[i];if(!i){samples.push({...to});continue;}const from=points[i-1],count=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)/spacing));for(let j=1;j<=count;j++){const t=j/count;samples.push({x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t});}}return samples;}
