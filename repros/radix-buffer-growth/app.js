// No Studio, SOG adapter, application workers, navigation or user assets.
import * as THREE from 'three';
import {uint,float,vec3,vec4} from 'three/tsl';
import {ArrayData,GpuArrays,GpuSplats,SortKeys,SplatCollection,SplatRenderer,WgpuBuffer,WgpuSplatSorter,createRenderer,getGpuCaps} from '../../src/rendering/radix/vendor/radix.module.js';
import {parseCounts,estimateMemory,summarize} from './metrics.mjs';

const $=id=>document.getElementById(id),settings=$('settings');
const params=new URLSearchParams(location.search);
if(params.has('mode'))$('mode').value=params.get('mode');
if(params.has('counts'))$('counts').value=params.get('counts');
if(params.has('seconds'))$('seconds').value=params.get('seconds');
if(params.has('instrument'))$('instrument').checked=params.get('instrument')!=='0';
if(params.has('readback'))$('readback').checked=params.get('readback')==='1';
const provenance={radix:'0.0.1',radixCommit:'e36742ee524a844ca79fbec8ea910d5598123690',three:THREE.REVISION,synthetic:true};
const report={provenance,environment:{userAgent:navigator.userAgent,url:location.href},runs:[]};
let active,renderer,device,finished,lastGraphAt=0;

function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function note(message){$('log').textContent=message+'\n'+$('log').textContent.slice(0,18000);}
function memory(){try{const counts=parseCounts($('counts').value),estimate=estimateMemory(counts,$('mode').value);$('memory').textContent=estimate.description;}catch(error){$('memory').textContent=error.message;}}
$('counts').addEventListener('input',memory);$('mode').addEventListener('change',memory);memory();

function currentStage(run){return run.stages[run.stageIndex];}
function event(run,type,data){if(run.events.length<5000)run.events.push({time:performance.now(),type,...data,stage:run.stageIndex});else run.eventsTruncated=true;}
function idOf(run,object){let id=run.ids.get(object);if(!id){id=++run.nextId;run.ids.set(object,id);}return id;}

// Optional diagnostic wrappers forward every argument and preserve the original
// result/exception. Published Radix and Three files are never changed. Per-frame
// GPU readbacks and queue waits are intentionally absent from the measurement.
function instrument(run){
 const restores=[];
 const wrap=(target,key,make)=>{const original=target[key];target[key]=make(original);restores.push(()=>{target[key]=original;});};
 if(!run.instrument)return()=>{};
 wrap(WgpuBuffer.prototype,'setCapacity',original=>function(count,options){
  const before=this.capacity,start=performance.now();
  try{return original.call(this,count,options);}finally{if(this.capacity!==before)event(run,'bufferCapacity',{id:idOf(run,this),label:this.attribute?.name||'',before,after:this.capacity,ms:performance.now()-start});}
 });
 wrap(GpuArrays.prototype,'setCapacity',original=>function(count){
  const before=this.capacity,start=performance.now();
  try{return original.call(this,count);}finally{if(this.capacity!==before)event(run,'textureCapacity',{id:idOf(run,this),before,after:this.capacity,ms:performance.now()-start});}
 });
 // An instance method wrapper leaves other pages/devices alone. The descriptor
 // is not modified. This measures the synchronous native call, not GPU work.
 wrap(device,'createBuffer',original=>function(descriptor){
  const start=performance.now();let value;
  try{return value=original.call(this,descriptor);}finally{
   const ms=performance.now()-start;
   event(run,'createBuffer',{label:descriptor.label||'',size:descriptor.size,usage:descriptor.usage,mappedAtCreation:!!descriptor.mappedAtCreation,ms,stack:ms>=2?new Error('allocation stack').stack:undefined,created:!!value});
  }
 });
 return()=>restores.reverse().forEach(restore=>restore());
}

