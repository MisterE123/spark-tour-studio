// Shape helpers stay synchronous. Each JS realm initializes this binding before
// constructing worlds; importing helpers alone never downloads or compiles WASM.
/** @type {typeof import('@dimforge/rapier3d-compat').default} */
export let physics;
/** @type {Promise<typeof physics> | undefined} */
let initializing;

/** @param {typeof physics} engine */
export function initializePhysics(engine){
 if(physics)return Promise.resolve(physics);
 if(initializing)return initializing;
 const task=Promise.resolve().then(()=>engine.init()).then(()=>physics=engine);
 initializing=task;
 // Keep one initialization for all consumers. A failed attempt remains retryable;
 // canceling a scene must never cancel another scene's shared engine request.
 void task.catch(()=>{if(initializing===task)initializing=undefined;});
 return task;
}

export function physicsReady(){
 if(physics)return Promise.resolve(physics);
 if(initializing)return initializing;
 return Promise.reject(Error('Collision physics has not been initialized.'));
}
