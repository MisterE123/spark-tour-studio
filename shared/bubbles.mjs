import {z} from 'zod';
const fadeDistance=z.number().finite().min(1).max(1000000).nullable();
export const BubbleSettingsSchema=z.object({translucency:z.number().finite().min(0).max(1).optional(),size:z.number().finite().min(.5).max(3).optional(),distanceFade:z.number().finite().min(0).max(1).optional(),fadeDistance:fadeDistance.optional(),occlusion:z.boolean().optional()});
export const SceneBubbleSettingsSchema=z.object({translucency:z.number().finite().min(0).max(1).optional(),sizeMultiplier:z.number().finite().min(.05).max(20).optional(),fadeDistance:fadeDistance.optional(),fadeDistanceMultiplier:z.number().finite().min(.01).max(10000).optional(),occlusion:z.boolean().optional()});
export const bubbleDefaults={translucency:.84,size:1,distanceFade:0,occlusion:true};
const clamp=value=>Math.max(0,Math.min(1,value));
// The strength slider controls how close a bubble disappears, in world meters.
export function bubbleFadeDistance(strength=0){const value=clamp(strength);return value===0?Infinity:8+72*(1-value)**3;}
// Existing strength settings retain their original curve. New authoring uses
// meters, with a scene override or a multiplier of the project distance.
export function resolveBubbleSettings(project,scene){
 const base={...bubbleDefaults,...project?.bubbles},local=scene?.bubbles||{};
 const direct=local.fadeDistance!==undefined?local.fadeDistance:base.fadeDistance;
 const multiplier=local.fadeDistance!==undefined?1:(local.fadeDistanceMultiplier??1);
 const end=(direct!==undefined?(direct===null?Infinity:direct):bubbleFadeDistance(base.distanceFade))*multiplier;
 const start=(direct!==undefined?end*.2:2*multiplier);
 return {translucency:local.translucency??base.translucency,size:base.size*(local.sizeMultiplier??1),occlusion:local.occlusion??base.occlusion,fadeDistance:Number.isFinite(end)?end:null,fadeStartDistance:Number.isFinite(end)?start:0};
}
function visibilityAtDistance(end,start,distance,reveal){
 if(reveal||!Number.isFinite(end))return 1;
 const t=clamp((Math.max(0,distance)-start)/(end-start));
 return 1-t*t*(3-2*t);
}
export function bubbleVisibility(strength=0,distance=0,reveal=false){
 return visibilityAtDistance(bubbleFadeDistance(strength),2,distance,reveal);
}
// Leave room around a marker placed on a splat surface; the host surface should
// not hide its own bubble because of Gaussian thickness or coarse streamed LoD.
export function bubbleOcclusionLimit(distance){return Math.max(0,distance-Math.max(.65,distance*.025));}
// Base glass transparency and whole-bubble distance visibility are independent.
// Size is a multiplier on the existing footprint; a bubble's zero adds nothing.
export function bubbleAppearance(settings={},size=0,distance=0,reveal=false){
 const s={...bubbleDefaults,...settings},end=s.fadeDistance===null?Infinity:s.fadeDistance,visibility=end===undefined?bubbleVisibility(s.distanceFade,distance,reveal):visibilityAtDistance(end,s.fadeStartDistance??end*.2,distance,reveal);
 return {size:s.size*(1+size),glassOpacity:1-s.translucency,visibility,interactive:visibility>=.05};
}
// Navigation labels are always derived from stable destination IDs, never copied
// from an old author-entered name. This also keeps exports current after renames.
export function bubbleLabel(hotspot,project,scene){
 if(hotspot.kind==='scene')return 'Go to Scene: '+(project?.scenes.find(s=>s.id===hotspot.target)?.name||'Select a scene');
 if(hotspot.kind==='viewpoint')return 'Go to View: '+(scene?.viewpoints.find(v=>v.id===hotspot.target)?.name||'Select a view');
 return hotspot.label;
}
export function pathYaw(current,x,z,dt){const target=Math.atan2(-x,-z),delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*(1-Math.exp(-5*dt));}
