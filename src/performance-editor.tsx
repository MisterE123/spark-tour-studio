import {Icon,InspectorSection} from './icons';
import React,{useEffect,useState} from 'react';
import type {PerformanceSettings,PerformanceLibrary,Project} from './model';
import type {TourRuntime} from './runtime';
import {defaultPerformance,PerformanceSettingsSchema,presetFile} from '../shared/performance.mjs';
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
export function PerformanceEditor({project,change,runtime}:{project:Project;change:(fn:(p:Project)=>void)=>void;runtime:TourRuntime|null}){
 const library=project.performance||defaultPerformance();const [selected,setSelected]=useState(library.defaultPresetId),[name,setName]=useState(''),[draft,setDraft]=useState<PerformanceSettings>(library.presets[0].settings),[notice,setNotice]=useState('');
 const preset=library.presets.find(p=>p.id===selected)||library.presets.find(p=>p.id===library.defaultPresetId)!;
 useEffect(()=>{setName(preset.name);setDraft(preset.settings);runtime?.applyPerformance(preset.settings);},[preset.id,JSON.stringify(preset.settings),preset.name,runtime]);
 const apply=(settings:PerformanceSettings)=>{setDraft(settings);runtime?.applyPerformance(settings);setNotice('Preview updated. Save a preset to keep these adjustments.');};
 const save=(copy:boolean)=>{if(!name.trim())return;const id=copy?crypto.randomUUID():preset.id;change(p=>{const next=structuredClone(p.performance||defaultPerformance());const item={id,name:name.trim(),settings:draft};if(copy)next.presets.push(item);else next.presets=next.presets.map(v=>v.id===id?item:v);p.performance=next;});setSelected(id);setNotice('Preset saved in this tour. Save the project to write it to disk.');};
 return <><div className="eyebrow">PERFORMANCE</div><h2>Tune the experience.</h2><PerformanceStats runtime={runtime}/><label className="field"><span>Performance preset</span><select aria-label="Performance preset" value={preset.id} onChange={e=>{setSelected(e.target.value);setNotice('');}}>{library.presets.map(p=><option key={p.id} value={p.id}>{p.name}{p.id===library.defaultPresetId?' · tour default':''}</option>)}</select></label><label className="field"><span>Preset name</span><input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></label><div className="actions"><button disabled={!name.trim()} onClick={()=>save(false)}><Icon name="save"/>Save preset</button><button disabled={!name.trim()||library.presets.length>=100} onClick={()=>save(true)}><Icon name="content_copy"/>Save as new preset</button></div><div className="actions"><button disabled={preset.id===library.defaultPresetId} onClick={()=>change(p=>{p.performance=structuredClone(library);p.performance.defaultPresetId=preset.id;})}><Icon name="check_circle"/>Use as tour default</button><button disabled={library.presets.length===1} onClick={()=>{change(p=>{const next=structuredClone(library);next.presets=next.presets.filter(v=>v.id!==preset.id);if(next.defaultPresetId===preset.id)next.defaultPresetId=next.presets[0].id;p.performance=next;});setSelected(library.presets.find(p=>p.id!==preset.id)!.id);}}><Icon name="delete"/>Delete preset</button></div><div className="actions"><button disabled={library.presets.length>=100} onClick={async()=>{try{const file=await window.studio!.importPerformancePreset();if(!file)return;const id=crypto.randomUUID();change(p=>{p.performance=structuredClone(library);p.performance.presets.push({id,name:file.name,settings:file.settings});});setSelected(id);setNotice('Preset imported.');}catch(e){setNotice(String(e));}}}><Icon name="folder_open"/>Import preset…</button><button disabled={!name.trim()} onClick={async()=>{try{const file=await window.studio!.exportPerformancePreset(presetFile({name,settings:draft}));if(file)setNotice('Preset file saved.');}catch(e){setNotice(String(e));}}}><Icon name="ios_share"/>Export preset…</button></div>{notice&&<p role="status">{notice}</p>}<PerformanceControls value={draft} onChange={apply}/></>;
}
export function ViewerPerformance({project,runtime}:{project:Project|null;runtime:TourRuntime|null}){const library=project?.performance||defaultPerformance();const [selected,setSelected]=useState(library.defaultPresetId),[value,setValue]=useState(runtime?.performanceSettings||library.presets[0].settings);useEffect(()=>{if(runtime){setValue(runtime.performanceSettings);setSelected(library.presets.find(p=>JSON.stringify(p.settings)===JSON.stringify(runtime.performanceSettings))?.id||'');}},[runtime,project]);return <><PerformanceStats runtime={runtime}/><label className="field"><span>Performance preset</span><select aria-label="Performance preset" value={selected} onChange={e=>{const p=library.presets.find(p=>p.id===e.target.value)!;setSelected(p.id);setValue(p.settings);runtime?.applyPerformance(p.settings);}}><option value="" disabled>Custom adjustments</option>{library.presets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><InspectorSection title="Advanced performance" icon="tune"><PerformanceControls value={value} onChange={s=>{setValue(s);setSelected('');runtime?.applyPerformance(s);}}/></InspectorSection></>;}
