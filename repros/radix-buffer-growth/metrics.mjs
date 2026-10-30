export function parseCounts(text){
 const counts=String(text).split(',').map(value=>Number(value.trim()));
 if(!counts.length||counts.length>10||counts.some(n=>!Number.isSafeInteger(n)||n<1024||n>16_000_000)||counts.some((n,i)=>i&&n<=counts[i-1]))throw new Error('Use 1–10 strictly increasing whole counts from 1,024 to 16,000,000.');
 return counts;
}
export function estimateMemory(counts,mode){
 const max=counts.at(-1),capacityUpper=2*max;
 // Four uint32 compact/radix arrays plus small histogram/scan buffers; full
 // renderer also holds one mono EWA projected uint32x4 and unorm8x4 keys.
 // Sort-only input is one fixed unorm8x4 texture. Old/new allocations can overlap.
 const scratchUpper=capacityUpper*17,input=mode==='sort'?max*4:0,projectionUpper=mode==='render'?capacityUpper*20:0;
 const bytes=scratchUpper+input+projectionUpper,mib=bytes/1048576;
 return {bytes,description:`Planning estimate: up to about ${Math.ceil(mib)} MiB of live GPU input/projection/sort storage at these counts, plus driver allocations, temporary old/new overlap, browser and pipeline memory. Sort scratch also has CPU typed-array backing. This is an upper estimate, not measured device memory. No scene asset is loaded.`};
}
export function percentile(values,q){if(!values.length)return 0;const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*q))];}
export function summarize(run){
 return (run.stages||[]).flatMap((stage,index)=>{
  if(!stage.start||stage.pass==='warmup')return[];
  const frames=run.frames.filter(frame=>frame.stage===index),intervals=frames.filter(frame=>frame.previousStage===undefined||frame.previousStage===index).map(f=>f.interval).filter(n=>Number.isFinite(n)&&n>0),cpu=frames.map(f=>f.cpu),events=run.events.filter(event=>event.stage===index),buffers=events.filter(e=>e.type==='createBuffer'),growth=events.filter(e=>e.type==='bufferCapacity');
  return [{pass:stage.pass,count:stage.count,frames:frames.length,intervalP95:percentile(intervals,.95),intervalMax:Math.max(0,...intervals),cpuP95:percentile(cpu,.95),cpuMax:Math.max(0,...cpu),createBuffers:buffers.length,createBufferMax:Math.max(0,...buffers.map(e=>e.ms)),createBufferTotal:buffers.reduce((n,e)=>n+e.ms,0),growths:growth.length}];
 });
}