function recordMemory(run){
 const buffers=[],seen=new Set();
 const visit=(value,name,depth)=>{if(!value||typeof value!=='object'||seen.has(value)||depth>3)return;seen.add(value);
  if(value instanceof WgpuBuffer){buffers.push({name,label:value.attribute?.name,capacity:value.capacity,bytes:value.byteLength,cpuArrayBytes:value.attribute?.array?.byteLength});return;}
  for(const key of Object.keys(value))if(!['renderer','material','geometry','parent','children','camera'].includes(key))visit(value[key],name+'.'+key,depth+1);
 };
 visit(run.sorter||run.node?.sorter,'sorter',0);
 const projected=run.node?.projected?.arrays;
 return {buffers,storageBytes:buffers.reduce((n,item)=>n+item.bytes,0),projectedCapacity:projected?.capacity,projectedCount:projected?.count};
}

// The generator is one persistent shader. No source positions, splat arrays,
// images or collections are allocated at a measured count switch. Index-derived
// positions all stay inside the fixed camera frustum; tiny splats limit fill cost.
const generator={generateSplat(index){
 const x=float(index.mod(uint(1024))).div(1023).sub(.5).mul(7);
 const y=float(index.div(uint(1024)).mod(uint(1024))).div(1023).sub(.5).mul(4);
 const z=float(index.div(uint(1048576))).mul(.12).sub(2);
 return GpuSplats.Splat(vec3(x,y,z),vec3(.003),vec4(0,0,0,1),vec3(.25,.65,.9),float(.55),index);
}};

async function prepare(run){
 if(!navigator.gpu)throw new Error('WebGPU is unavailable. Use a WebGPU-capable browser/device on localhost or HTTPS.');
 if(!renderer){
  renderer=await createRenderer({backend:'webgpu',xr:false,multiview:false,antialias:false,hdr:false,limits:{maxStorageBufferBindingSize:'adapter'}});
  renderer.setPixelRatio(1);renderer.setSize(512,320);renderer.setClearColor('#080d12');
  device=renderer.backend.device;
  const info=device.adapterInfo||{};
  report.environment={...report.environment,caps:getGpuCaps(renderer),adapterInfo:{vendor:info.vendor,architecture:info.architecture,device:info.device,description:info.description},limits:{maxStorageBufferBindingSize:device.limits.maxStorageBufferBindingSize,maxBufferSize:device.limits.maxBufferSize}};
  device.addEventListener('uncapturederror',e=>{const message=e.error?.message||String(e.error);report.runs.at(-1)?.errors.push(message);note('GPU validation: '+message);});
  device.lost.then(info=>{note('GPU device lost: '+info.reason+' '+info.message);if(active)stop('GPU device lost',true);});
 }
 if(active!==run)return;
 run.restore=instrument(run);
 if(run.mode==='sort'){
  // Fixed maximum input capacity is fully allocated/uploaded before timing.
  // Only Radix's compact/radix-sort scratch buffers grow during the experiment.
  const max=run.counts.at(-1),data=new ArrayData({bundles:{sortKeys:SortKeys.KEYS},count:max,capacity:max});
  const bytes=data.bundles.sortKeys.channels.key.data;
  for(let i=0;i<max;i++){
   const key=(Math.imul(i,2654435761)>>>0)%0xfffffe+1,at=i*4;
   bytes[at]=key&255;bytes[at+1]=(key>>>8)&255;bytes[at+2]=(key>>>16)&255;bytes[at+3]=0;
  }
  run.keys=GpuArrays.fromData(renderer,data);run.sorter=new WgpuSplatSorter(renderer);
  $('view').replaceChildren();
 }else{
  run.scene=new THREE.Scene();run.camera=new THREE.PerspectiveCamera(55,512/320,.01,100);run.camera.position.set(0,0,6);run.camera.lookAt(0,0,-2);
  run.collections=run.counts.map(count=>new SplatCollection([{generator,count,matrixWorld:new THREE.Matrix4()}]));
  run.node=new SplatRenderer({renderer,collection:run.collections[0],method:'ewa',sortMode:'gpu',sortBits:24});
  run.node.phase=(name,callback)=>{const start=performance.now();try{return callback();}finally{if(run.phases)run.phases[name]=(run.phases[name]||0)+performance.now()-start;}};
  run.scene.add(run.node);$('view').replaceChildren(renderer.domElement);
 }
 await device.queue.onSubmittedWorkDone();
 run.stages=[{pass:'warmup',count:run.counts[0],index:0,seconds:5},...['growth','replay'].flatMap(pass=>run.counts.map((count,index)=>({pass,count,index,seconds:run.seconds})))];
 run.stageIndex=-1;run.frames=[];run.events=[];run.phase='prepared';
}

