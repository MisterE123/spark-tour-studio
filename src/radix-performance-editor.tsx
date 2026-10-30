import {useEffect,useState} from 'react';
import {InspectorSection} from './icons';
import type {PerformanceSettings,RadixPerformanceSettings,ScenePerformanceSettings,Project,TourScene,Viewpoint} from './model';
import type {TourRuntime} from './runtime';
import {PerformanceSettingsSchema,ScenePerformanceSettingsSchema,scenePerformanceSettings,tourPerformanceSettings} from '../shared/performance.mjs';
import {radixPerformanceSettings} from '../shared/radix-performance.mjs';

type Control<Key>=[Key,string,number,number,number,string];
const commonControls:Control<keyof PerformanceSettings>[]=[
 ['pixelRatio','Resolution cap',.5,2,.1,'Maximum desktop pixels per CSS pixel. Lower values reduce rendering work.'],
 ['maxSh','Color detail (SH degree)',0,3,1,'Highest view-dependent color band to draw. The source file must contain it.'],
 ['minPixelRadius','Minimum splat radius · px',0,3,.1,'Cull very small splats. Higher values can remove fine detail.'],
 ['maxPixelRadius','Maximum splat radius · px',64,1024,32,'Limit large splats. Low values can open holes near surfaces.'],
 ['maxStdDev','Gaussian extent',2,3,.05,'Smaller extents reduce overdraw, with less smooth blending.'],
 ['minAlpha','Opacity cutoff',0,.1,.001,'Skip faint splats. Higher values can remove fine detail.'],
 ['xrFoveation','XR compositor foveation',0,1,.1,'0 favors sharpness; 1 favors speed. Support depends on the headset and browser.']
];
const radixControls:Control<keyof RadixPerformanceSettings>[]=[
 ['selectedSplatBudget','Selected splat budget · per asset',50000,32000000,250000,'Selected detail limit for each asset. The scene and splat background have separate budgets.'],
 ['residentSplatBudget','Resident splat budget · per asset',50000,64000000,1000000,'Retained splat-data target for each asset. Required coarse coverage, textures and pending work also use memory.'],
 ['lodBaseDistance','Detail distance · meters',.1,1000,.5,'Distance to a leaf at which its finest level begins to give way to coarser levels.'],
 ['lodMultiplier','Level distance multiplier',1.2,10,.1,'Space successive detail levels farther apart.'],
 ['lodRangeMin','Finest allowed level',0,31,1,'Level 0 is the source’s finest level. Higher values skip its finest detail.'],
 ['lodRangeMax','Coarsest allowed level',0,31,1,'Levels beyond the source’s available levels are clamped to its last level.'],
 ['lodBehindPenalty','Behind-view distance factor',1,20,.25,'Use coarser detail behind the camera. 1 treats all directions equally.'],
 ['lodUnderfill','Loading fallback levels',0,31,1,'Allow this many coarser resident levels while the selected level loads. Previous coverage is retained.'],
 ['lodUpdateDistance','Detail update distance · meters',0,10,.05,'Reconsider streamed detail after the camera moves this far.'],
 ['lodUpdateAngle','Detail update angle · degrees',0,180,5,'Reconsider streamed detail after the camera turns this far.'],
 ['autoSortDistance','Sort movement threshold · meters',0,5,.01,'CPU sorting requests a new order after this movement. GPU sorting is performed each frame.'],
 ['autoSortAngle','Sort turning threshold · degrees',0,90,1,'CPU sorting requests a new order after this turn.'],
 ['sortGuard','CPU sort view margin',0,4,.1,'0 keeps all splats in the sort. A positive margin culls outside a widened head view; large turns can reveal ordering lag.'],
 ['minContribution','Minimum visible contribution',0,20,.1,'EWA only: cull splats with very little projected opacity and area. 0 keeps them.'],
 ['blurAmount','Antialiasing blur',0,2,.05,'Pixel-area blur with opacity compensation.'],
 ['preBlurAmount','Additional pre-blur',0,2,.05,'Additional pixel-area blur before projection.'],
 ['xrResolutionScale','XR resolution scale',.25,2,.05,'Applied when the next VR session begins. Higher values draw more eye-buffer pixels.']
];

