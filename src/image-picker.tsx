import React,{useState} from 'react';
export function ImagePicker({value,base,onChange,label='Image',disabled=false}:{value:string;base:string;onChange:(ref:string)=>void;label?:string;disabled?:boolean}){
 const [drag,setDrag]=useState(false),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const take=async(file?:File)=>{if(disabled||working)return;setWorking(true);setError('');try{const ref=file?await window.studio!.importImageFile(file):await window.studio!.importAsset('image');if(ref)onChange(ref);}catch(e){setError(String(e));}finally{setWorking(false);}};
 let preview='';try{if(value)preview=new URL(value,base).href;}catch{}
 return <section className={'image-picker '+(drag?'dragging':'')} aria-label={label+' upload'} onDragOver={e=>{e.preventDefault();if(!disabled)setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);if(e.dataTransfer.files[0])void take(e.dataTransfer.files[0]);}}>
  {preview&&<img src={preview} alt={label+' preview'}/>}
  <small>{label} · drop an image here</small><div className="actions"><button disabled={disabled||working} onClick={()=>void take()}>{working?'Adding image…':'Choose image file…'}</button>{value&&<button disabled={disabled||working} onClick={()=>onChange('')}>Clear</button>}</div>
  <label className="field"><span>{label} URL or project path</span><input disabled={disabled||working} value={value} placeholder="https://…" onChange={e=>onChange(e.target.value)}/></label>{error&&<small role="alert" className="image-error">{error}</small>}
 </section>;
}
