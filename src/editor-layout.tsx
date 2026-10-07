import React,{useState,useEffect} from 'react';
import {editorLayout} from '../shared/editor-browser.mjs';
const key='spark-editor-layout-v1';
export function useEditorLayout(){
 const [layout,setLayout]=useState(()=>{try{return editorLayout(JSON.parse(localStorage.getItem(key)||'{}'),innerWidth);}catch{return editorLayout({},innerWidth);}});
 useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(layout));}catch{}},[layout]);
 useEffect(()=>{const resize=()=>setLayout(value=>editorLayout(value,innerWidth));window.addEventListener('resize',resize);return()=>window.removeEventListener('resize',resize);},[]);
 const toggle=(panel:'browser'|'inspector')=>setLayout(value=>({...value,[panel]:!value[panel]}));
 const reset=()=>setLayout(editorLayout({},innerWidth));
 const separator=(panel:'browser'|'inspector')=><div className={'panel-resizer resize-'+panel} role="separator" aria-label={'Resize '+panel+' panel'} aria-orientation="vertical" aria-valuenow={panel==='browser'?layout.left:layout.right} tabIndex={0}
  onDoubleClick={reset}
  onKeyDown={e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const delta=(e.key==='ArrowRight'?1:-1)*(panel==='browser'?1:-1)*20;setLayout(value=>editorLayout({...value,[panel==='browser'?'left':'right']:(panel==='browser'?value.left:value.right)+delta},innerWidth));}}
  onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.dataset.dragging='true';}}
  onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;setLayout(value=>editorLayout({...value,[panel==='browser'?'left':'right']:panel==='browser'?e.clientX:innerWidth-e.clientX},innerWidth));}}
  onPointerUp={e=>{delete e.currentTarget.dataset.dragging;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
  onPointerCancel={e=>{delete e.currentTarget.dataset.dragging;}}/>;
 return {layout,toggle,show:(panel:'browser'|'inspector')=>setLayout(value=>({...value,[panel]:true})),reset,separator,style:{'--sidebar-width':(layout.browser?layout.left:0)+'px','--inspector-width':(layout.inspector?layout.right:0)+'px'} as React.CSSProperties};
}
