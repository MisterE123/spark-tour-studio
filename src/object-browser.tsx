import React,{useState,useEffect,useRef} from 'react';
import type {Project,TourScene} from './model';
import type {TourRuntime} from './runtime';
import {sceneThumbnail} from '../shared/viewpoints.mjs';
import {browserItems} from '../shared/editor-browser.mjs';
import {bubbleLabel} from '../shared/bubbles.mjs';
import {Icon,IconButton} from './icons';
type Scope='scenes'|'views'|'bubbles';
export function ObjectBrowser({project,scene,base,runtime,scope,onScope,selected,onScene,onView,onBubble,onClose,children}:{project:Project;scene?:TourScene;base:string;runtime:TourRuntime|null;scope:Scope;onScope:(value:Scope)=>void;selected:string;onScene:(id:string)=>void;onView:(id:string)=>void;onBubble:(id:string)=>void;onClose:()=>void;children?:React.ReactNode}){
 const [query,setQuery]=useState(''),[prefs,setPrefs]=useState<{sort:string;descending:boolean;type:string}>(()=>{try{const value=JSON.parse(localStorage.getItem('spark-browser-prefs')||'{}');return {sort:['name','created','distance'].includes(value.sort)?value.sort:'name',descending:value.descending===true,type:['all','page','scene','viewpoint'].includes(value.type)?value.type:'all'};}catch{return {sort:'name',descending:false,type:'all'};}});
 const [position,setPosition]=useState<number[]>([0,0,0]),[held,setHeld]=useState(false),[focused,setFocused]=useState(false);
 const list=useRef<HTMLDivElement>(null);
 useEffect(()=>{try{localStorage.setItem('spark-browser-prefs',JSON.stringify(prefs));}catch{}},[prefs]);
 const refresh=()=>{if(!runtime)return;const p=runtime.content.worldToLocal(runtime.camera.getWorldPosition(runtime.camera.position.clone()));setPosition(p.toArray());};
 useEffect(()=>{if(!held&&!focused)refresh();if(prefs.sort!=='distance')return;const timer=setInterval(()=>{if(!held&&!focused)refresh();},2000);return()=>clearInterval(timer);},[runtime,scope,scene?.id,prefs.sort,held,focused]);
 useEffect(()=>{list.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block:'nearest'});},[selected,scope]);
 const distance=(item:any)=>Math.hypot(...(item.position||[0,0,0]).map((n:number,i:number)=>n-position[i]))*Math.abs(scene?.transform.scale||1);
 const items=scope==='scenes'?project.scenes:scope==='views'?scene?.viewpoints||[]:scene?.hotspots||[];
 const rows=browserItems(items,{query,sort:scope==='scenes'&&prefs.sort==='distance'?'name':prefs.sort,descending:prefs.descending,type:scope==='bubbles'?prefs.type:'all',distance,label:(item:any)=>scope==='bubbles'?bubbleLabel(item,project,scene):item.name});
 // A bubble placed in the viewport must not disappear into the previous filter.
 // Do not clear a user's filter merely because the existing selection is hidden.
 useEffect(()=>{if(scope==='bubbles'&&selected&&items.some(item=>item.id===selected)&&!rows.some((row:any)=>row.item.id===selected)){setQuery('');setPrefs(value=>({...value,type:'all'}));}},[selected,scope]);
 return <><div className="sidebar-heading"><h3>Tour browser</h3><IconButton icon="close" label="Hide browser panel" onClick={onClose}/></div>
  <div className="browser-tabs" role="tablist" aria-label="Browse tour objects">{(['scenes','views','bubbles'] as Scope[]).map(value=><button role="tab" aria-selected={scope===value} className={scope===value?'active':''} key={value} onClick={()=>{onScope(value);setQuery('');}}>{value==='views'?'Views':value[0].toUpperCase()+value.slice(1)}</button>)}</div>
  {scope!=='scenes'&&<small className="browser-context">{scene?.name||'Select a scene'}</small>}
  <label className="browser-search"><Icon name="search"/><input aria-label={'Search '+scope} type="search" placeholder={'Search '+scope} value={query} onChange={e=>setQuery(e.target.value)}/></label>
  <div className="browser-order"><select aria-label="Sort objects" value={prefs.sort} onChange={e=>setPrefs({...prefs,sort:e.target.value})}><option value="name">Name</option><option value="created">Created order</option>{scope!=='scenes'&&<option value="distance">Distance</option>}</select><IconButton icon="swap_vert" label={prefs.descending?'Sort ascending':'Sort descending'} onClick={()=>setPrefs({...prefs,descending:!prefs.descending})}/>{prefs.sort==='distance'&&<IconButton icon="refresh" label="Refresh camera distances" onClick={refresh}/>}</div>
  {scope==='bubbles'&&<select aria-label="Filter bubbles" value={prefs.type} onChange={e=>setPrefs({...prefs,type:e.target.value})}><option value="all">All bubble types</option><option value="page">Information</option><option value="scene">Scene links</option><option value="viewpoint">View links</option></select>}
  <div className="object-list" ref={list} onPointerEnter={()=>setHeld(true)} onPointerLeave={()=>setHeld(false)} onFocus={()=>setFocused(true)} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setFocused(false);}}>
   {rows.map(({item,label,distance:metres}:any)=>{const thumb=scope==='scenes'?sceneThumbnail(item):scope==='views'?item.thumbnail:'';let image='';try{if(thumb)image=new URL(thumb,base).href;}catch{}return <button key={item.id} className={'object-row '+(item.id===selected?'selected':'')} aria-current={item.id===selected?'true':undefined} onClick={()=>scope==='scenes'?onScene(item.id):scope==='views'?onView(item.id):onBubble(item.id)}>
    {image?<img src={image} alt=""/>:<Icon name={scope==='bubbles'?(item.kind==='page'?'chat_info':item.kind==='scene'?'image_arrow_up':'photo'):scope==='views'?'photo':'image_arrow_up'}/>}
    <span><strong>{label||'Untitled'}</strong><small>{scope==='scenes'?`${item.viewpoints.length} views · ${item.hotspots.length} bubbles`:scope==='views'?(item.listed===false?'Unlisted':'Listed'):(item.kind==='page'?'Information':item.kind==='scene'?'Scene link':'View link')}{scope!=='scenes'&&prefs.sort==='distance'?` · ${metres.toFixed(1)} m`:''}</small></span></button>;})}
   {!rows.length&&<p className="muted">{query?'No matching objects.':scope==='scenes'?'Add a scene to begin.':`No ${scope} in this scene.`}</p>}
  </div><small className="browser-count">{rows.length} of {items.length} {scope}</small>{children}</>;
}
