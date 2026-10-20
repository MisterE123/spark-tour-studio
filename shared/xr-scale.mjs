import {Vector3,Quaternion} from 'three';
// Scale tracked headset/controller motion, keeping the current head position fixed.
export function scaleTrackedRig(rig,camera,worldScale){
 const before=camera.getWorldPosition(new Vector3());rig.scale.setScalar(1/worldScale);rig.updateMatrixWorld(true);const after=camera.getWorldPosition(new Vector3());
 if(rig.parent){rig.parent.worldToLocal(before);rig.parent.worldToLocal(after);}rig.position.add(before.sub(after));rig.updateMatrixWorld(true);
}
// Keep eye positions/IPD scaled, but render in ordinary world units. Spark's
// non-covariance path expects rigid view matrices, as do our shared world tools.
export function rigidXRViews(camera){
 const position=new Vector3(),scale=new Vector3(),quaternion=new Quaternion();
 for(const view of [camera,...(camera.cameras||[])]){view.matrixWorld.decompose(position,quaternion,scale);view.matrixWorld.compose(position,quaternion,new Vector3(1,1,1));view.matrixWorldAutoUpdate=false;view.matrixWorldInverse.copy(view.matrixWorld).invert();}
}
