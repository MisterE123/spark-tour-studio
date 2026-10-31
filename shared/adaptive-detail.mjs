/**
 * Conservative, device-local detail feedback. Frame cadence is deliberately
 * sampled only while a scene is visible; network duration is never an input.
 */
export class AdaptiveDetailController {
 constructor(){this.scale=1;this.context='';this.resetHistory();}
 reset(initialScale=1){if(!Number.isFinite(initialScale)||initialScale<=0||initialScale>1)throw Error('Initial automatic detail scale must be greater than zero and at most one.');this.scale=initialScale;this.context='';this.resetHistory();return this.scale;}
 resetHistory(){this.lastTime=undefined;this.lastChange=-Infinity;this.clearObservation();}
 clearObservation(){this.settledSince=undefined;this.average=undefined;this.slowMs=0;this.fastMs=0;this.recentFrames=[];this.pauseMs=0;this.wasPaused=false;this.pauseExpired=false;}
 /** `eligible` excludes hidden/loading/tracking loss. `paused` only holds a
  * short visible comfort fade; its intervals are not performance evidence.
  * @param {{time:number,frameMs:number,targetFps:number,eligible:boolean,context?:string,immersive?:boolean,minimumScale?:number,paused?:boolean}} sample */
 sample({time,frameMs,targetFps,eligible,context='',immersive=false,minimumScale=0,paused=false}){
  if(context!==this.context){this.context=context;this.resetHistory();}
  const elapsed=this.lastTime===undefined?0:time-this.lastTime;this.lastTime=time;
  // A hidden/ineligible view, breakpoint-sized gap or invalid clock restarts
  // observation. Repeated visible frames up to five seconds can be genuine
  // low-end rendering; rejecting every interval over one second prevented
  // those devices from ever reducing their detail.
  if(![time,frameMs,targetFps,elapsed,minimumScale].every(Number.isFinite)||targetFps<1||frameMs<=0||frameMs>5000||elapsed<0||elapsed>5000||minimumScale<0){this.clearObservation();return this.scale;}
  // Source coverage cannot become cheaper than its mandatory coarsest leaves.
  // Keeping a lower internal scale would only delay later healthy recovery.
  // A source above the authored ceiling stays at scale 1, not above it.
  const floor=immersive?Math.min(1,minimumScale):0;
  if(this.scale<floor){this.scale=floor;this.clearObservation();}
  if(!eligible){this.clearObservation();return this.scale;}
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
  if((frameMs>250||elapsed>1000)&&!slowCadence){this.settledSince=undefined;this.average=undefined;this.slowMs=0;this.fastMs=0;return this.scale;}
  if(this.settledSince===undefined){this.settledSince=time;this.average=frameMs;return this.scale;}
  this.average+=(frameMs-this.average)*(1-Math.exp(-Math.min(elapsed,250)/500));
  // A headset must shed sustained overload promptly: waiting six seconds per
  // decision and stopping at a quarter of a desktop budget can leave millions
  // of splats at a persistently uncomfortable cadence. Desktop behavior stays
  // unchanged. Tracking loss and isolated long gaps still reset observation.
  if(time-this.settledSince<(immersive?1000:4000))return this.scale;
  const budget=1000/targetFps;
  // Even a confirmed very slow frame contributes at most one second. A single
  // interval must not satisfy the whole decision window by itself.
  const observed=Math.min(elapsed,1000);
  if(this.average>budget*(immersive?1.1:1.2)){this.slowMs+=observed;this.fastMs=0;}
  else if(this.average<budget*(immersive?1.02:1.05)){this.fastMs+=observed;this.slowMs=0;}
  else{this.slowMs=0;this.fastMs=0;}
  let next=this.scale;
  if(this.slowMs>=(immersive?500:2000)&&time-this.lastChange>=(immersive?1500:5000))next=Math.max(floor,Math.min(this.scale,immersive?.01:.25),this.scale*(immersive&&this.average>budget*1.75?.5:.75));
  else if(this.fastMs>=(immersive?8000:6000)&&time-this.lastChange>=(immersive?10000:6000))next=Math.min(1,this.scale+(immersive?.05:.1));
  if(next!==this.scale){const reduced=next<this.scale;this.scale=next;this.lastChange=time;this.slowMs=0;this.fastMs=0;if(reduced)this.settledSince=time;}
  return this.scale;
 }
}