function disposeRun(run){run.node?.dispose();run.sorter?.dispose();run.keys?.dispose();run.node=undefined;run.sorter=undefined;run.keys=undefined;}

function requestFrame(run){run.raf=requestAnimationFrame(time=>{run.raf=undefined;if(active===run)tick(time);});}

function setStage(run,time){
 run.stageIndex++;
 if(run.stageIndex>=run.stages.length){stop('Finished growth and fixed-capacity replay.');return false;}
 const stage=currentStage(run);stage.start=performance.now();stage.rafStart=time;run.stageEnd=stage.start+stage.seconds*1000;
 if(run.node)run.node.collection=run.collections[stage.index];
 run.currentCount=stage.count;run.phase=stage.pass;
 event(run,'stage',{pass:stage.pass,count:stage.count});
 performance.mark('radix-repro-'+stage.pass+'-'+stage.count);
 status(`${stage.pass==='warmup'?'Shader warm-up':stage.pass==='growth'?'Growing capacity':'Fixed-capacity replay'} — ${stage.count.toLocaleString()} splats (${run.mode==='sort'?'sorter only':'full renderer'})`);
 return true;
}

function tick(time){
 const run=active;if(!run||run.phase==='preparing')return;
 try{
  if(document.hidden){stop('Stopped because the tab became hidden. Hidden-tab gaps are not a renderer result.');return;}
  if(run.stageIndex===-1||performance.now()>=run.stageEnd)if(!setStage(run,time))return;
  const begin=performance.now();run.phases={};
  if(run.sorter)run.sorter.sort(run.keys,run.currentCount,24);else renderer.render(run.scene,run.camera);
  const end=performance.now();
  if(run.frames.length<20000)run.frames.push({time:begin,rafTime:time,stage:run.stageIndex,previousStage:run.lastStage,count:run.currentCount,pass:run.phase,interval:run.lastTime===undefined?null:time-run.lastTime,cpu:end-begin,...run.phases});else run.framesTruncated=true;
  run.lastTime=time;
  run.lastStage=run.stageIndex;
  if(run.readback&&!run.readbackPending&&end-(run.lastReadback||-Infinity)>=1000){
   run.lastReadback=end;const start=performance.now(),stage=run.stageIndex;
   run.readbackPending=(run.sorter?run.sorter.readCount():run.node.readSortedCount()).then(count=>{run.visibleCount=count;event(run,'readback',{requestedAt:start,requestStage:stage,count,ms:performance.now()-start});}).catch(error=>{run.errors.push('Readback: '+error.message);}).finally(()=>{run.readbackPending=undefined;});
  }
  if(end-lastGraphAt>250){lastGraphAt=end;drawGraph(run);showSummary(run);}
  requestFrame(run);
 }catch(error){run.errors.push(error.stack||String(error));stop(error.message||String(error),true);}
}

function stop(message='Stopped.',error=false){
 const run=active;if(!run)return;
 if(run.raf!==undefined){cancelAnimationFrame(run.raf);run.raf=undefined;}
 active=undefined;run.finishedAt=performance.now();run.completed=run.stageIndex>=run.stages.length;run.memoryAtEnd=recordMemory(run);
 // Disposal waits for an explicitly enabled readback, outside measurement.
 run.restore?.();run.restore=undefined;
 if(run.readbackPending)run.settlement=run.readbackPending.finally(()=>disposeRun(run));else disposeRun(run);
 run.finishedReason=message;finished=run;
 settings.disabled=false;$('run').disabled=false;$('stop').disabled=true;$('download').disabled=false;
 status(message,error);showSummary(run);drawGraph(run);
 note(`${message}\n${run.frames.length} callbacks; ${run.events.filter(e=>e.type==='bufferCapacity').length} buffer growths. Download JSON for events, environment and raw samples.`);
}