export function RadixPerformanceControls({value,onChange,lockedRadixKeys=[]}:{value:PerformanceSettings;onChange:(value:PerformanceSettings)=>void;lockedRadixKeys?:readonly (keyof RadixPerformanceSettings)[]}){
 const specific=radixPerformanceSettings(value);
 const publish=(next:PerformanceSettings)=>{const parsed=PerformanceSettingsSchema.safeParse(next);if(parsed.success)onChange(parsed.data);};
 const change=(patch:Partial<RadixPerformanceSettings>)=>{
  const next={...specific,...patch};
  if(patch.selectedSplatBudget!==undefined&&next.residentSplatBudget<next.selectedSplatBudget)next.residentSplatBudget=next.selectedSplatBudget;
  if(patch.residentSplatBudget!==undefined&&next.selectedSplatBudget>next.residentSplatBudget)next.selectedSplatBudget=next.residentSplatBudget;
  if(patch.lodRangeMin!==undefined&&next.lodRangeMin>next.lodRangeMax)next.lodRangeMax=next.lodRangeMin;
  if(patch.lodRangeMax!==undefined&&next.lodRangeMax<next.lodRangeMin)next.lodRangeMin=next.lodRangeMax;
  publish({...value,radix:next});
 };
 const numeric=(keys:(keyof RadixPerformanceSettings)[])=>radixControls.filter(([key])=>keys.includes(key)).map(([key,label,min,max,step,help])=><label className="field" key={key}><span>{label}</span><input aria-label={label} title={help} type="number" disabled={lockedRadixKeys.includes(key)} min={min} max={max} step={step} value={specific[key] as number} onChange={event=>{if(!event.target.value)return;const n=Number(event.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)change({[key]:n});}}/><small className="muted">{lockedRadixKeys.includes(key)?'Authored for this scene or viewpoint. ':''}{help}</small></label>);
 const common=(keys:(keyof PerformanceSettings)[])=>commonControls.filter(([key])=>keys.includes(key)).map(([key,label,min,max,step,help])=><label className="field" key={key}><span>{label}</span><input aria-label={label} title={help} type="number" min={min} max={max} step={step} value={value[key] as number} onChange={event=>{if(!event.target.value)return;const n=Number(event.target.value);if(Number.isFinite(n)&&n>=min&&n<=max)publish({...value,[key]:n});}}/><small className="muted">{help}</small></label>);
 return <div className="performance-controls" data-renderer="radix">
  <InspectorSection title="Automatic adjustment" icon="tune" defaultOpen>
   <label className="check"><input type="checkbox" checked={value.adaptiveDetail??false} onChange={event=>{if(event.target.checked)publish({...value,adaptiveDetail:true,adaptiveTargetFps:value.adaptiveTargetFps??60});else{const {adaptiveDetail,adaptiveTargetFps,...manual}=value;publish(manual);}}}/>Automatically adjust detail for smoother movement</label>
   <p className="muted">Temporarily lowers the selected splat budget when visible frames stay slow, then restores it cautiously. Your saved preset stays unchanged.</p>
   <label className="field"><span>Target frame rate</span><input aria-label="Target frame rate" type="number" min="30" max="60" step="5" disabled={!value.adaptiveDetail} value={value.adaptiveTargetFps??60} onChange={event=>{if(!event.target.value)return;publish({...value,adaptiveTargetFps:Number(event.target.value)});}}/><small className="muted">Desktop goal. VR follows the active headset refresh rate.</small></label>
  </InspectorSection>
  <InspectorSection title="Resolution & color" icon="tune" defaultOpen>{common(['pixelRatio','maxSh'])}</InspectorSection>
  <InspectorSection title="Streamed detail" icon="tune" defaultOpen>
   <p className="muted">These controls apply to level-of-detail assets. A scene and splat background each receive this budget; the readout shows their totals. A single SOG file retains its full splat set.</p>
   {numeric(['selectedSplatBudget','residentSplatBudget'])}
   <label className="field"><span>Detail budget behavior</span><select aria-label="Detail budget behavior" disabled={lockedRadixKeys.includes('lodBudgetMode')} value={specific.lodBudgetMode} onChange={event=>change({lodBudgetMode:event.target.value as RadixPerformanceSettings['lodBudgetMode']})}><option value="limit">Distance first · budget is a cap</option><option value="target">Fill budget · favor more detail</option></select><small className="muted">{lockedRadixKeys.includes('lodBudgetMode')?'Authored for this scene or viewpoint. ':''}Fill budget increases detail toward your selected limit. Source quality and available levels still apply.</small></label>
   {numeric(['lodBaseDistance','lodMultiplier','lodRangeMin','lodRangeMax'])}
  </InspectorSection>
  <InspectorSection title="Streaming behavior" icon="tune">{numeric(['lodBehindPenalty','lodUnderfill','lodUpdateDistance','lodUpdateAngle'])}</InspectorSection>
  <InspectorSection title="Projection & sorting" icon="tune">
   <label className="field"><span>Projection method</span><select aria-label="Projection method" value={specific.method} onChange={event=>change({method:event.target.value as RadixPerformanceSettings['method']})}><option value="ewa">EWA · standard Gaussian projection</option><option value="3dgut">3DGUT</option><option value="htgs">HTGS</option><option value="raygs">RayGS</option></select></label>
   <label className="field"><span>Sorting</span><select aria-label="Sorting" value={specific.sortMode} onChange={event=>change({sortMode:event.target.value as RadixPerformanceSettings['sortMode']})}><option value="auto">Automatic · GPU when available</option><option value="gpu">GPU · WebGPU devices</option><option value="cpu">CPU worker</option></select><small className="muted">WebGL2 fallback uses CPU sorting. The active renderer is shown above.</small></label>
   <label className="field"><span>Sort precision</span><select aria-label="Sort precision" value={specific.sortBits} onChange={event=>change({sortBits:Number(event.target.value) as RadixPerformanceSettings['sortBits']})}><option value="16">16 bit</option><option value="24">24 bit</option><option value="32">32 bit</option></select></label>
   {numeric(['autoSortDistance','autoSortAngle','sortGuard'])}
  </InspectorSection>
  <InspectorSection title="Splat visibility" icon="tune">{common(['minPixelRadius','maxPixelRadius','maxStdDev','minAlpha'])}{numeric(['minContribution','blurAmount','preBlurAmount'])}</InspectorSection>
  <InspectorSection title="VR rendering" icon="head_mounted_device">{common(['xrFoveation'])}{numeric(['xrResolutionScale'])}</InspectorSection>
 </div>;
}

