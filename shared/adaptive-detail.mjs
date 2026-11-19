/**
 * Conservative, device-local detail feedback. Frame cadence is deliberately
 * sampled only while a scene is visible; network duration is never an input.
 */
export class AdaptiveDetailController {
 constructor(){this.scale=1;this.context='';this.resetHistory();}
 reset(initialScale=1){if(!Number.isFinite(initialScale)||initialScale<=0||initialScale>1)throw Error('Initial automatic detail scale must be greater than zero and at most one.');this.context='';this.resetHistory();this.scale=initialScale;return this.scale;}
 resetHistory(){this.lastChange=-Infinity;this.rejectedDesktopTrial=undefined;this.interrupt();}
 /** Break frame continuity while preserving accepted detail and prior trial results. */
 interrupt(){this.lastTime=undefined;this.clearObservation();}
 clearObservation(){
  this.restartSettling();
  this.recentFrames=[];
  this.pauseMs=0;this.wasPaused=false;this.pauseExpired=false;
 }
 restartSettling(){
  this.cancelDesktopTrial();
  this.settledSince=undefined;this.average=undefined;
  this.slowMs=0;this.fastMs=0;
  this.resetDesktopWindow();
 }
 cancelDesktopTrial(){
  if(!this.desktopTrial)return;
  this.scale=this.desktopTrial.scale;
  this.desktopTrial=undefined;
 }
 /** `eligible` excludes hidden/loading/tracking loss. `paused` only holds a
  * short visible comfort fade; its intervals are not performance evidence.
  * @param {{time:number,frameMs:number,targetFps:number,eligible:boolean,context?:string,immersive?:boolean,minimumScale?:number,paused?:boolean,shownSplats?:number}} sample */
 sample({time,frameMs,targetFps,eligible,context='',immersive=false,minimumScale=0,paused=false,shownSplats}){
  if(context!==this.context){this.context=context;this.resetHistory();}
  const elapsed=this.lastTime===undefined?0:time-this.lastTime;this.lastTime=time;
  // A hidden/ineligible view, breakpoint-sized gap or invalid clock restarts
  // observation. Repeated visible frames up to five seconds can be genuine
  // low-end rendering; rejecting every interval over one second prevented
  // those devices from ever reducing their detail.
  if(![time,frameMs,targetFps,elapsed,minimumScale].every(Number.isFinite)||targetFps<1||frameMs<=0||frameMs>5000||elapsed<0||elapsed>5000||minimumScale<0){this.interrupt();return this.scale;}
  // Whole-scene coarse coverage is a stable recovery baseline in VR, even
  // when the selector reallocates some of its rear coverage to visible detail.
  const floor=immersive?Math.min(1,minimumScale):0;
  if(this.scale<floor){this.scale=floor;this.clearObservation();}
  if(!eligible){this.interrupt();return this.scale;}
  // A frame duration can begin while tracking, visibility or loading excluded
  // the scene. The first eligible timestamp only establishes the new clock.
  if(elapsed===0)return this.scale;
  if(paused||this.wasPaused){
   this.pauseMs+=elapsed;
   // Retain evidence only for a brief fade. A persistent cover is ordinary
   // ineligibility and must earn a fresh observation window after it ends.
   if(this.pauseExpired||this.pauseMs>500){this.clearObservation();this.wasPaused=paused;this.pauseExpired=paused;return this.scale;}
   if(this.settledSince!==undefined)this.settledSince+=elapsed;
   if(Number.isFinite(this.lastChange))this.lastChange+=elapsed;
   this.wasPaused=paused;if(!paused)this.pauseMs=0;
   return this.scale;
  }
  this.recentFrames.push(frameMs);if(this.recentFrames.length>3)this.recentFrames.shift();
  // A single screenshot/readback stall is not low steady cadence. Three
  // comparable slow intervals establish real low cadence, including sub-1-FPS
  // operation and variable intervals on either side of the 250 ms threshold.
  const minimum=Math.min(...this.recentFrames),maximum=Math.max(...this.recentFrames),slowCadence=this.recentFrames.length===3&&minimum>=150&&maximum/minimum<=2.5;
  if((frameMs>250||elapsed>1000)&&!slowCadence){this.restartSettling();return this.scale;}
  if(this.settledSince===undefined){this.settledSince=time;this.average=frameMs;return this.scale;}
  this.average+=(frameMs-this.average)*(1-Math.exp(-Math.min(elapsed,250)/500));
  // A headset must shed sustained overload promptly: waiting six seconds per
  // decision and stopping at a quarter of a desktop budget can leave millions
  // of splats at a persistently uncomfortable cadence. Tracking loss and
  // isolated long gaps still reset observation.
  if(time-this.settledSince<(immersive?1000:4000))return this.scale;
  const budget=1000/targetFps;
  // Even a confirmed very slow frame contributes at most one second. A single
  // interval must not satisfy the whole decision window by itself.
  const observed=Math.min(elapsed,1000);
  return immersive
   ?this.sampleImmersive(time,observed,budget,floor)
   :this.sampleDesktop(time,frameMs,observed,budget,shownSplats);
 }
 sampleImmersive(time,observed,budget,floor){
  const healthy=this.average<budget*1.02;
  if(this.average>budget*1.1){this.slowMs+=observed;this.fastMs=0;}
  else if(healthy){this.fastMs+=observed;this.slowMs=0;}
  // One missed headset refresh can briefly move the average into the hold
  // band. Decay earlier healthy evidence there instead of requiring eight
  // uninterrupted seconds; sustained hold cadence still drains that credit.
  else{this.slowMs=0;this.fastMs=Math.max(0,this.fastMs-observed);}
  let next=this.scale;
  if(this.slowMs>=500&&time-this.lastChange>=1500)next=Math.max(floor,Math.min(this.scale,.01),this.scale*(this.average>budget*1.75?.5:.75));
  else if(healthy&&this.fastMs>=8000&&time-this.lastChange>=10000)next=Math.min(1,this.scale+.05);
  if(next!==this.scale){const reduced=next<this.scale;this.scale=next;this.lastChange=time;this.slowMs=0;this.fastMs=0;if(reduced)this.settledSince=time;}
  return this.scale;
 }
 sampleDesktop(time,frameMs,observed,budget,shownSplats){
  const trial=this.desktopTrial,rejected=this.rejectedDesktopTrial;
  const slow=this.average>budget*1.2,healthy=this.average<budget*1.05;
  const changed=!rejected||Math.abs(this.average-rejected.frameMs)>=Math.max(rejected.frameMs*.2,2)||
   (shownSplats!==undefined&&rejected.shownSplats!==undefined&&Math.abs(shownSplats-rejected.shownSplats)>=Math.max(rejected.shownSplats*.25,1));
  this.fastMs=!trial&&healthy?this.fastMs+observed:0;
  if(trial||(slow&&changed&&this.scale>.25)){
   this.desktopFrameSum+=frameMs;
   this.desktopFrames++;
   this.desktopObservedMs+=observed;
  }else this.resetDesktopWindow();
  if(this.desktopObservedMs>=2000&&time-this.lastChange>=5000){
   const mean=this.desktopFrameSum/this.desktopFrames;
   if(trial){
    // A trial cut should buy at least 10% and 2 ms in delivered frame
    // time. Wait for the reduced selection to settle before measuring it.
    if(trial.frameMs-mean<Math.max(trial.frameMs*.1,2)){
     this.rejectedDesktopTrial=trial;
     this.cancelDesktopTrial();
     this.lastChange=time;
     this.settledSince=time;
    }else this.desktopTrial=undefined;
   }else{
    this.desktopTrial={scale:this.scale,frameMs:mean,shownSplats};
    this.rejectedDesktopTrial=undefined;
    this.scale=Math.max(.25,this.scale*.75);
    this.lastChange=time;
    this.settledSince=time;
   }
   this.resetDesktopWindow();
  }
  if(!trial&&healthy&&this.fastMs>=6000&&time-this.lastChange>=6000&&this.scale<1){
   this.scale=Math.min(1,this.scale+.1);
   this.rejectedDesktopTrial=undefined;
   this.lastChange=time;
   this.fastMs=0;
  }
  return this.scale;
 }
 resetDesktopWindow(){this.desktopFrameSum=0;this.desktopFrames=0;this.desktopObservedMs=0;}
}
