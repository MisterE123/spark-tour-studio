import React,{useEffect,useState} from 'react';
import type {TourRuntime,SceneLoadState} from './runtime';

export function SceneLoading({runtime}:{runtime:TourRuntime|null}){
 const [loading,setLoading]=useState<SceneLoadState|null>(null),[failedCovers,setFailedCovers]=useState<string[]>([]);
 useEffect(()=>{if(!runtime)return;setLoading(runtime.loading);runtime.onLoading=setLoading;return()=>{if(runtime.onLoading===setLoading)runtime.onLoading=()=>{};};},[runtime]);
 if(!loading)return null;
 const cover=[loading.cover,loading.fallbackCover].find(value=>value&&!failedCovers.includes(value))||'';
 return <section className="scene-loading" aria-label={'Loading '+loading.name} aria-busy="true">
  {cover&&<img className="scene-loading-cover" src={cover} alt="" onError={()=>setFailedCovers(values=>[...values,cover])}/>}
  <div className="scene-loading-card"><div className="eyebrow">NEXT DESTINATION</div><h2>{loading.name}</h2><p role="status">{loading.phase}</p>
   <div className="scene-loading-track" role="progressbar" aria-label="Scene loading progress" aria-valuemin={0} aria-valuemax={loading.total} aria-valuenow={loading.completed} aria-valuetext={loading.phase}><span style={{width:(loading.completed/loading.total*100)+'%'}}/></div>
  </div>
 </section>;
}