export function RadixPerformanceStats({runtime}:{runtime:TourRuntime|null}){
 const [text,setText]=useState('');
 useEffect(()=>{
  const update=()=>{if(!runtime){setText('');return;}const stats=runtime.getRenderStats(),fps=runtime.frameMs>0?Math.round(1000/runtime.frameMs):0,backend=stats.backend==='webgpu'?'WebGPU':'WebGL2 fallback';setText(`${backend} · ${fps} FPS · ${stats.visible.toLocaleString()} visible · ${stats.shown.toLocaleString()} supplied · ${stats.selected.toLocaleString()} selected · ${stats.residentSplats.toLocaleString()} resident${stats.loading?` · ${stats.loading} loading`:''}${stats.failed?` · ${stats.failed} failed`:''}${runtime.performanceSettings.adaptiveDetail?` · Auto detail ${Math.round(runtime.adaptiveDetailScale*100)}%`:''}`);};
  update();const timer=setInterval(update,500);return()=>clearInterval(timer);
 },[runtime]);
 return <p className="muted" aria-live="off" data-renderer-stats="radix">{text||'Load a scene to measure performance.'}</p>;
}

type SceneRadixSettings=NonNullable<ScenePerformanceSettings['radix']>;
/** Scene geometry policies inherit independently; device limits stay global. */
export function SceneRadixPerformanceControls({project,scene,onChange}:{project:Project;scene:TourScene;onChange:(value:ScenePerformanceSettings|undefined)=>void}){
 return <RadixDetailPolicyControls defaults={tourPerformanceSettings(project.performance)} value={scene.performance} onChange={onChange} scope="scene"/>;
}
export function ViewpointRadixPerformanceControls({project,scene,view,onChange}:{project:Project;scene:TourScene;view:Viewpoint;onChange:(value:ScenePerformanceSettings|undefined)=>void}){
 return <RadixDetailPolicyControls defaults={scenePerformanceSettings(tourPerformanceSettings(project.performance),scene)} value={view.performance} onChange={onChange} scope="viewpoint"/>;
}
function RadixDetailPolicyControls({defaults,value,onChange,scope}:{defaults:PerformanceSettings;value:ScenePerformanceSettings|undefined;onChange:(value:ScenePerformanceSettings|undefined)=>void;scope:'scene'|'viewpoint'}){
 const specific=radixPerformanceSettings(scenePerformanceSettings(defaults,{performance:value})),overrides=value?.radix||{},labelScope=scope==='scene'?'Scene':'Viewpoint',inherited=scope==='scene'?'Tour default':'Scene / tour default';
 const publish=(next:SceneRadixSettings)=>{
  const result=ScenePerformanceSettingsSchema.safeParse({radix:next});
  if(result.success)onChange(Object.keys(next).length?result.data:undefined);
 };
 const toggle=(key:keyof SceneRadixSettings,enabled:boolean)=>{
  const next={...overrides};if(enabled)Object.assign(next,{[key]:specific[key]});else delete next[key];publish(next);
 };
 const change=(key:keyof SceneRadixSettings,value:number|string)=>{
  const next={...overrides,[key]:value};
  if(key==='lodRangeMin'&&Number(value)>specific.lodRangeMax)next.lodRangeMax=Number(value);
  if(key==='lodRangeMax'&&Number(value)<specific.lodRangeMin)next.lodRangeMin=Number(value);
  publish(next);
 };
 const numeric=(keys:(keyof SceneRadixSettings)[])=>radixControls.filter(([key])=>keys.includes(key as keyof SceneRadixSettings)).map(([key,label,min,max,step,help])=>{
  const sceneKey=key as keyof SceneRadixSettings,enabled=overrides[sceneKey]!==undefined;
  return <div key={key} className="scene-performance-field"><label className="check"><input type="checkbox" aria-label={`Override ${label} for this ${scope}`} checked={enabled} onChange={event=>toggle(sceneKey,event.target.checked)}/>{label}</label><label className="field"><span className="muted">{enabled?`${labelScope} override`:inherited}</span><input aria-label={`${labelScope} ${label}`} type="number" disabled={!enabled} title={help} min={min} max={max} step={step} value={specific[key] as number} onChange={event=>{if(!event.target.value)return;const value=Number(event.target.value);if(Number.isFinite(value)&&value>=min&&value<=max)change(sceneKey,value);}}/><small className="muted">{help}</small></label></div>;
 });
 const budgetOverride=overrides.lodBudgetMode!==undefined;
 return <InspectorSection title={`${labelScope} detail & distances`} icon="tune">
  <p className="muted">{scope==='scene'?'Uses the tour’s performance defaults unless you override a control here. Set longer detail distances for aerial scenes and shorter distances for rooms.':'Uses the scene’s effective defaults unless you override a control here. These adjustments apply while this viewpoint is selected.'} Device memory budgets and resolution remain in Performance settings.</p>
  <button disabled={!Object.keys(overrides).length} onClick={()=>onChange(undefined)}>{scope==='scene'?'Use tour defaults for this scene':'Use scene defaults for this viewpoint'}</button>
  {numeric(['lodBaseDistance','lodMultiplier','lodRangeMin','lodRangeMax'])}
  <label className="check"><input type="checkbox" aria-label={`Override detail budget behavior for this ${scope}`} checked={budgetOverride} onChange={event=>toggle('lodBudgetMode',event.target.checked)}/>Detail budget behavior</label>
  <label className="field"><span className="muted">{budgetOverride?`${labelScope} override`:inherited}</span><select aria-label={`${labelScope} detail budget behavior`} disabled={!budgetOverride} value={specific.lodBudgetMode} onChange={event=>change('lodBudgetMode',event.target.value)}><option value="limit">Distance first · budget is a cap</option><option value="target">Fill budget · favor more detail</option></select></label>
  <details><summary>Streaming & sorting distances</summary>{numeric(['lodBehindPenalty','lodUnderfill','lodUpdateDistance','lodUpdateAngle','autoSortDistance','autoSortAngle'])}</details>
 </InspectorSection>;
}
