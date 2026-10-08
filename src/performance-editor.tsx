import {Icon,InspectorSection} from './icons';
import React,{useEffect,useState} from 'react';
import type {PerformanceSettings,Project} from './model';
import type {TourRuntime} from './runtime';
import {defaultPerformance,PerformanceSettingsSchema,presetFile,tourPerformanceSettings} from '../shared/performance.mjs';
const controls:[keyof PerformanceSettings,string,number,number,number,string][]=[
 ['pixelRatio','Resolution cap',.5,2,.1,'Maximum desktop pixels per CSS pixel. Lower values reduce GPU load.'],
 ['lodSplatCount','Base splat target',0,8000000,100000,'0 uses Spark’s device-specific target. This is a detail target, not a GPU memory limit.'],
 ['lodSplatScale','Detail multiplier',.25,2,.05,'Multiplies the target. Higher values draw more splats.'],
 ['lodRenderScale','Minimum LoD pixel size',1,5,.25,'Higher values skip detail that occupies very few pixels.'],
 ['maxSh','Color detail (SH degree)',0,3,1,'Lower values reduce view-dependent color work.'],
 ['minSortIntervalMs','Sort interval · ms',0,200,5,'0 sorts as needed. Larger intervals reduce CPU work but may show ordering lag.'],
 ['minPixelRadius','Minimum splat radius · px',0,3,.1,'Cull very small splats. Higher values may cause missing detail.'],
 ['maxPixelRadius','Maximum splat radius · px',64,1024,32,'Limit large splat coverage; low values may cause holes near surfaces.'],
 ['maxStdDev','Gaussian extent',2,3,.05,'Smaller extents reduce overdraw, with less smooth blending.'],
 ['minAlpha','Opacity cutoff',0,.1,.001,'Skip faint splats. Larger values can remove fine detail.'],
 ['coneFov0','Central detail angle · degrees',0,180,5,'Full-detail cone. Use 0 for both angles to disable angular foveation.'],
 ['coneFov','Outer detail angle · degrees',0,180,5,'Must be at least the central angle.'],
 ['coneFoveate','Peripheral detail',.1,1,.05,'Lower values use coarser splats toward the edge.'],
 ['behindFoveate','Behind-view detail',.05,1,.05,'Lower values reduce detail outside the view.'],
 ['xrFoveation','XR compositor foveation',0,1,.1,'0 is sharpest; 1 favors speed. Headset/browser support varies.']
];
const controlGroups:[string,(keyof PerformanceSettings)[],boolean][]=[
 ['Precision & storage',[],true],
 ['Resolution',['pixelRatio'],true],
 ['Splat detail',['lodSplatCount','lodSplatScale','lodRenderScale','maxSh'],true],
 ['Sorting',['minSortIntervalMs'],false],
 ['Splat visibility',['minPixelRadius','maxPixelRadius','maxStdDev','minAlpha'],false],
 ['Peripheral detail',['coneFov0','coneFov','coneFoveate','behindFoveate'],false],
 ['VR rendering',['xrFoveation'],false]
];
export function PerformanceControls({value,onChange}:{value:PerformanceSettings;onChange:(value:PerformanceSettings)=>void}){
 return <div className="performance-controls">{controlGroups.map(([title,keys,open])=><InspectorSection key={title} title={title} icon={title==='VR rendering'?'head_mounted_device':'tune'} defaultOpen={open}>
  {controls.filter(([key])=>keys.includes(key)).map(([key,label,min,max,step,help])=><label className="field" key={key}><span>{label}</span><input title={help} aria-label={label} type="number" min={min} max={max} step={step} value={value[key] as number} onChange={e=>{
   if(e.target.value==='')return;const n=Number(e.target.value);if(!Number.isFinite(n)||n<min||n>max)return;
   const next={...value,[key]:n};if(key==='coneFov0'&&n>next.coneFov)next.coneFov=n;if(key==='coneFov'&&n<next.coneFov0)next.coneFov0=n;
   const result=PerformanceSettingsSchema.safeParse(next);if(result.success)onChange(result.data);
  }}/><small className="muted">{help}</small></label>)}
  {title==='Sorting'&&<label className="check"><input type="checkbox" checked={value.sortRadial} onChange={e=>onChange({...value,sortRadial:e.target.checked})}/>Radial sorting (off: depth sorting)</label>}
  {title==='Precision & storage'&&<><label className="check"><input type="checkbox" checked={value.pagedExtSplats} onChange={e=>onChange({...value,pagedExtSplats:e.target.checked})}/>Extended splat precision (ExtSplats)</label><p className="muted">Higher precision for streamed foreground and background splats. Uses 32 bytes per pooled splat instead of 16, with more memory and bandwidth. Changing this reloads the streaming pool while keeping your view.</p><p className="muted">This can reduce coordinate banding during loading; it cannot recover detail already lost in the source RAD.</p></>}
 </InspectorSection>)}</div>;
}
function PerformanceStats({runtime}:{runtime:TourRuntime|null}){const [text,setText]=useState('');useEffect(()=>{const t=setInterval(()=>{if(runtime)setText(`${Math.round(1000/runtime.frameMs)} FPS · ${runtime.spark.display.numSplats.toLocaleString()} displayed splats`);},500);return()=>clearInterval(t);},[runtime]);return <p className="muted" aria-live="off">{text||'Load a scene to measure performance.'}</p>;}
export interface PerformanceEditorSession {name:string;notice:string;source:string;}
export function PerformanceEditor({project,change,runtime,session,setSession}:{project:Project;change:(fn:(p:Project)=>void)=>void;runtime:TourRuntime|null;session:PerformanceEditorSession|null;setSession:React.Dispatch<React.SetStateAction<PerformanceEditorSession|null>>}){
 const library=project.performance||defaultPerformance(),preset=library.presets.find(p=>p.id===library.defaultPresetId)!;
 const draft=tourPerformanceSettings(library),source=JSON.stringify(preset);
 const initial:PerformanceEditorSession={name:preset.name,notice:'',source};
 const {name,notice}=session?.source===source?session:initial;
 const update=(patch:Partial<PerformanceEditorSession>)=>setSession(previous=>({...(previous||initial),...patch}));
 const setName=(name:string)=>update({name}),setNotice=(notice:string)=>update({notice});
 // Only unfinished naming stays in UI state. Every tuning control and preset
 // selection changes project data, so Save, autosave, undo and export agree.
 useEffect(()=>{if(!session||session.source!==source)setSession(initial);},[source,session?.source]);
 const apply=(settings:PerformanceSettings)=>change(p=>{p.performance=structuredClone(p.performance||defaultPerformance());p.performance.defaultSettings=settings;});
 const save=(copy:boolean)=>{if(!name.trim())return;const id=copy?crypto.randomUUID():preset.id;change(p=>{const next=structuredClone(p.performance||defaultPerformance()),item={id,name:name.trim(),settings:draft};if(copy)next.presets.push(item);else next.presets=next.presets.map(v=>v.id===id?item:v);next.defaultPresetId=id;delete next.defaultSettings;p.performance=next;});};
 return <><div className="eyebrow">PERFORMANCE</div><h2>Tune the experience.</h2><PerformanceStats runtime={runtime}/>
  <p className="muted">Adjustments are included in your tour and exports. Save the project to keep them after reopening. Named presets let you reuse a set of settings.</p>
  <label className="field"><span>Performance preset</span><select aria-label="Performance preset" value={library.defaultSettings?'':preset.id} onChange={e=>change(p=>{p.performance=structuredClone(p.performance||defaultPerformance());p.performance.defaultPresetId=e.target.value;delete p.performance.defaultSettings;})}>
   <option value="" disabled>Custom adjustments</option>{library.presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label className="field"><span>Preset name</span><input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label>
  <div className="actions"><button disabled={!name.trim()} onClick={()=>save(false)}><Icon name="save"/>Save preset</button><button disabled={!name.trim()||library.presets.length>=100} onClick={()=>save(true)}><Icon name="content_copy"/>Save as new preset</button><button title={`Delete preset: ${preset.name}`} disabled={library.presets.length===1} onClick={()=>change(p=>{const next=structuredClone(p.performance||defaultPerformance());next.presets=next.presets.filter(v=>v.id!==preset.id);next.defaultPresetId=next.presets[0].id;delete next.defaultSettings;p.performance=next;})}><Icon name="delete"/>Delete preset</button></div>
  <div className="actions"><button disabled={library.presets.length>=100} onClick={async()=>{try{const file=await window.studio!.importPerformancePreset();if(!file)return;const id=crypto.randomUUID();change(p=>{p.performance=structuredClone(p.performance||defaultPerformance());p.performance.presets.push({id,name:file.name,settings:file.settings});p.performance.defaultPresetId=id;delete p.performance.defaultSettings;});}catch(e){setNotice(String(e));}}}><Icon name="folder_open"/>Import preset…</button><button disabled={!name.trim()} onClick={async()=>{try{const file=await window.studio!.exportPerformancePreset(presetFile({name,settings:draft}));if(file)setNotice('Preset file saved.');}catch(e){setNotice(String(e));}}}><Icon name="ios_share"/>Export preset…</button></div>
  {notice&&<p role="status">{notice}</p>}<PerformanceControls value={draft} onChange={apply}/></>;
}
export function ViewerPerformance({project,runtime}:{project:Project|null;runtime:TourRuntime|null}){
 const library=project?.performance||defaultPerformance();
 const [selected,setSelected]=useState(library.defaultSettings?'':library.defaultPresetId),[value,setValue]=useState(runtime?.performanceSettings||tourPerformanceSettings(library));
 useEffect(()=>{
  if(!runtime)return;
  // Configuration can arrive after Settings is already open. Observe the actual
  // runtime rather than capturing its constructor defaults in a props effect.
  const sync=(settings:PerformanceSettings)=>{const key=JSON.stringify(settings);setValue(settings);setSelected(previous=>library.presets.some(p=>p.id===previous&&JSON.stringify(p.settings)===key)?previous:library.presets.find(p=>JSON.stringify(p.settings)===key)?.id||'');};
  sync(runtime.performanceSettings);return runtime.subscribePerformance(sync);
 },[runtime,project]);
 if(!project||!runtime)return <p role="status" className="muted">Loading tour settings…</p>;
 return <><PerformanceStats runtime={runtime}/><label className="field"><span>Performance preset</span><select aria-label="Performance preset" value={selected} onChange={e=>{const p=library.presets.find(p=>p.id===e.target.value)!;runtime.applyPerformance(p.settings);setSelected(p.id);}}><option value="" disabled>Custom adjustments</option>{library.presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><InspectorSection title="Advanced performance" icon="tune"><PerformanceControls value={value} onChange={s=>{runtime.applyPerformance(s);setSelected('');}}/></InspectorSection></>;
}