function showSummary(run){
 const rows=summarize(run);
 $('summary').replaceChildren(...rows.map(row=>{
  const tr=document.createElement('tr');for(const text of [row.pass+' / '+row.count.toLocaleString(),row.frames,`${row.intervalP95.toFixed(1)} / ${row.intervalMax.toFixed(1)} ms`,`${row.cpuP95.toFixed(1)} / ${row.cpuMax.toFixed(1)} ms`,`${row.createBuffers} / ${row.createBufferMax.toFixed(1)} ms`,row.growths]){const td=document.createElement('td');td.textContent=String(text);tr.append(td);}return tr;
 }));
}

function drawGraph(run){
 const canvas=$('graph'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 ctx.clearRect(0,0,w,h);const frames=run.frames;if(!frames.length)return;
 const start=frames[0].time,end=frames.at(-1).time,span=Math.max(1000,end-start),ceiling=Math.max(50,Math.min(300,Math.max(...frames.map(f=>Math.max(f.interval||0,f.cpu)))));
 ctx.font='12px system-ui';ctx.fillStyle='#aebfcc';ctx.fillText(ceiling.toFixed(0)+' ms',8,14);ctx.fillText('0',8,h-6);
 const x=time=>40+(time-start)/span*(w-45),y=ms=>h-12-Math.min(ceiling,ms)/ceiling*(h-30);
 ctx.strokeStyle='#30424f';for(const ms of [16.67,33.3,50,100])if(ms<ceiling){ctx.beginPath();ctx.moveTo(40,y(ms));ctx.lineTo(w,y(ms));ctx.stroke();}
 for(const [field,color]of [['interval','#77c7ff'],['cpu','#ffca6c']]){ctx.strokeStyle=color;ctx.beginPath();let first=true;for(const frame of frames){if(frame[field]===null)continue;const at=x(frame.time),py=y(frame[field]);if(first){ctx.moveTo(at,py);first=false;}else ctx.lineTo(at,py);}ctx.stroke();}
 ctx.strokeStyle='#91a695';for(const stage of run.stages)if(stage.start){ctx.beginPath();ctx.moveTo(x(stage.start),20);ctx.lineTo(x(stage.start),h-12);ctx.stroke();}
}

async function start(){
 if(active)return;
 try{
  if(finished?.settlement)await finished.settlement;
  const counts=parseCounts($('counts').value),seconds=Number($('seconds').value);if(!Number.isFinite(seconds)||seconds<1||seconds>15)throw new Error('Seconds per count must be from 1 to 15.');
  const run=active={mode:$('mode').value,counts,seconds,instrument:$('instrument').checked,readback:$('readback').checked,startedAt:performance.now(),phase:'preparing',stages:[],stageIndex:-1,events:[],frames:[],errors:[],ids:new WeakMap(),nextId:0};
  report.runs.push(run);settings.disabled=true;$('run').disabled=true;$('stop').disabled=true;$('download').disabled=true;status('Preparing fixed input and local WebGPU renderer…');
  await prepare(run);if(active!==run){run.restore?.();run.restore=undefined;disposeRun(run);return;}
  $('stop').disabled=false;requestFrame(run);
 }catch(error){if(active){active.errors.push(error.stack||String(error));if(!active.stages)active.stages=[];stop(error.message||String(error),true);}else status(error.message||String(error),true);}
}

$('run').addEventListener('click',()=>void start());$('stop').addEventListener('click',()=>stop());
$('download').addEventListener('click',async()=>{
 if(active)return;if(finished?.settlement)await finished.settlement;
 const data={...report,runs:report.runs.map(run=>({mode:run.mode,counts:run.counts,seconds:run.seconds,instrument:run.instrument,readback:run.readback,startedAt:run.startedAt,finishedAt:run.finishedAt,completed:run.completed,finishedReason:run.finishedReason,errors:run.errors,stages:run.stages,frames:run.frames,events:run.events,framesTruncated:run.framesTruncated,eventsTruncated:run.eventsTruncated,memoryAtEnd:run.memoryAtEnd,visibleCount:run.visibleCount,summary:summarize(run)}))};
 const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download='radix-buffer-growth-'+Date.now()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stop('Stopped because the tab became hidden.');});
// Test automation uses the same public UI/start path and real renderer. No test
// cadence, synthetic pauses or device substitutions are built into this page.
window.radixRepro={start,stop,get report(){return report;},get active(){return !!active;},get finished(){return finished;}};
if(params.get('autorun')==='1')void start();
