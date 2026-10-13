import {Vector3,Quaternion,Euler} from 'three';
const orientation=volume=>new Quaternion().setFromEuler(new Euler(...volume.rotation,'YXZ'));
export function boxWallPosition(volume,axis,sign){const offset=new Vector3();offset.setComponent(axis,sign*volume.size[axis]/2);return offset.applyQuaternion(orientation(volume)).add(new Vector3(...volume.position)).toArray();}
export function resizeBoxWall(volume,axis,sign,point){
 const q=orientation(volume),local=new Vector3(...point).sub(new Vector3(...volume.position)).applyQuaternion(q.clone().invert()),opposite=-sign*volume.size[axis]/2,size=[...volume.size];
 size[axis]=Math.max(.005,sign*(local.getComponent(axis)-opposite));
 const moving=opposite+sign*size[axis],shift=new Vector3();shift.setComponent(axis,(moving+opposite)/2);
 return {...volume,size,position:shift.applyQuaternion(q).add(new Vector3(...volume.position)).toArray()};
}
