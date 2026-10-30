export interface FramePerformanceSnapshot {
 windowMs:number;sampleCount:number;durationMs:number;currentFps:number|null;averageFps:number|null;
 worstFrameMs:number|null;spikeCount:number;spikeThresholdMs:number;recording:boolean;peaks:(number|null)[];
}

/** Raw rendered-frame intervals. Sampling allocates nothing and never drives rendering. */
export class FramePerformanceTracker {
 readonly windowMs:number;
 private times:Float64Array;private durations:Float64Array;private head=0;private count=0;
 private continuous=false;private lastTick:number|undefined;private context:string|undefined;
 constructor({windowMs=60000,capacity=18000}:{windowMs?:number;capacity?:number}={}){
  if(!Number.isFinite(windowMs)||windowMs<=0||!Number.isInteger(capacity)||capacity<1)throw Error('Invalid frame-history limits.');
  this.windowMs=windowMs;this.times=new Float64Array(capacity);this.durations=new Float64Array(capacity);
 }
 /** Initial/loading/hidden intervals break continuity rather than creating a false spike. */
 pause(){this.continuous=false;this.lastTick=undefined;}
 reset(){this.head=0;this.count=0;this.pause();}
 sample(time:number,frameMs:number,eligible:boolean,context=''){
  if(context!==this.context){this.reset();this.context=context;}
  if(!eligible||!Number.isFinite(time)||!Number.isFinite(frameMs)||frameMs<=0){this.pause();return;}
  if(this.lastTick!==undefined&&time<=this.lastTick){this.pause();return;}
  const accept=this.continuous;this.lastTick=time;this.continuous=true;
  if(!accept)return;
  this.prune(time);const index=(this.head+this.count)%this.times.length;
  this.times[index]=time;this.durations[index]=frameMs;
  if(this.count===this.times.length)this.head=(this.head+1)%this.times.length;else this.count++;
 }
 private prune(now:number){while(this.count&&this.times[this.head]<now-this.windowMs){this.head=(this.head+1)%this.times.length;this.count--;}}
 snapshot(now:number,bins=180):FramePerformanceSnapshot{
  if(!Number.isFinite(now)||!Number.isInteger(bins)||bins<1||bins>1000)throw Error('Invalid frame-history snapshot.');
  this.prune(now);const peaks:(number|null)[]=Array(bins).fill(null),start=now-this.windowMs,spikeThresholdMs=50;
  let durationMs=0,worstFrameMs=0,spikeCount=0,recentDuration=0,recentCount=0;
  for(let offset=0;offset<this.count;offset++){
   const index=(this.head+offset)%this.times.length,time=this.times[index],duration=this.durations[index];
   durationMs+=duration;worstFrameMs=Math.max(worstFrameMs,duration);if(duration>=spikeThresholdMs)spikeCount++;
   if(time>=now-1000){recentDuration+=duration;recentCount++;}
   const bucket=Math.max(0,Math.min(bins-1,Math.floor((time-start)/this.windowMs*bins)));peaks[bucket]=Math.max(peaks[bucket]||0,duration);
  }
  return {windowMs:this.windowMs,sampleCount:this.count,durationMs,currentFps:recentCount?recentCount*1000/recentDuration:null,averageFps:this.count?this.count*1000/durationMs:null,worstFrameMs:this.count?worstFrameMs:null,spikeCount,spikeThresholdMs,recording:this.continuous&&this.lastTick!==undefined&&now-this.lastTick<1500,peaks};
 }
}
