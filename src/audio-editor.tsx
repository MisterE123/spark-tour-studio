import React,{useState} from 'react';
import type {AudioTrack} from './model';
import {Icon,InspectorSection} from './icons';

export function AudioEditor({value,onChange,label}:{value?:AudioTrack;onChange:(v:AudioTrack|undefined)=>void;label:string}){
 const [error,setError]=useState('');const track=value||{source:'',loop:false,volume:1};
 return <InspectorSection title={label} icon="volume_up" defaultOpen={!!value} className="audio-editor">
  <label className="field"><span>Audio URL or project path</span><input value={track.source} placeholder="Optional audio" onChange={e=>onChange({...track,source:e.target.value})}/></label>
  <div className="actions"><button title="Choose a local audio file" onClick={async()=>{try{const source=await window.studio?.importAsset('audio');if(source)onChange({...track,source});setError('');}catch(e){setError(String(e));}}}><Icon name="folder_open"/>Choose audio file…</button>{value&&<button title="Remove this audio track" onClick={()=>onChange(undefined)}><Icon name="delete"/>Remove audio</button>}</div>
  <label className="check"><input type="checkbox" checked={track.loop} onChange={e=>onChange({...track,loop:e.target.checked})}/>Loop audio</label>
  <label className="field"><span>Volume · {Math.round(track.volume*100)}%</span><input aria-label={`${label} volume`} type="range" min="0" max="1" step="0.05" value={track.volume} onChange={e=>onChange({...track,volume:Number(e.target.value)})}/></label>
  {error&&<p role="alert">{error}</p>}
 </InspectorSection>;
}
