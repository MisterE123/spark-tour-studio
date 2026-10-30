// The pinned adaptive implementation can merge one block on CPU, but explicitly
// requires WebGPU for multiple blocks. Discover that real capability boundary;
// a point-count guess would be wrong when the memory budget changes block size.
export const cpuAdaptiveUnavailable=error=>/^multi-block adaptive decimation requires (?:WebGPU \(|a WebGPU block working set that fits the adapter limits)/.test(error?.message||'');

// One merge generation retains ceil(N / 2). Rounding its target down would
// trigger another full planning pass merely to remove one Gaussian from odd N.
export const sogsTargetCount=(count,ratio)=>Math.max(1,Math.ceil(count*ratio));

export async function reduceSogsLevel({method,open,adaptive,uniform,pool,options,device,progress=()=>{}}){
 let input=await open(),effective=method,fallback='';
 const reduce=()=>device.run(()=> (effective==='adaptive'?adaptive:uniform)(input,pool,options));
 try{return {source:await reduce(),method:effective,fallback};}
 catch(error){
  if(device.backend!=='cpu'||effective!=='adaptive'||!cpuAdaptiveUnavailable(error))throw error;
  fallback=error.message;effective='uniform';await Promise.resolve(input.close()).catch(()=>{});
  progress('Adaptive multi-block reduction needs WebGPU; continuing with uniform CPU reduction.');
  input=await open();return {source:await reduce(),method:effective,fallback};
 }
}
