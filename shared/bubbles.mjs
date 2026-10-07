import {z} from 'zod';
export const BubbleSettingsSchema=z.object({translucency:z.number().finite().min(0).max(1).optional(),size:z.number().finite().min(.5).max(3).optional(),distanceFade:z.number().finite().min(0).max(1).optional(),occlusion:z.boolean().optional()});
export const bubbleDefaults={translucency:.84,size:1,distanceFade:0,occlusion:true};
const clamp=value=>Math.max(0,Math.min(1,value));
// The strength slider controls how close a bubble disappears, in world meters.
export function bubbleFadeDistance(strength=0){const value=clamp(strength);return value===0?Infinity:8+72*(1-value)**3;}
export function bubbleVisibility(strength=0,distance=0,reveal=false){
 if(reveal||strength<=0)return 1;
 const end=bubbleFadeDistance(strength),t=clamp((Math.max(0,distance)-2)/(end-2));
 return 1-t*t*(3-2*t);
}
// Leave room around a marker placed on a splat surface; the host surface should
// not hide its own bubble because of Gaussian thickness or coarse streamed LoD.
export function bubbleOcclusionLimit(distance){return Math.max(0,distance-Math.max(.65,distance*.025));}
// Base glass transparency and whole-bubble distance visibility are independent.
// Size is a multiplier on the existing footprint; a bubble's zero adds nothing.
export function bubbleAppearance(settings={},size=0,distance=0,reveal=false){
 const s={...bubbleDefaults,...settings},visibility=bubbleVisibility(s.distanceFade,distance,reveal);
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
