import {ViewerPerformance} from './performance-editor';
import {sceneThumbnail,listedViewpoints} from '../shared/viewpoints.mjs';
import {defaultPerformance} from '../shared/performance.mjs';
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {TourRuntime} from './runtime';
import type {Project,Hosting,Mode,Page} from './model';
import {validateProject,ProjectSchema,HostingSchema} from '../shared/project.mjs';
import {Button,Field,Stage,ControlsHelp,TouchPad,ContentModal,useMobileControls,MobileControlSetting} from './ui';
import {Icon,IconButton,InspectorSection,type IconName} from './icons';
import './style.css';

const homeHosting:Hosting={assetBaseUrl:'./',sceneUrls:{}};
const modeName:Record<Mode,string>={jumps:'Viewpoints',fly:'Drone',explore:'Walk'};
const modeIcon:Record<Mode,IconName>={jumps:'photo',fly:'drone',explore:'directions_walk'};

function Viewer(){
 const mobile=useMobileControls();
 const [viewpointId,setViewpointId]=useState('');
 const [project,setProject]=useState<Project|null>(null),[hosting,setHosting]=useState(homeHosting);
 const [rt,setRt]=useState<TourRuntime|null>(null),[sceneId,setSceneId]=useState(''),[started,setStarted]=useState(false);
 const [status,setStatus]=useState(''),[error,setError]=useState(false),[mode,setMode]=useState<Mode>('jumps');
 const [settings,setSettings]=useState(false),[page,setPage]=useState<Page|null>(null),[loadError,setLoadError]=useState('');
 const [speed,setSpeed]=useState(2),[snap,setSnap]=useState(true),[swapSticks,setSwapSticks]=useState(false),[muted,setMuted]=useState(false);
 const base=new URL('./',location.href).href;
 useEffect(()=>{
  Promise.all([
   fetch(new URL('config/tour.json',base)).then(r=>{if(!r.ok)throw Error('No tour configuration found. Open Spark Tour Studio to create a tour.');return r.json();}),
   fetch(new URL('config/hosting.json',base)).then(r=>r.ok?r.json():{})
  ]).then(([p,h])=>{const parsed=ProjectSchema.parse(p) as Project;const issues=validateProject(parsed);if(issues.length)throw Error(issues.join('\n'));setProject(parsed);setHosting(HostingSchema.parse(h));setSceneId(parsed.startScene);}).catch(e=>setLoadError(String(e)));
 },[]);
 useEffect(()=>{if(!rt)return;rt.onStatus=(s,e)=>{setStatus(s);setError(!!e);};rt.onScene=setSceneId;rt.onViewpoint=setViewpointId;rt.onMode=setMode;rt.onPage=setPage;},[rt]);
 useEffect(()=>{if(rt&&project){const library=project.performance||defaultPerformance();rt.applyPerformance(library.presets.find(p=>p.id===library.defaultPresetId)!.settings);}},[rt,project]);
 const current=project?.scenes.find(s=>s.id===sceneId);
 const selectedView=current?.viewpoints.find(v=>v.id===viewpointId);
 const titleImage=project?.cover||(current?sceneThumbnail(current):'');
 const begin=()=>{if(rt&&project){setStarted(true);setSettings(false);rt.blocked=false;rt.audio.unlock();void rt.load(project,hosting,base,sceneId);}};
 const goHome=()=>{setStarted(false);setSettings(false);if(rt){rt.blocked=true;rt.audio.stop();}};
 const modes=<div className="mode-tabs" role="group" aria-label="Movement mode">{current?.modes.map(m=><button key={m} title={modeName[m]} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>rt?.setMode(m)}><Icon name={modeIcon[m]}/>{modeName[m]}</button>)}</div>;
 return <main className="viewer"><Stage onReady={setRt}/>
  {!started?<section className="title-screen">
   <div className="title-copy"><div className="eyebrow">SPARK TOUR / SPATIAL EXPERIENCES</div><h1>{project?.title||'A new perspective.'}</h1><p className="lead">{project?.description||'Explore places as if you were there.'}</p>
    {loadError?<div className="notice error">{loadError}<p><a href="editor.html">Open editor information</a></p></div>:<>
     <Field label="Start exploring"><select value={sceneId} onChange={e=>setSceneId(e.target.value)}>{project?.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
     <div className="actions"><Button primary disabled={!rt||!project} onClick={begin}><Icon name="image_arrow_up"/>Enter tour</Button><IconButton icon="settings" label="Settings" aria-expanded={settings} onClick={()=>setSettings(!settings)}>Settings</IconButton></div>
    </>}
    <InspectorSection title="Controls help" icon="help"><ControlsHelp/></InspectorSection><div className="subtle">Powered by Spark · Gaussian splat experiences</div>
   </div>
   <div className="title-art" style={titleImage?{backgroundImage:'url('+new URL(titleImage,base).href+')'}:undefined}>{!titleImage&&<><div className="orb orb-one"/><div className="orb orb-two"/><div className="orbit"/><span>EXPERIENCE<br/>EVERY DIMENSION</span></>}</div>
  </section>:<>
   <div className="viewer-header"><div><small>{project?.title}</small><h2>{current?.name}</h2></div><div className="actions">
    <select title="Choose scene" aria-label="Scene" value={sceneId} onChange={e=>void rt?.selectScene(e.target.value)}>{project?.scenes.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>
    <IconButton icon="menu" label="Return to start" onClick={goHome}>Start</IconButton>
    <IconButton icon="settings" label="Settings" aria-expanded={settings} onClick={()=>setSettings(!settings)}>Settings</IconButton>
    <IconButton icon="head_mounted_device" label="Enter VR" onClick={()=>void rt?.enterXR()}>Enter VR</IconButton>
   </div></div>
   <div className="viewer-bottom">
    {selectedView?.description&&<div className="view-description">{selectedView.description}</div>}
    {modes}
    <div className="viewpoints" role="group" aria-label="Viewpoints">{listedViewpoints(current).map((p,index)=><button className={'tour-viewpoint '+(p.id===viewpointId?'active':'')} title={'Go to View: '+p.name} aria-pressed={p.id===viewpointId} key={p.id} onClick={()=>rt?.jump(p.id)}>{p.thumbnail?<img src={new URL(p.thumbnail,base).href} alt=""/>:<Icon name="photo"/>}<span className="view-number">{index+1}</span><span>{p.name}</span></button>)}</div>
   </div>
   <TouchPad runtime={rt} enabled={mobile.enabled} mode={mode}/>
   {mode==='explore'&&<div className="walk-hint">Click to walk · WASD or Escape cancels · Shift crouches · Space jumps</div>}
  </>}
  {status&&started&&<div role="status" className={'status '+(error?'error':'')}><Icon name={error?'error':'schedule'}/>{status}{mode==='explore'&&!error&&<Button onClick={()=>{rt?.routes.cancel();setStatus('');}}><Icon name="close"/>Stop walking</Button>}{error&&<><Button onClick={()=>void rt?.selectScene(sceneId)}><Icon name="refresh"/>Retry</Button><Button onClick={goHome}><Icon name="menu"/>Choose scene</Button></>}</div>}
  {settings&&<section className="settings floating" role="dialog" aria-label="Viewing settings"><header><h3><Icon name="settings"/>Viewing settings</h3><IconButton icon="close" label="Close settings" onClick={()=>setSettings(false)}/></header>
   <InspectorSection title="Movement" icon="directions_walk" defaultOpen className="settings-group">
    {started&&modes}
    <Field label={'Movement speed · '+speed.toFixed(1)+' m/s'}><input aria-label="Movement speed" type="range" min="0.5" max="10" step="0.5" value={speed} onChange={e=>{const n=Number(e.target.value);setSpeed(n);if(rt)rt.speed=n;}}/></Field>
    <MobileControlSetting value={mobile.choice} onChange={mobile.setChoice}/>
   </InspectorSection>
   <InspectorSection title="Display" icon="tune" defaultOpen className="settings-group"><ViewerPerformance project={project} runtime={rt}/></InspectorSection>
   <InspectorSection title="Audio" icon={muted?'volume_off':'volume_up'} className="settings-group"><label className="check"><input type="checkbox" checked={muted} onChange={e=>{setMuted(e.target.checked);rt?.audio.setMuted(e.target.checked);}}/>Mute audio</label></InspectorSection>
   <InspectorSection title="VR controls" icon="head_mounted_device" className="settings-group">
    <Field label="VR turning"><select value={snap?'snap':'smooth'} onChange={e=>{const next=e.target.value==='snap';setSnap(next);if(rt)rt.snap=next;}}><option value="snap">Snap · 30°</option><option value="smooth">Smooth</option></select></Field>
    <label className="check"><input type="checkbox" checked={swapSticks} onChange={e=>{setSwapSticks(e.target.checked);if(rt)rt.swapSticks=e.target.checked;}}/>Swap movement thumbsticks</label>
    <p className="muted">Hold a trigger to aim, release to teleport. Grip opens the tour menu. In Drone mode, one stick moves and the other lifts and turns.</p>
   </InspectorSection>
   <InspectorSection title="Controls help" icon="help" className="settings-group"><ControlsHelp/></InspectorSection>
  </section>}
  {page&&<ContentModal page={page} base={base} runtime={rt} onClose={()=>setPage(null)}/>}
 </main>;
}

createRoot(document.getElementById('root')!).render(<Viewer/>);
