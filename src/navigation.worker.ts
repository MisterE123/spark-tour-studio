import {buildNavigation} from '../shared/navigation.mjs';
let navigation:Awaited<ReturnType<typeof buildNavigation>>|undefined;
self.onmessage=async(event:MessageEvent)=>{const m=event.data;try{if(m.type==='build'){navigation=await buildNavigation(m.positions,m.indices);self.postMessage({type:'ready'});}else if(m.type==='path'){if(!navigation)throw Error('Walking routes are still being prepared.');self.postMessage({type:'path',id:m.id,path:navigation.path(m.start,m.end)});}}catch(error){self.postMessage({type:'error',id:m.id,error:String(error)});}};
