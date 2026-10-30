/// <reference types="vite/client" />
import engineUrl from '@dimforge/rapier3d-compat?url&no-inline';
import {createPhysicsLoader} from '../shared/physics-loader.mjs';
import type Rapier from '@dimforge/rapier3d-compat';

// The compatibility module is self-contained, including its WASM. Emitting it
// as an asset keeps it in offline exports while permitting a fresh native module
// URL after browsers permanently cache a failed import. No scene or XR reload.
export const loadPhysics=createPhysicsLoader(async attempt=>{
 const url=new URL(engineUrl,import.meta.url);
 if(attempt)url.searchParams.set('physics-retry',String(attempt));
 return import(/* @vite-ignore */url.href) as Promise<{default:typeof Rapier}>;
});
