import {useEffect,useRef,useState} from 'react';
import type {TourRuntime} from './runtime';
import type {FramePerformanceSnapshot} from './frame-performance';
import {InspectorSection} from './icons';
import './frame-performance.css';

const fps=(value:number|null|undefined)=>value===null||value===undefined?'—':Math.round(value).toLocaleString();
export function FramePerformancePanel({runtime,sceneId}:{runtime:TourRuntime|null;sceneId:string}){
 const host=useRef<HTMLDivElement>(null);
 const [snapshot,setSnapshot]=useState<FramePerformanceSnapshot|null>(null);
 useEffect(()=>{
  const update=()=>{if(document.hidden||host.current&&!host.current.closest('details')?.open)return;setSnapshot(runtime?.active?.id===sceneId?runtime.framePerformance.snapshot(performance.now()):null);};
  update();const timer=setInterval(update,250);return()=>clearInterval(timer);
 },[runtime,sceneId]);
 const peaks=snapshot?.peaks||[],maximum=Math.min(250,Math.max(50,Math.ceil(Math.max(0,...peaks.map(value=>value||0))/25)*25)),y=(ms:number)=>84-Math.min(maximum,ms)/maximum*76;
 const paths=peaks.flatMap((value,index)=>value===null?[]:[`M${(index+.5)/peaks.length*300},84V${y(value)}`]).join(' ');
 const reset=()=>{runtime?.framePerformance.reset();setSnapshot(runtime?.active?.id===sceneId?runtime.framePerformance.snapshot(performance.now()):null);};
 return <InspectorSection title="Frame performance" icon="tune">
  <div ref={host} className="frame-performance" data-frame-performance="editor">
   <div className="frame-performance-heading"><span>{snapshot?.recording?'Recording visible frames':snapshot?.sampleCount?'Paused':'Waiting for visible frames'}</span><button type="button" onClick={reset} disabled={!snapshot?.sampleCount} aria-label="Reset frame history">Reset</button></div>
   <dl className="frame-performance-metrics" aria-live="off"><div><dt>Current FPS</dt><dd data-frame-current>{fps(snapshot?.currentFps)}</dd></div><div><dt>Average FPS</dt><dd data-frame-average>{fps(snapshot?.averageFps)}</dd></div><div><dt>Slowest frame</dt><dd data-frame-worst>{snapshot?.worstFrameMs===null||!snapshot?'—':`${Math.round(snapshot.worstFrameMs)} ms`}</dd></div><div><dt>50 ms+ frames</dt><dd data-frame-spikes>{snapshot?.spikeCount??0}</dd></div></dl>
   <div className="frame-performance-chart"><div className="frame-performance-axis"><span>{maximum}{maximum===250?'+':''} ms</span><span>0</span></div><svg viewBox="0 0 300 88" preserveAspectRatio="none" role="img" aria-label="Frame time graph for the last 60 seconds; taller lines mean slower frames">
    {[1000/60,1000/30,50].filter(ms=>ms<=maximum).map(ms=><line key={ms} x1="0" x2="300" y1={y(ms)} y2={y(ms)} className={ms===50?'frame-performance-warning':'frame-performance-grid'}/>)}
    <path d={paths} className="frame-performance-trace"/><line x1="0" x2="300" y1="84" y2="84" className="frame-performance-grid"/>
   </svg></div><div className="frame-performance-times"><span>60 seconds ago</span><span>Now</span></div>
   <p className="muted">Frame time peaks reveal stutters that average FPS can hide. Loading screens and inactive periods are omitted. This measures frame cadence, including CPU and GPU waiting.</p>
  </div>
 </InspectorSection>;
}
