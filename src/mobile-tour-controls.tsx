import React,{useEffect,useRef,useState} from 'react';
import type {Mode,Project,TourScene,Viewpoint} from './model';
import {listedViewpoints} from '../shared/viewpoints.mjs';
import {Icon,IconButton} from './icons';
import {TourIdentity,TourFooter,brandUrl} from './tour-branding';
import {modeName,modeIcon,tourSections} from './tour-navigation';
import {resolveBranding} from '../shared/branding.mjs';
import './mobile-tour-controls.css';

const compactQuery='(max-width: 700px), (max-width: 1100px) and (max-height: 600px), (max-width: 1200px) and (any-pointer: coarse)';
export function useCompactViewer(){
 const [compact,setCompact]=useState(()=>matchMedia(compactQuery).matches);
 useEffect(()=>{const query=matchMedia(compactQuery),change=()=>setCompact(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return compact;
}

export function MobileTourControls({project,scene,view,mode,open,onOpen,onClose,onScene,onView,onMode,onHome,onHelp,onSettings,onXR}:{project:Project;scene?:TourScene;view?:Viewpoint;mode:Mode;open:boolean;onOpen:()=>void;onClose:()=>void;onScene:(id:string)=>void;onView:(id:string)=>void;onMode:(mode:Mode)=>void;onHome:()=>void;onHelp:()=>void;onSettings:(opener:HTMLButtonElement)=>void;onXR?:()=>void}){
 const trigger=useRef<HTMLButtonElement>(null),close=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
 useEffect(()=>{if(open)close.current?.focus({preventScroll:true});else if(wasOpen.current)trigger.current?.focus({preventScroll:true});wasOpen.current=open;},[open]);
 useEffect(()=>{if(!open)return;const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();onClose();}};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[open,onClose]);
 const views=listedViewpoints(scene) as Viewpoint[],index=views.findIndex(v=>v.id===view?.id);
 const branding=resolveBranding(project),base=new URL('./',location.href).href,logo=brandUrl(branding.logo,base);
 const act=(fn:()=>void)=>{onClose();fn();};
 return <>
  <nav className="compact-viewer-header" aria-label="Tour navigation">
   <button className="compact-scene-name" aria-label={tourSections.scenes+': '+(scene?.name||project.title)} aria-haspopup="dialog" aria-expanded={open} onClick={onOpen}>{logo?<img className="compact-brand-logo" src={logo} alt={branding.name?branding.name+' logo':'Tour logo'}/>:<Icon name="image_arrow_up"/>}<span>{scene?.name||project.title}</span><Icon name="expand_more" size={16}/></button>
   <button ref={trigger} className="compact-menu-button" aria-label="Tour controls" aria-expanded={open} aria-controls="mobile-tour-controls" onClick={()=>open?onClose():onOpen()}><Icon name="menu"/></button>
  </nav>
  {!open&&mode==='jumps'&&scene?.modes.includes('jumps')&&!!views.length&&<div className="compact-viewer-bottom">
   {view?.description&&<div className="view-description">{view.description}</div>}
   <nav className="compact-view-switcher" aria-label={tourSections.views}>
    {views.length>1&&<IconButton icon="chevron_left" label="Previous viewpoint" onClick={()=>onView(views[(Math.max(0,index)-1+views.length)%views.length].id)}/>}
    <button onClick={onOpen} aria-label="Choose viewpoint" aria-haspopup="dialog"><Icon name="photo"/><span>{view?.name||tourSections.views}</span>{views.length>1&&<small>{Math.max(0,index)+1} / {views.length}</small>}</button>
    {views.length>1&&<IconButton icon="chevron_right" label="Next viewpoint" onClick={()=>onView(views[(index+1)%views.length].id)}/>}
   </nav>
  </div>}
  {open&&<div className="mobile-tour-menu-shade" onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
   <section id="mobile-tour-controls" className="mobile-tour-menu floating" role="dialog" aria-modal="true" aria-label="Tour controls" onKeyDown={event=>{if(event.key!=='Tab')return;const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),select:not(:disabled)'));if(!items.length)return;const first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}>
    <header><div>{branding.name||logo?<TourIdentity project={project} base={base} compact/>:<small>{project.title}</small>}<h2>Tour controls</h2></div><div className="mobile-tour-menu-header-actions"><IconButton icon="home" label="Home" onClick={()=>act(onHome)}/><button ref={close} aria-label="Close tour controls" onClick={onClose}><Icon name="close"/></button></div></header>
    <div className="mobile-tour-menu-scroll">
     <label className="field"><span>{tourSections.scenes}</span><select aria-label={tourSections.scenes} value={scene?.id||''} onChange={event=>act(()=>onScene(event.target.value))}>{project.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <h3 className="mobile-menu-label">{tourSections.move}</h3>
     <div className="mobile-mode-choice" role="group" aria-label="Movement mode" data-guide="modes">{scene?.modes.map(m=><button key={m} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>act(()=>onMode(m))}><Icon name={modeIcon[m]}/>{modeName[m]}</button>)}</div>
     <nav className="mobile-tour-actions" aria-label="Tour tools">
      <button aria-haspopup="dialog" onClick={()=>{const opener=trigger.current;if(opener)act(()=>onSettings(opener));}}><Icon name="settings"/>{tourSections.options}</button><button onClick={()=>act(onHelp)}><Icon name="help"/>Tour help</button>
      {onXR&&<button onClick={()=>act(onXR)}><Icon name="head_mounted_device"/>Enter VR</button>}
     </nav>
     {!!views.length&&scene?.modes.includes('jumps')&&<div className="mobile-view-list" role="group" aria-label={tourSections.views}><h3 className="mobile-menu-label">{tourSections.views}</h3>{views.map(v=><button key={v.id} aria-pressed={view?.id===v.id} className={view?.id===v.id?'active':''} onClick={()=>act(()=>onView(v.id))}><span>{v.name}</span><Icon name="chevron_right" size={18}/></button>)}</div>}
     <TourFooter project={project}/>
    </div>
   </section>
  </div>}
 </>;
}
