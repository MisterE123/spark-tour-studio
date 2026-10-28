import React,{useState,useEffect,useRef} from 'react';import {createRoot} from 'react-dom/client';
import {TourRuntime} from './runtime';import type {Project,Hosting,TourScene,Mode,Page,Snapshot,Transform,Vec3} from './model';import {uid,emptyTransform} from './model';
import {blankProject,newScene,validateProject,renderPage,ProjectSchema,HostingSchema} from '../shared/project.mjs';
import {renderRichText,resolveRichReference,resolveContentResource,normalizeContentReference} from '../shared/rich-text.mjs';
import {Icon,IconButton,type IconName} from './icons';
import './style.css';
import './rich-text.css';

export function Button({children,onClick,primary=false,disabled=false,title}:React.PropsWithChildren<{onClick:()=>void;primary?:boolean;disabled?:boolean;title?:string}>){return <button title={title} className={primary?'primary':''} onClick={onClick} disabled={disabled}>{children}</button>;}
export function Field({label,children}:React.PropsWithChildren<{label:string}>){return <label className="field"><span>{label}</span>{React.Children.map(children,child=>{if(!React.isValidElement(child)||!['input','select','textarea'].includes(String(child.type)))return child;const control=child as React.ReactElement<{'aria-label'?:string}>;return React.cloneElement(control,{'aria-label':control.props['aria-label']||label});})}</label>;}
export function Vector({label,value,onChange}: {label:string;value:Vec3;onChange:(v:Vec3)=>void}){return <Field label={label}><div className="vector">{value.map((n,i)=><label key={i}><small>{'XYZ'[i]}</small><input aria-label={`${label} ${'XYZ'[i]}`} type="number" step="0.1" value={n} onChange={e=>{const next=[...value] as Vec3;next[i]=Number(e.target.value);onChange(next);}}/></label>)}</div></Field>;}
export function TransformForm({value,onChange}: {value:Transform;onChange:(v:Transform)=>void}){return <><Vector label="Position · meters" value={value.position} onChange={position=>onChange({...value,position})}/><Vector label="Rotation · degrees" value={value.rotation.map(x=>Math.round(x*180/Math.PI*100)/100) as Vec3} onChange={r=>onChange({...value,rotation:r.map(x=>x*Math.PI/180) as Vec3})}/><Field label="Uniform scale"><input type="number" min="0.0001" step="0.1" value={value.scale} onChange={e=>onChange({...value,scale:Math.max(.0001,Number(e.target.value))})}/></Field></>;}
export function Stage({onReady,onError}:{onReady:(r:TourRuntime)=>void;onError?:(message:string)=>void}){const host=useRef<HTMLDivElement>(null);const [error,setError]=useState('');useEffect(()=>{let r:TourRuntime;try{r=new TourRuntime(host.current!);onReady(r);}catch(e){const message=String(e);setError(message);onError?.(message);}return()=>r?.dispose();},[]);return <div className="stage" data-guide="scene" ref={host}>{error&&!onError&&<div className="stage-error">WebGL2 could not start.<br/>{error}</div>}</div>;}
function ControlHint({icon,title,keys,children}:{icon:IconName;title:string;keys?:string;children:React.ReactNode}){return <div className="control-hint"><Icon name={icon} size={22}/><div><strong>{title}</strong>{keys&&<kbd>{keys}</kbd>}<span>{children}</span></div></div>;}
export function ControlHints({mode,touch=false}:{mode:Mode;touch?:boolean}){return <div className="control-hints">
 <ControlHint icon="visibility" title="Look around" keys={touch?'Drag':'Left drag'}>{touch?'Drag the scene to look.':'Drag the scene with the cursor free.'}</ControlHint>
 {!touch&&mode!=='jumps'&&<ControlHint icon="center_focus_strong" title="Mouse look" keys="Esc">Choose Mouse look to capture. Escape frees the cursor.</ControlHint>}
 {mode==='jumps'?<ControlHint icon="photo" title="Change your view">Choose a named view below to glide there.</ControlHint>:<>
  <ControlHint icon={mode==='fly'?'drone':'directions_walk'} title={mode==='fly'?'Move through the scene':'Walk'} keys={touch?'Movement pad':'W A S D / ↑ ← ↓ →'}>{mode==='explore'?'You can also click the ground to walk there.':'Release the controls to stop.'}</ControlHint>
  <ControlHint icon="swap_vert" title={mode==='fly'?'Rise / descend':'Jump / crouch'} keys={touch?(mode==='fly'?'Up / down':'Jump / crouch'):'Space / E · Shift / Q'}>{mode==='fly'?'Space or E rises; Shift or Q descends.':'Space or E jumps; hold Shift or Q to crouch.'}</ControlHint>
 </>}
 {!touch&&mode!=='jumps'&&<ControlHint icon="open_with" title="Pan" keys="Right drag">Slide the view sideways or vertically.</ControlHint>}
 <ControlHint icon="chat_info" title="Open a story">{touch?'Tap':'Click'} a bubble. Scroll inside to see the full story.</ControlHint>
 </div>;}
