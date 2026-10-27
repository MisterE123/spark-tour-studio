import {ViewpointStory} from './viewpoint-story';
import {LinkedDescription} from './linked-description';
import {TourIdentity,TourFooter,useTourDocumentBranding,brandUrl} from './tour-branding';
import {resolveBranding} from '../shared/branding.mjs';
import {ViewerPerformance} from './performance-editor';
import {sceneThumbnail,listedViewpoints} from '../shared/viewpoints.mjs';
import {tourPerformanceSettings} from '../shared/performance.mjs';
import {glassVariables} from '../shared/appearance.mjs';
import {guideStorageKey} from '../shared/onboarding.mjs';
import React,{useState,useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {TourRuntime} from './runtime';import {SceneLoading} from './scene-loading';
import type {Project,Hosting,Mode,Page,TourDestination} from './model';
import {validateProject,ProjectSchema,HostingSchema} from '../shared/project.mjs';
import {Button,Field,Stage,ControlsHelp,TouchPad,ContentModal,useMobileControls,MobileControlSetting} from './ui';
import {Icon,IconButton,InspectorSection,type IconName} from './icons';
import {TourDirectory} from './tour-directory';
import {ViewerGuide,NavigationCoach} from './viewer-guide';
import {MobileTourControls,useCompactViewer} from './mobile-tour-controls';
import './style.css';

const homeHosting:Hosting={assetBaseUrl:'./',sceneUrls:{}};
const modeName:Record<Mode,string>={jumps:'Viewpoints',fly:'Drone',explore:'Walk'};
const modeIcon:Record<Mode,IconName>={jumps:'photo',fly:'drone',explore:'directions_walk'};

function Viewer(){
 const mobile=useMobileControls();
 const compact=useCompactViewer(),[tourControls,setTourControls]=useState(false);
 useEffect(()=>{if(!compact)setTourControls(false);},[compact]);
 const [viewpointId,setViewpointId]=useState('');
 const [project,setProject]=useState<Project|null>(null),[hosting,setHosting]=useState(homeHosting);
 const [rt,setRt]=useState<TourRuntime|null>(null),[sceneId,setSceneId]=useState(''),[started,setStarted]=useState(false);
 const [startupError,setStartupError]=useState('');
 const [status,setStatus]=useState(''),[error,setError]=useState(false),[mode,setMode]=useState<Mode>('jumps');
 const [settings,setSettings]=useState(false),[page,setPage]=useState<Page|null>(null),[loadError,setLoadError]=useState('');
 const [requested,setRequested]=useState<TourDestination|null>(null);
 const [captured,setCaptured]=useState(false),[guide,setGuide]=useState(false),[guideStep,setGuideStep]=useState(0),[guideSeen,setGuideSeen]=useState(true);
 const [speed,setSpeed]=useState(1),[snap,setSnap]=useState(true),[swapSticks,setSwapSticks]=useState(false),[muted,setMuted]=useState(false);
 const base=new URL('./',location.href).href;
 useTourDocumentBranding(project,base);
 const branding=resolveBranding(project),brandLogo=brandUrl(branding.logo,base);
 useEffect(()=>{
  Promise.all([
   fetch(new URL('config/tour.json',base)).then(r=>{if(!r.ok)throw Error('No tour configuration found. Check that this website includes the tour files.');return r.json();}),
   fetch(new URL('config/hosting.json',base)).then(r=>r.ok?r.json():{})
  ]).then(([p,h])=>{const parsed=ProjectSchema.parse(p) as Project;const issues=validateProject(parsed);if(issues.length)throw Error(issues.join('\n'));setProject(parsed);setHosting(HostingSchema.parse(h));setSceneId(parsed.startScene);}).catch(e=>setLoadError(String(e)));
 },[]);
 useEffect(()=>{if(!rt)return;rt.onStatus=(s,e)=>{setStatus(s);setError(!!e);};rt.onScene=id=>{setSceneId(id);setRequested(value=>value?.sceneId===id?value:null);};rt.onViewpoint=setViewpointId;rt.onSpeed=setSpeed;rt.onMode=setMode;rt.onPage=setPage;rt.onPointerCapture=setCaptured;setCaptured(rt.pointerCaptured);return()=>{rt.onPointerCapture=()=>{};};},[rt]);
 useEffect(()=>{if(rt)rt.speedMultiplier=speed;},[rt,speed]);
 useEffect(()=>{if(rt&&project)rt.applyPerformance(tourPerformanceSettings(project.performance));},[rt,project]);
 useEffect(()=>{if(!rt)return;const syncBlocked=()=>{if(rt.renderer.xr.isPresenting)return;rt.blocked=!started||settings||!!page||tourControls;if(rt.blocked)rt.releasePointer();};syncBlocked();rt.renderer.xr.addEventListener('sessionend',syncBlocked);return()=>rt.renderer.xr.removeEventListener('sessionend',syncBlocked);},[rt,started,settings,page,tourControls]);
 const guideKey=guideStorageKey(project?.title||'',location.pathname);
 useEffect(()=>{if(!project)return;try{setGuideSeen(localStorage.getItem(guideKey)==='done');}catch{setGuideSeen(false);}},[guideKey,project?.title]);
 const current=project?.scenes.find(s=>s.id===sceneId);
 const selectedView=current?.viewpoints.find(v=>v.id===viewpointId);
 const titleImage=project?.cover||(current?sceneThumbnail(current):'');
 const begin=(guided=false)=>{if(rt&&project){setRequested(null);setStarted(true);setSettings(false);setGuide(guided);if(guided)setGuideStep(0);rt.blocked=false;rt.audio.unlock();void rt.load(project,hosting,base,sceneId);}};
 const visit=(destination:TourDestination)=>{if(!rt||!project)return;setRequested(destination);setPage(null);setStarted(true);setSettings(false);rt.blocked=false;rt.project=project;rt.hosting=hosting;rt.base=base;if(!started&&rt.active?.id===destination.sceneId&&rt.ready){rt.audio.unlock();rt.audio.setScene(rt.active.audio,base);}void rt.visit(destination);};
 const goHome=()=>{setStarted(false);setSettings(false);setTourControls(false);setGuide(false);setPage(null);if(rt){rt.releasePointer();rt.blocked=true;rt.audio.stop();}};
 const closeGuide=()=>{setGuide(false);setGuideSeen(true);try{localStorage.setItem(guideKey,'done');}catch{}};
 const openGuide=()=>{rt?.releasePointer();setSettings(false);setGuideStep(0);setGuide(true);};
 const toggleSettings=()=>{rt?.releasePointer();setSettings(!settings);};
 const modes=<div className="mode-tabs" data-guide="modes" role="group" aria-label="Movement mode">{current?.modes.map(m=><button key={m} title={modeName[m]} aria-pressed={mode===m} className={mode===m?'active':''} onClick={()=>rt?.setMode(m)}><Icon name={modeIcon[m]}/>{modeName[m]}</button>)}</div>;
 return <main className={'viewer '+(compact?'viewer-compact ':'')+(mobile.enabled?'viewer-touch ':'')+(captured?'cursor-captured':'cursor-free')} style={glassVariables(project?.appearance) as React.CSSProperties}><Stage onReady={setRt} onError={setStartupError}/>{started&&<SceneLoading runtime={rt}/>}
  {!started?<section className="title-screen">
   <div className="title-art title-backdrop" role="img" aria-label="Tour cover" style={titleImage?{backgroundImage:'url('+new URL(titleImage,base).href+')'}:undefined}>{!titleImage&&<><div className="orb orb-one"/><div className="orb orb-two"/><div className="orbit"/></>}</div>
   <div className="title-copy">{project&&<TourIdentity project={project} base={base}/>}<h1>{project?.title||'A new perspective.'}</h1><p className="lead"><LinkedDescription text={project?.description||'Explore places as if you were there.'}/></p>
    {loadError?<div className="notice error">{loadError}<p><button onClick={()=>location.reload()}>Retry loading tour</button></p></div>:<>
     <Field label="Start exploring"><select value={sceneId} onChange={e=>setSceneId(e.target.value)}>{project?.scenes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
     <div className="actions"><button className="primary" disabled={!rt||!project} aria-describedby={startupError?'viewer-startup-error':undefined} onClick={()=>begin()}><Icon name="image_arrow_up"/>Enter tour</button><IconButton icon="settings" label="Settings" aria-expanded={settings} onClick={toggleSettings}>Settings</IconButton></div>
     {startupError&&<p className="viewer-startup-error" id="viewer-startup-error" role="alert"><Icon name="error" size={18}/><span>{/webgl|graphics context/i.test(startupError)?'WebGL is unavailable. Open this tour on a device and browser that support WebGL 2.':'The 3D viewer could not start. Reload the tour to try again.'}</span></p>}
     {!guideSeen&&<div className="guide-invitation"><Icon name="help" size={26}/><div><strong>New to exploring in 3D?</strong><p>A short guide will help you find your way.</p><button disabled={!rt||!project} onClick={()=>begin(true)}>Show me around<Icon name="chevron_right" size={18}/></button></div></div>}
    </>}
    <InspectorSection title="Controls help" icon="help"><ControlsHelp/></InspectorSection>{project&&<TourFooter project={project}/>}
   </div>
   <div className="title-side">{project&&!loadError&&<TourDirectory project={project} base={base} disabled={!rt} onVisit={visit}/>}</div>
  </section>:<>
   {compact?project&&!settings&&!page&&!guide&&<MobileTourControls project={project} scene={current} view={selectedView} mode={mode} open={tourControls} onOpen={()=>{rt?.releasePointer();setTourControls(true);}} onClose={()=>setTourControls(false)} onScene={id=>{setRequested(null);void rt?.selectScene(id);}} onView={id=>{if(current?.modes.includes('jumps'))rt?.setMode('jumps');rt?.jump(id);}} onMode={m=>rt?.setMode(m)} onHome={goHome} onHelp={openGuide} onSettings={()=>setSettings(true)} onXR={()=>void rt?.enterXR()}/>:<>
   <div className="viewer-header"><div className="viewer-scene-heading">{brandLogo&&<img className="tour-brand-logo" src={brandLogo} alt={branding.name?branding.name+' logo':'Tour logo'}/>}<div><small>{branding.name||project?.title}</small><h2>{current?.name}</h2></div></div><div className="actions" data-guide="scenes">
    <select title="Choose scene" aria-label="Scene" value={sceneId} onChange={e=>{setRequested(null);void rt?.selectScene(e.target.value);}}>{project?.scenes.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select>
    <IconButton icon="menu" label="Return to start" onClick={goHome}>Start</IconButton>
    <IconButton icon="help" label="Tour help" onClick={openGuide}/>
    <IconButton icon="settings" label="Settings" data-guide="settings" aria-expanded={settings} onClick={toggleSettings}>Settings</IconButton>
    <IconButton icon="head_mounted_device" label="Enter VR" onClick={()=>void rt?.enterXR()}>Enter VR</IconButton>
   </div></div>
   <div className="viewer-bottom">
    {selectedView?.description&&<div className="view-description">{selectedView.description}</div>}
    {modes}
    {current?.modes.includes('jumps')&&<div className="viewpoints" role="group" aria-label="Viewpoints">{listedViewpoints(current).map((p,index)=><button className={'tour-viewpoint '+(p.id===viewpointId?'active':'')} title={'Go to View: '+p.name} aria-pressed={p.id===viewpointId} key={p.id} onClick={()=>rt?.jump(p.id)}>{p.thumbnail?<img src={new URL(p.thumbnail,base).href} alt=""/>:<Icon name="photo"/>}<span className="view-number">{index+1}</span><span>{p.name}</span></button>)}</div>}
   </div>
   </>}
   {project&&<ViewpointStory initiallyCollapsed={compact} hidden={settings||!!page||guide||tourControls} project={project} scene={current} view={selectedView} runtime={rt} base={base}/>}
   <TouchPad runtime={rt} enabled={mobile.enabled&&!settings&&!page&&!guide&&!tourControls} mode={mode}/>
   {!compact&&!settings&&!page&&!guide&&<NavigationCoach mode={mode} touch={mobile.enabled} captured={captured} ready={!!rt?.ready&&!rt?.loading} onCapture={()=>{void rt?.capturePointer();}} onRelease={()=>rt?.releasePointer()} onGuide={openGuide}/>}
   {guide&&!settings&&!page&&rt?.ready&&!rt?.loading&&<ViewerGuide mode={mode} touch={mobile.enabled} captured={captured} step={guideStep} onStep={setGuideStep} onCapture={()=>{void rt?.capturePointer();}} onClose={closeGuide}/>}
  </>}
  {status&&started&&!rt?.loading&&<div role="status" className={'status '+(error?'error':'')}><Icon name={error?'error':'schedule'}/>{status}{mode==='explore'&&!error&&<Button onClick={()=>{rt?.routes.cancel();setStatus('');}}><Icon name="close"/>Stop walking</Button>}{error&&<><Button onClick={()=>requested?void rt?.visit(requested):void rt?.selectScene(sceneId)}><Icon name="refresh"/>Retry</Button><Button onClick={goHome}><Icon name="menu"/>Choose scene</Button></>}</div>}
  {settings&&<section className="settings floating" role="dialog" aria-label="Viewing settings"><header><h3><Icon name="settings"/>Viewing settings</h3><IconButton icon="close" label="Close settings" onClick={()=>setSettings(false)}/></header>
   <InspectorSection title="Movement" icon="directions_walk" defaultOpen className="settings-group">
    {started&&modes}
    <Field label={'Movement speed · '+speed+'×'}><input aria-label="Movement speed multiplier" type="range" min=".25" max="4" step=".25" value={speed} onChange={e=>{const n=Number(e.target.value);setSpeed(n);if(rt)rt.speedMultiplier=n;}}/></Field>
    <MobileControlSetting value={mobile.choice} onChange={mobile.setChoice}/>
   </InspectorSection>
   <InspectorSection title="Display" icon="tune" defaultOpen className="settings-group"><ViewerPerformance project={project} runtime={rt}/></InspectorSection>
   <InspectorSection title="Audio" icon={muted?'volume_off':'volume_up'} className="settings-group"><label className="check"><input type="checkbox" checked={muted} onChange={e=>{setMuted(e.target.checked);rt?.audio.setMuted(e.target.checked);}}/>Mute audio</label></InspectorSection>
   <InspectorSection title="VR controls" icon="head_mounted_device" className="settings-group">
    <Field label="VR turning"><select value={snap?'snap':'smooth'} onChange={e=>{const next=e.target.value==='snap';setSnap(next);if(rt)rt.snap=next;}}><option value="snap">Snap · 30°</option><option value="smooth">Smooth</option></select></Field>
    <label className="check"><input type="checkbox" checked={swapSticks} onChange={e=>{setSwapSticks(e.target.checked);if(rt)rt.swapSticks=e.target.checked;}}/>Swap movement thumbsticks</label>
    <p className="muted">Hold a trigger to aim, release to teleport. Grip opens the tour menu. In Drone mode, one stick moves and the other lifts and turns.</p>
   </InspectorSection>
   <InspectorSection title="Controls help" icon="help" className="settings-group"><button onClick={()=>started?openGuide():begin(true)} disabled={!rt||!project}><Icon name="help"/>Show me around</button><ControlsHelp/></InspectorSection>
  </section>}
  {page&&<ContentModal page={page} base={base} runtime={rt} onClose={()=>setPage(null)}/>}
 </main>;
}

createRoot(document.getElementById('root')!).render(<Viewer/>);
