import {initializePhysics,physics} from './physics.mjs';

/** @type {Promise<typeof physics> | undefined} */
let loading;
export function loadPhysics(){
 if(physics)return Promise.resolve(physics);
 if(loading)return loading;
 const task=import('@dimforge/rapier3d-compat').then(module=>initializePhysics(module.default));
 loading=task;
 void task.catch(()=>{if(loading===task)loading=undefined;});
 return task;
}
