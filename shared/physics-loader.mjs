import {initializePhysics,physics} from './physics.mjs';

/** @typedef {typeof import('@dimforge/rapier3d-compat').default} PhysicsEngine */
/**
 * Keep imported bytes after an initialization failure. Only a rejected module
 * import advances the attempt, so browser loaders can bypass a cached failure
 * without replacing an engine used by live worlds.
 * @param {(attempt:number)=>Promise<{default:PhysicsEngine}>} importer
 * @param {{current:()=>PhysicsEngine|undefined,initialize:(engine:PhysicsEngine)=>Promise<PhysicsEngine>}} provider
 * @returns {()=>Promise<PhysicsEngine>}
 */
export function createPhysicsLoader(importer,provider={current:()=>physics,initialize:initializePhysics}){
 /** @type {Promise<PhysicsEngine> | undefined} */
 let loading;
 /** @type {PhysicsEngine | undefined} */
 let engine;let attempt=0;
 return ()=>{
  const ready=provider.current();if(ready)return Promise.resolve(ready);
  if(loading)return loading;
  const task=Promise.resolve().then(async()=>{
   if(!engine){try{engine=(await importer(attempt)).default;}catch(error){attempt++;throw error;}}
   return provider.initialize(engine);
  });
  loading=task;
  void task.catch(()=>{if(loading===task)loading=undefined;});
  return task;
 };
}

// Node and worker-side tests keep package resolution. The browser uses the same
// state machine with its emitted asset URL; this unused function tree-shakes out.
/** @type {ReturnType<typeof createPhysicsLoader> | undefined} */
let nodeLoader;
export function loadPhysics(){if(!nodeLoader)nodeLoader=createPhysicsLoader(()=>import('@dimforge/rapier3d-compat'));return nodeLoader();}
