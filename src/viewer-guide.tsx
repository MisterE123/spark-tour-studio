import React,{useEffect,useRef,useState} from 'react';
import type {Mode} from './model';
import {guideSteps} from '../shared/onboarding.mjs';
import {Icon,IconButton,type IconName} from './icons';
import {ControlHints} from './ui';

export function ViewerGuide({mode,touch,captured,step,onStep,onCapture,onClose}:{mode:Mode;touch:boolean;captured:boolean;step:number;onStep:(step:number)=>void;onCapture:()=>void;onClose:()=>void}){
 const heading=useRef<HTMLHeadingElement>(null),steps=guideSteps(mode,touch),current=steps[step];
 useEffect(()=>{heading.current?.focus({preventScroll:true});const target=document.querySelector(`[data-guide="${current.target}"]`);target?.classList.add('guide-highlight');return()=>target?.classList.remove('guide-highlight');},[step,current.target]);
 useEffect(()=>{const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!captured&&!document.pointerLockElement){event.preventDefault();onClose();}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[onClose,captured]);
 if(captured)return <aside className="mouse-captured-hint guide-practice-hint" role="region" aria-label="Tour guide"><Icon name="center_focus_strong" size={16}/>Move mouse to look<kbd>Esc</kbd>to return to guide</aside>;
 return <aside className="viewer-guide" role="region" aria-label="Tour guide">
  <header><span><Icon name="help"/>A little help · {step+1} of {steps.length}</span><IconButton icon="close" label="Skip guide" onClick={onClose}/></header>
  <div className="guide-symbol"><Icon name={current.icon as IconName} size={34}/></div>
  <h2 ref={heading} tabIndex={-1}>{current.title}</h2><p>{current.body}</p>
  {step===1&&!touch&&mode!=='jumps'&&<button className="guide-practice-button" onClick={onCapture}><Icon name="center_focus_strong"/>Try mouse look</button>}
  <div className="guide-progress" aria-label={`Step ${step+1} of ${steps.length}`}>{steps.map((_,i)=><span key={i} className={i<=step?'complete':''}/>)}</div>
  <footer><button onClick={onClose}>Skip guide</button><div>{step>0&&<IconButton icon="chevron_left" label="Previous guide step" onClick={()=>onStep(step-1)}/>}<button className="primary" onClick={()=>step===steps.length-1?onClose():onStep(step+1)}>{step===steps.length-1?'Ready to explore':'Next'}<Icon name={step===steps.length-1?'check_circle':'chevron_right'}/></button></div></footer>
 </aside>;
}

export function NavigationCoach({mode,touch,captured,ready,onCapture,onRelease,onGuide}:{mode:Mode;touch:boolean;captured:boolean;ready:boolean;onCapture:()=>void;onRelease:()=>void;onGuide:()=>void}){
 const [expanded,setExpanded]=useState(false),[dismissed,setDismissed]=useState(false);
 useEffect(()=>{setExpanded(false);setDismissed(false);},[mode,touch]);
 if(captured)return <div className="mouse-captured-hint" role="status"><Icon name="center_focus_strong" size={16}/>Mouse look <kbd>Esc</kbd> to free cursor<button onClick={onRelease} aria-label="Release mouse">Release</button></div>;
 if(dismissed)return <button className="movement-help-reopen" aria-label="Show movement help" onClick={()=>{setDismissed(false);setExpanded(true);}}><Icon name="help" size={18}/></button>;
 return <aside className="navigation-coach" data-guide="mouse" aria-label="Movement help">
  <div className="navigation-coach-row"><Icon name={touch?'open_with':'visibility'} size={18}/><span>{touch?'Drag to look':mode==='jumps'?'Drag to explore the view':'Cursor free · drag to look'}</span>{!touch&&mode!=='jumps'&&<button disabled={!ready} className="mouse-look-button" aria-label="Mouse look" onClick={onCapture}><Icon name="center_focus_strong" size={16}/>Mouse look</button>}<IconButton icon="help" label={expanded?'Hide movement details':'Show movement details'} aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}/><IconButton icon="close" label="Dismiss movement help" onClick={()=>setDismissed(true)}/></div>
  {expanded&&<div className="navigation-coach-detail"><ControlHints mode={mode} touch={touch}/><button onClick={onGuide}><Icon name="help"/>Show me around</button></div>}
 </aside>;
}