export function ControlsHelp(){return <div className="controls-reference"><h3><Icon name="visibility"/>Look & select</h3><ControlHints mode="fly"/><h3><Icon name="directions_walk"/>Walking</h3><p><kbd>Space / E</kbd>Jump <kbd>Shift / Q</kbd>Crouch. Click the ground to walk; <kbd>Esc</kbd> or movement keys stop the route.</p><h3><Icon name="head_mounted_device"/>Headsets & touch</h3><div className="control-hints"><ControlHint icon="open_with" title="Touch">Drag the scene to look; use the movement pad and height buttons.</ControlHint><ControlHint icon="head_mounted_device" title="VR trigger">Hold to aim; release to teleport or select a bubble.</ControlHint><ControlHint icon="menu" title="VR grip">Open or close the tour menu.</ControlHint><ControlHint icon="drone" title="VR drone">One thumbstick moves; the other lifts and turns.</ControlHint></div></div>;}
export function useMobileControls(){const [choice,setChoice]=useState(()=>{try{return localStorage.getItem('spark-mobile-controls')||'auto';}catch{return 'auto';}}),[detected,setDetected]=useState(()=>matchMedia('(any-pointer: coarse)').matches||navigator.maxTouchPoints>0);useEffect(()=>{const query=matchMedia('(any-pointer: coarse)'),update=()=>setDetected(query.matches||navigator.maxTouchPoints>0);query.addEventListener('change',update);return()=>query.removeEventListener('change',update);},[]);return {choice,enabled:choice==='on'||choice==='auto'&&detected,setChoice:(value:string)=>{setChoice(value);try{localStorage.setItem('spark-mobile-controls',value);}catch{}}};}
export function MobileControlSetting({value,onChange}:{value:string;onChange:(value:string)=>void}){return <Field label="Mobile controls"><select aria-label="Mobile controls" value={value} onChange={e=>onChange(e.target.value)}><option value="auto">Automatic</option><option value="on">Always show</option><option value="off">Hide</option></select></Field>;}
function TouchAction({label,down,up}:{label:string;down:()=>void;up:()=>void}){return <button aria-label={label} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);down();}} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up}>{label}</button>;}
export function TouchPad({runtime,enabled,mode}:{runtime:TourRuntime|null;enabled?:boolean;mode?:Mode}){
 const active=useRef<number|null>(null),[knob,setKnob]=useState({x:0,y:0}),navigation=mode||runtime?.mode;
 const automatic=useMobileControls(),visible=enabled??automatic.enabled;
 useEffect(()=>{const reset=()=>{active.current=null;setKnob({x:0,y:0});runtime?.setTouch(0,0);runtime?.setTouchLift(0);runtime?.setTouchCrouch(false);};reset();window.addEventListener('blur',reset);return()=>{window.removeEventListener('blur',reset);runtime?.setTouch(0,0);runtime?.setTouchLift(0);runtime?.setTouchCrouch(false);};},[runtime,visible,navigation]);
 if(!visible||navigation==='jumps')return null;
 const stop=(event:React.PointerEvent<HTMLDivElement>)=>{if(active.current!==event.pointerId)return;active.current=null;setKnob({x:0,y:0});runtime?.setTouch(0,0);};
 const move=(event:React.PointerEvent<HTMLDivElement>)=>{const bounds=event.currentTarget.getBoundingClientRect(),x=(event.clientX-bounds.left-bounds.width/2)/(bounds.width/2),y=(event.clientY-bounds.top-bounds.height/2)/(bounds.height/2),length=Math.max(1,Math.hypot(x,y)),next={x:x/length,y:y/length};setKnob(next);runtime?.setTouch(next.x,next.y);};
 return <div className="mobile-controls"><div className="touch-pad" aria-label="Touch movement pad" data-active={active.current!==null} style={{'--stick-x':knob.x,'--stick-y':knob.y} as React.CSSProperties} onPointerDown={event=>{if(active.current!==null)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);active.current=event.pointerId;move(event);}} onPointerMove={event=>{if(active.current===event.pointerId)move(event);}} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}><span className="touch-stick" aria-hidden="true"/></div><div className="touch-actions">{navigation==='explore'?<><TouchAction label="Crouch" down={()=>runtime?.setTouchCrouch(true)} up={()=>runtime?.setTouchCrouch(false)}/><TouchAction label="Jump" down={()=>runtime?.requestJump()} up={()=>{}}/></>:<><TouchAction label="Fly up" down={()=>runtime?.setTouchLift(1)} up={()=>runtime?.setTouchLift(0)}/><TouchAction label="Fly down" down={()=>runtime?.setTouchLift(-1)} up={()=>runtime?.setTouchLift(0)}/></>}</div></div>;
}

