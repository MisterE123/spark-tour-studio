import {buildNavigation,NavigationRefinements,refinedNavigationPath} from '../shared/navigation.mjs';
import {navigationKey,cachedNavigation,cacheNavigation} from './navigation-cache';
import {physicalWalkingPath} from '../shared/walking-route.mjs';
import {walkingPathLength,walkingPathNeedsRefinement} from '../shared/walking-path.mjs';
import {createPagedNavigation} from '../shared/paged-navigation.mjs';
let navigation:Awaited<ReturnType<typeof buildNavigation>>|undefined;
let refinements:NavigationRefinements|undefined;
let paged:Awaited<ReturnType<typeof createPagedNavigation>>|undefined;
let queue=Promise.resolve();
// Legacy native tiles remain useful for distant routes. A nearby taller step
// can be retried on currently prepared physics without replacing those tiles.
async function localWalkingPath(m:any){
 if(!Array.isArray(m.parts)||!m.parts.length||m.parts.length>2048)throw Error('No nearby walking surfaces.');
 let vertices=0,indexCount=0;for(const part of m.parts){if(!(part.positions instanceof Float32Array)||!(part.indices instanceof Uint32Array)||part.positions.length%3||part.indices.length%3)throw Error('Invalid nearby walking surfaces.');vertices+=part.positions.length;indexCount+=part.indices.length;}
 if(vertices>8_000_000||indexCount>2_000_000)throw Error('Nearby walking surfaces exceed the local route budget.');
 const positions=new Float32Array(vertices),indices=new Uint32Array(indexCount);let v=0,i=0;for(const part of m.parts){positions.set(part.positions,v);for(const index of part.indices)indices[i++]=index+v/3;v+=part.positions.length;}
 let local:Awaited<ReturnType<typeof buildNavigation>>|undefined,refined:NavigationRefinements|undefined;
 try{
  if(!m.validate){local=await buildNavigation(positions,indices,undefined,m.options||{});try{return local.path(m.start,m.end);}catch{refined=new NavigationRefinements(positions,indices,m.options||{});return await refined.path(m.start,m.end);}}
  const direct=await physicalWalkingPath(m.parts,m.start,m.end,undefined,m.options?.stepHeight);
  const distance=Math.hypot(m.end.x-m.start.x,m.end.y-m.start.y,m.end.z-m.start.z);
  if(direct&&walkingPathLength(direct)<=distance*1.05+.1)return direct;
  local=await buildNavigation(positions,indices,undefined,m.options||{});refined=new NavigationRefinements(positions,indices,m.options||{});
  let route;try{const proposed=await refinedNavigationPath(local,refined,m.start,m.end);if(distance>16)return proposed;route=await physicalWalkingPath(m.parts,m.start,m.end,proposed,m.options?.stepHeight);}catch{}
  if(direct&&(!route||walkingPathLength(direct)<walkingPathLength(route)))return direct;
  if(!route)throw Error('No physically walkable local shortcut.');return route;
 }finally{local?.dispose();refined?.dispose();}
}
self.onmessage=(event:MessageEvent)=>{const m=event.data;queue=queue.then(async()=>{try{if(m.type==='build'){paged?.dispose();paged=undefined;navigation?.dispose();refinements?.dispose();const options=m.options||{};refinements=new NavigationRefinements(m.positions,m.indices,options);const started=performance.now();let key='',data:Uint8Array|undefined,cacheHit=false;try{key=await navigationKey(m.positions,m.indices,options);data=await cachedNavigation(key);}catch{}if(data)try{navigation=await buildNavigation(m.positions,m.indices,data,options);cacheHit=true;}catch{}if(!cacheHit)navigation=await buildNavigation(m.positions,m.indices,undefined,options);self.postMessage({type:'ready',cacheHit,durationMs:performance.now()-started});if(key&&!cacheHit)try{await cacheNavigation(key,navigation!.serialize());}catch{} }else if(m.type==='paged-init'){navigation?.dispose();navigation=undefined;refinements?.dispose();refinements=undefined;paged?.dispose();paged=await createPagedNavigation(m.navigation);self.postMessage({type:'ready',cacheHit:true,durationMs:0});}else if(m.type==='paged-path'){if(!paged)throw Error('Walking routes are still being prepared.');paged.sync(m.tiles);self.postMessage({type:'path',id:m.id,path:paged.path(m.start,m.end)});}else if(m.type==='local-paged-path'){self.postMessage({type:'path',id:m.id,path:await localWalkingPath(m),world:true});}else if(m.type==='path'){if(!navigation)throw Error('Walking routes are still being prepared.');let path;try{path=navigation.path(m.start,m.end);}catch(error){if(!refinements)throw error;path=await refinements.path(m.start,m.end);self.postMessage({type:'path',id:m.id,path});return;}
 if(refinements&&(!path||walkingPathNeedsRefinement(path,m.start,m.end))){try{const part=refinements.region(m.start,m.end),local=await localWalkingPath({...m,validate:true,parts:[part],options:refinements.options});if(!path||walkingPathLength(local)<walkingPathLength(path))path=local;}catch(error){if(!path)throw error;}}
 if(!path)throw Error('No walking route.');self.postMessage({type:'path',id:m.id,path});}}catch(error){self.postMessage({type:'error',id:m.id,error:String(error)});}});};
