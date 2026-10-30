/**
 * Conservative, device-local detail feedback. Frame cadence is deliberately
 * sampled only while a scene is visible; network duration is never an input.
 */
export class AdaptiveDetailController {
 constructor(){this.scale=1;this.context='';this.resetHistory();}
 reset(){this.scale=1;this.context='';this.resetHistory();return this.scale;}
 resetHistory(){this.lastTime=undefined;this.settledSince=undefined;this.average=undefined;this.slowMs=0;this.fastMs=0;this.lastChange=-Infinity;this.recentFrames=[];}
 /** @param {{time:number,frameMs:number,targetFps:number,eligible:boolean,context?:string}} sample */
 sample({time,frameMs,targetFps,eligible,context=''}){
  if(context!==this.context){this.context=context;this.resetHistory();}
  const elapsed=this.lastTime===undefined?0:time-this.lastTime;this.lastTime=time;
  // A background-tab gap, breakpoint or isolated long stall does not prove a
  // sustained rendering problem. Invalid intervals restart the settling window.
  if(!eligible||![time,frameMs,targetFps,elapsed].every(Number.isFinite)||targetFps<1||frameMs<=0||frameMs>1000||elapsed<0||elapsed>1000){this.settledSince=undefined;this.average=undefined;this.slowMs=0;this.fastMs=0;this.recentFrames=[];return this.scale;}
  this.recentFrames.push(frameMs);if(this.recentFrames.length>3)this.recentFrames.shift();
  // A single screenshot/readback stall is not low steady cadence. Three
  // comparable slow intervals establish real 2–3 FPS operation, including
  // variable intervals on either side of the 250 ms threshold.
  const minimum=Math.min(...this.recentFrames),maximum=Math.max(...this.recentFrames),slowCadence=this.recentFrames.length===3&&minimum>=150&&maximum/minimum<=2.5;
  if(frameMs>250&&!slowCadence){this.settledSince=undefined;this.average=undefined;this.slowMs=0;this.fastMs=0;return this.scale;}
  if(this.settledSince===undefined){this.settledSince=time;this.average=frameMs;return this.scale;}
  this.average+=(frameMs-this.average)*(1-Math.exp(-Math.min(elapsed,250)/500));
  if(time-this.settledSince<4000)return this.scale;
  const budget=1000/targetFps;
  if(this.average>budget*1.2){this.slowMs+=elapsed;this.fastMs=0;}
  else if(this.average<budget*1.05){this.fastMs+=elapsed;this.slowMs=0;}
  else{this.slowMs=0;this.fastMs=0;}
  let next=this.scale;
  if(this.slowMs>=2000&&time-this.lastChange>=5000)next=Math.max(.25,this.scale*.75);
  else if(this.fastMs>=6000&&time-this.lastChange>=6000)next=Math.min(1,this.scale+.1);
  if(next!==this.scale){const reduced=next<this.scale;this.scale=next;this.lastChange=time;this.slowMs=0;this.fastMs=0;if(reduced)this.settledSince=time;}
  return this.scale;
 }
}
