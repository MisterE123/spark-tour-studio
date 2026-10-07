import React,{useState,useId} from 'react';
import {createPortal} from 'react-dom';
import {materialSymbols,type IconName} from './material-symbols';
import './icons.css';

export type {IconName} from './material-symbols';

/** Decorative by default: the containing control supplies its accessible name. */
export function Icon({name,size=20,className='',...props}:{name:IconName;size?:number;className?:string}&Omit<React.SVGProps<SVGSVGElement>,'name'>){
 return <svg {...props} className={`material-icon ${className}`} width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false"><path d={materialSymbols[name]}/></svg>;
}

export function IconButton({icon,label,children,className='',...props}:{icon:IconName;label:string}&React.ButtonHTMLAttributes<HTMLButtonElement>){
 const id=useId(),[tooltip,setTooltip]=useState<{left:number;top:number;above:boolean}|null>(null);
 const show=(button:HTMLButtonElement)=>{const rect=button.getBoundingClientRect(),above=rect.bottom+45>innerHeight;setTooltip({left:Math.max(115,Math.min(innerWidth-115,rect.left+rect.width/2)),top:above?rect.top-7:rect.bottom+7,above});};
 return <><button {...props} type={props.type||'button'} title={tooltip?undefined:label} aria-label={label} aria-describedby={tooltip?id:undefined} className={`icon-button ${children?'icon-with-label':''} ${className}`}
  onPointerEnter={event=>{props.onPointerEnter?.(event);if(event.pointerType==='mouse')show(event.currentTarget);}} onPointerLeave={event=>{props.onPointerLeave?.(event);setTooltip(null);}}
  onFocus={event=>{props.onFocus?.(event);if(event.currentTarget.matches(':focus-visible'))show(event.currentTarget);}} onBlur={event=>{props.onBlur?.(event);setTooltip(null);}}
  onClick={event=>{setTooltip(null);props.onClick?.(event);}}><Icon name={icon}/>{children}</button>{tooltip&&createPortal(<span role="tooltip" id={id} className="control-tooltip" style={{left:tooltip.left,top:tooltip.top,transform:tooltip.above?'translate(-50%,-100%)':'translateX(-50%)'}}>{label}</span>,document.body)}</>;
}

export function InspectorSection({title,icon,defaultOpen=false,children,className=''}:React.PropsWithChildren<{title:string;icon?:IconName;defaultOpen?:boolean;className?:string}>){
 return <details className={`inspector-section ${className}`} open={defaultOpen||undefined}><summary>{icon&&<Icon name={icon}/>}<span>{title}</span></summary><div className="inspector-section-body">{children}</div></details>;
}
