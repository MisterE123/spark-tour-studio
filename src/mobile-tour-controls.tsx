import React,{useEffect,useRef,useState} from 'react';
import type {Mode,Project,TourScene,Viewpoint} from './model';
import {listedViewpoints} from '../shared/viewpoints.mjs';
import {Icon,IconButton,type IconName} from './icons';
import './mobile-tour-controls.css';

const compactQuery='(max-width: 700px), (max-width: 1100px) and (max-height: 600px), (max-width: 1200px) and (any-pointer: coarse)';
export function useCompactViewer(){
 const [compact,setCompact]=useState(()=>matchMedia(compactQuery).matches);
 useEffect(()=>{const query=matchMedia(compactQuery),change=()=>setCompact(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return compact;
}

const names:Record<Mode,string>={jumps:'Viewpoints',fly:'Drone',explore:'Walk'};
const icons:Record<Mode,IconName>={jumps:'photo',fly:'drone',explore:'directions_walk'};
export function MobileTourControls({project,scene,view,mode,open,onOpen,onClose,onScene,onView,onMode,onHome,onHelp,onSettings,onXR}:{project:Project;scene?:TourScene;view?:Viewpoint;mode:Mode;open:boolean;onOpen:()=>void;onClose:()=>void;onScene:(id:string)=>void;onView:(id:string)=>void;onMode:(mode:Mode)=>void;onHome:()=>void;onHelp:()=>void;onSettings:()=>void;onXR:()=>void}){
 const trigger=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
 useEffect(()=>{if(open)close.current?.focus({preventScroll:true});else if(wasOpen.current)trigger.current?.focus({preventScroll:true});wasOpen.current=open;},[open]);
 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,onClose]);
 const views=listedViewpoints(scene) as Viewpoint[],index=views.findIndex(v=>v.id===view?.id);
 const act=(fn:()=>void)=>{onClose();fn();};
 return <>
  <div className="compact-viewer-header">
   <button className="compact-scene-name" aria-label={'Choose scene: '+(scene?.name||'Tour')} onClick={onOpen}><Icon name="image_arrow_up"/><span>{scene?.name||project.title}</span><Icon name="expand_more" size={16}/></button>
   <button ref={trigger} className="compact-menu-button" aria-label="Tour controls" aria-expanded={open} aria-controls="mobile-tour-controls" onClick={()=>open?onClose():onOpen()}><Icon name="menu"/></button>
  </div>
  {!open&&mode==='jumps'&&scene?.modes.includes('jumps')&&!!views.length&&<div className="compact-viewer-bottom">
   {view?.description&&<div className="view-description">{view.description}</div>}
   <nav className="compact-view-switcher" aria-label="Viewpoints">
    {views.length>1&&<IconButton icon="chevron_left" label="Previous viewpoint" onClick={()=>onView(views[(Math.max(0,index)-1+views.length)%views.length].id)}/>}
    <button onClick={onOpen} aria-label="Choose viewpoint"><Icon name="photo"/><span>{view?.name||'Viewpoints'}</span>{views.length>1&&<small>{Math.max(0,index)+1} / {views.length}</small>}</button>
    {views.length>1&&<IconButton icon="chevron_right" label="Next viewpoint" onClick={()=>onView(views[(index+1)%views.length].id)}/>}
   </nav>
  </div>}
  {open&&<div className="mobile-tour-menu-shade" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
   <section id="mobile-tour-controls" className="mobile-tour-menu floating" role="dialog" aria-modal="true" aria-label="Tour controls" onKeyDown={event=>{if(event.key!=='Tab')return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button:not(:disabled),select:not(:disabled)'));if(!items.length)return;const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}>
    <header><div><small>{project.title}</small><h2>Explore the tour</h2></div><button ref={close} aria-label="Close tour controls" onClick={onClose}><Icon name="close"/></button></header>
    <div className="mobile-tour-menu-scroll">
     <label className="field"><span>Scene</span><select aria-label="Scene" value={scene?.id||''} onChange={event=>act(()=>onScene(event.target.value))}>{project.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <div className="mobile-mode-choice" role="group" aria-label="Movement mode" data-guide="modes">{scene?.modes.map(m=><button key={m} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>act(()=>onMode(m))}><Icon name={icons[m]}/>{names[m]}</button>)}</div>
     {!!views.length&&scene?.modes.includes('jumps')&&<div className="mobile-view-list" role="group" aria-label="Saved viewpoints"><h3>Viewpoints</h3>{views.map((v,i)=><button key={v.id} aria-pressed={view?.id===v.id} className={view?.id===v.id?'active':''} onClick={()=>act(()=>onView(v.id))}><span className="view-number">{i+1}</span><span>{v.name}</span><Icon name="chevron_right" size={18}/></button>)}</div>}
     <nav className="mobile-tour-actions" aria-label="Tour tools">
      <button onClick={()=>act(onSettings)}><Icon name="settings"/>Settings</button><button onClick={()=>act(onHelp)}><Icon name="help"/>Tour help</button>
      <button onClick={()=>act(onXR)}><Icon name="head_mounted_device"/>Enter VR</button><button onClick={()=>act(onHome)}><Icon name="menu"/>Return to start</button>
     </nav>
    </div>
   </section>
  </div>}
 </>;
}