export function ContentModal({page,base,onClose,runtime}:{page:Page;base:string;onClose:()=>void;runtime:TourRuntime|null}){
 const frame=useRef<HTMLIFrameElement>(null),dialog=useRef<HTMLElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const controls=()=>Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex]')||[]).filter(element=>element.tabIndex>=0&&element.getClientRects().length>0);
  const focusFirst=()=>{(controls()[0]||dialog.current)?.focus({preventScroll:true});};
  const key=(event:KeyboardEvent)=>{
   if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey)return;
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
   if(event.key!=='Tab')return;
   const items=controls(),first=items[0],last=items.at(-1),active=document.activeElement;
   if(!first){event.preventDefault();dialog.current?.focus();return;}
   if(!dialog.current?.contains(active)||event.shiftKey&&active===first||!event.shiftKey&&active===last){event.preventDefault();(event.shiftKey?last:first)?.focus();}
  };
  const retainFocus=(event:FocusEvent)=>{if(!dialog.current?.contains(event.target as Node))focusFirst();};
  document.addEventListener('keydown',key,true);document.addEventListener('focusin',retainFocus);focusFirst();
  return()=>{document.removeEventListener('keydown',key,true);document.removeEventListener('focusin',retainFocus);if(opener?.isConnected)opener.focus({preventScroll:true});};
 },[page.id]);
 useEffect(()=>{if(runtime)runtime.blocked=true;const listen=(e:MessageEvent)=>{if(e.source!==frame.current?.contentWindow)return;const data=e.data;if(!data||data.type!=='spark-tour-action')return;if(data.action==='close')close.current();else if(data.action==='scene'){const scene=runtime?.project?.scenes.find(s=>s.id===data.sceneId);if(scene&&(data.viewpointId===undefined||typeof data.viewpointId==='string'&&scene.viewpoints.some(v=>v.id===data.viewpointId))){void runtime?.selectScene(scene.id,data.viewpointId);close.current();}}else if(data.action==='viewpoint'&&runtime?.active?.viewpoints.some(v=>v.id===data.viewpointId)){runtime.jump(data.viewpointId);close.current();}};window.addEventListener('message',listen);return()=>{window.removeEventListener('message',listen);if(runtime){runtime.blocked=false;if(!runtime.renderer.xr.isPresenting)runtime.closeContent(page.id);}};},[page,runtime]);
 const custom=resolveContentResource(page.html,base);
 return <div className="modal-shade"><section ref={dialog} tabIndex={-1} className="content-modal" role="dialog" aria-modal="true" aria-label={page.title}><header><h2>{page.title}</h2><IconButton icon="close" label="Close content" onClick={onClose}>Close</IconButton></header>{custom?<iframe className="custom-content-frame" ref={frame} title={page.title} sandbox="allow-scripts allow-forms allow-popups" src={custom}/>:<div className="content-body" role="region" aria-label="Story content" tabIndex={0}>{page.blocks.map((block,index)=>{
  if(block.type==='text')return block.richText?<div key={index} className="rich-content" dangerouslySetInnerHTML={{__html:renderRichText(block.richText,base)}}/>:<p key={index}>{block.text}</p>;
  const url=block.type==='link'?resolveRichReference(block.url,base):resolveContentResource(block.url,base);
  if(block.type==='image')return url||block.text?<figure key={index}>{url&&<img src={url} alt={block.text}/>}{block.text&&<figcaption>{block.text}</figcaption>}</figure>:null;
  if(block.type==='link')return url||block.text?<p key={index}>{url?<a href={url} target="_blank" rel="noopener noreferrer">{block.text||normalizeContentReference(block.url)}</a>:block.text}</p>:null;
  return url?<iframe key={index} className="content-embed" title={block.text||'Embedded content'} src={url} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="fullscreen"/>:block.text?<p key={index}>{block.text}</p>:null;
 })}</div>}</section></div>;
}
