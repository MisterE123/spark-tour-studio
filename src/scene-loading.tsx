import React,{useState,useSyncExternalStore} from 'react';
import type {TourRuntime,SceneLoadState,SceneRenderIssue} from './runtime';

const noSubscription=()=>()=>{},noLoading=():SceneLoadState|null=>null;
export function useSceneLoading(runtime:TourRuntime|null){return useSyncExternalStore(runtime?.subscribeLoading||noSubscription,runtime?.getLoadingSnapshot||noLoading);}
const noIssue=():SceneRenderIssue|null=>null;
export function useSceneRenderIssue(runtime:TourRuntime|null){return useSyncExternalStore(runtime?.subscribeLoading||noSubscription,runtime?.getRenderIssueSnapshot||noIssue);}

export function SceneLoading({runtime}:{runtime:TourRuntime|null}){
 const loading=useSceneLoading(runtime),[failedCovers,setFailedCovers]=useState<string[]>([]);
 if(!loading)return null;
 const cover=[loading.cover,loading.fallbackCover].find(value=>value&&!failedCovers.includes(value))||'';
 return <section className="scene-loading" aria-label={'Loading '+loading.name} aria-busy="true">
  {cover&&<img className="scene-loading-cover" src={cover} alt="" onError={()=>setFailedCovers(values=>[...values,cover])}/>}
  <div className="scene-loading-card"><div className="eyebrow">NEXT DESTINATION</div><h2>{loading.name}</h2><p role="status">{loading.phase}</p>
   <div className="scene-loading-track" role="progressbar" aria-label="Scene loading progress" aria-valuemin={0} aria-valuemax={loading.total} aria-valuenow={loading.completed} aria-valuetext={loading.phase}><span style={{width:(loading.completed/loading.total*100)+'%'}}/></div>
  </div>
 </section>;
}
