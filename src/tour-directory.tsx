import React,{useMemo,useState} from 'react';
import type {Project,TourDestination} from './model';
import {tourDirectory,searchTour} from '../shared/tour-directory.mjs';
import {Icon} from './icons';
type DirectoryEntry=TourDestination&{sceneName:string;label:string;description:string;thumbnail:string;bubbleKind?:'page'|'scene'|'viewpoint'};

export function TourDirectory({project,base,disabled,onVisit}:{project:Project;base:string;disabled?:boolean;onVisit:(destination:TourDestination)=>void}){
 const [query,setQuery]=useState(''),[kind,setKind]=useState('scene');
 const entries=useMemo(()=>tourDirectory(project) as DirectoryEntry[],[project]),results=useMemo(()=>searchTour(entries,query,kind) as DirectoryEntry[],[entries,query,kind]);
 return <section className="tour-directory" aria-label="Explore tour contents">
  <header><div className="eyebrow">FIND YOUR WAY</div><h2>{kind==='scene'?'Choose a scene':'Places & stories'}</h2></header>
  <label className="directory-search"><Icon name="search"/><input type="search" aria-label="Search tour contents" placeholder="Search scenes, views or stories…" value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="directory-filters" role="group" aria-label="Search category">{[['all','All'],['scene','Scenes'],['viewpoint','Views'],['bubble','Bubbles']].map(([value,label])=><button key={value} aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</button>)}</div>
  <div className="directory-results" role="list" aria-label="Tour contents">
   {results.map(entry=>{const icon=entry.kind==='scene'?'image_arrow_up':entry.kind==='viewpoint'?'photo':entry.bubbleKind==='scene'?'image_arrow_up':entry.bubbleKind==='viewpoint'?'photo':'chat_info';return <div role="listitem" key={entry.sceneId+':'+entry.kind+':'+entry.id}><button disabled={disabled} className="directory-result" aria-label={`Go to ${entry.kind==='viewpoint'?'view':entry.kind}: ${entry.label}`} onClick={()=>onVisit({sceneId:entry.sceneId,kind:entry.kind as TourDestination['kind'],id:entry.id})}>
    {entry.thumbnail?<img src={new URL(entry.thumbnail,base).href} alt=""/>:<Icon name={icon}/>}<span><strong>{entry.label}</strong><small>{entry.kind==='scene'?`${project.scenes.findIndex(s=>s.id===entry.sceneId)+1} · Scene`:entry.sceneName+' · '+(entry.kind==='viewpoint'?'View':entry.bubbleKind==='page'?'Information bubble':'Link bubble')}</small>{entry.description&&<span className="directory-excerpt">{entry.description.replace(/\s+/g,' ').slice(0,130)}</span>}</span><Icon name="center_focus_strong" size={16}/>
   </button></div>;})}
   {!results.length&&<p className="muted">No matching places or stories.</p>}
  </div><small className="directory-count" aria-live="polite">{results.length} {results.length===1?'place':'places'} · Select to go there</small>
 </section>;
}
