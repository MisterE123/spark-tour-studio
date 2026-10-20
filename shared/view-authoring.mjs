import {Vector3,Quaternion,Euler,MathUtils} from 'three';

export function viewGeometryAnchor(view){return view.type==='orbit'&&view.orbit?view.orbit.center:view.type==='slider'&&view.slider?view.slider.origin:view.position;}
export function moveViewGeometry(view,point){
 const shift=new Vector3(...point).sub(new Vector3(...viewGeometryAnchor(view))),position=new Vector3(...view.position).add(shift).toArray();
 if(view.type==='orbit'&&view.orbit)return {position,orbit:{...structuredClone(view.orbit),center:[...point]}};
 if(view.type==='slider'&&view.slider)return {position,slider:{...structuredClone(view.slider),origin:[...point]}};
 return {position};
}
function includeAngle(bounds,angle,periodic=false){
 if(!bounds)return undefined;let value=angle;if(periodic)value+=Math.round(((bounds[0]+bounds[1])/2-value)/360)*360;
 const shift=value<bounds[0]?value-bounds[0]:value>bounds[1]?value-bounds[1]:0;
 return bounds.map(bound=>bound+shift);
}
export function viewFromCamera(view,camera,orbitFrame=new Quaternion()){
 const patch={position:[...camera.position],rotation:[...camera.rotation],thumbnail:camera.thumbnail};
 if(view.type==='orbit'&&view.orbit){
  const orbit=structuredClone(view.orbit),direction=new Vector3(0,0,-1).applyQuaternion(new Quaternion().setFromEuler(new Euler(...camera.rotation,'YXZ'))),delta=direction.clone().negate().applyQuaternion(orbitFrame.clone().invert());
  orbit.center=new Vector3(...camera.position).addScaledVector(direction,orbit.radius).toArray();
  orbit.azimuthBounds=includeAngle(orbit.azimuthBounds,MathUtils.radToDeg(Math.atan2(delta.x,delta.z)),true);
  orbit.elevationBounds=includeAngle(orbit.elevationBounds,MathUtils.radToDeg(Math.asin(MathUtils.clamp(delta.y,-1,1))));
  // Match the orbit pole limit without widening an authored range.
  if(orbit.elevationBounds){const [a,b]=orbit.elevationBounds,shift=a<-89?-89-a:b>89?89-b:0;orbit.elevationBounds=[a+shift,b+shift];}
  return {...patch,orbit};
 }
 if(view.type==='slider'&&view.slider)return {...patch,slider:{...structuredClone(view.slider),origin:[...camera.position],rotation:[...camera.rotation]}};
 return patch;
}
