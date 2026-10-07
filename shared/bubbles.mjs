import {z} from 'zod';
export const BubbleSettingsSchema=z.object({translucency:z.number().finite().min(0).max(1).optional(),size:z.number().finite().min(.5).max(3).optional(),distanceFade:z.number().finite().min(0).max(1).optional()});
export const bubbleDefaults={translucency:.84,size:1,distanceFade:0};
// Size is a multiplier on the existing screen footprint; a bubble's zero adds nothing.
export function bubbleAppearance(settings={},size=0,distance=0){const s={...bubbleDefaults,...settings};return {size:s.size*(1+size),glassOpacity:(1-s.translucency)*(1-s.distanceFade*Math.max(0,distance)/(10+Math.max(0,distance)))};}
export function pathYaw(current,x,z,dt){const target=Math.atan2(-x,-z),delta=Math.atan2(Math.sin(target-current),Math.cos(target-current));return current+delta*(1-Math.exp(-5*dt));}
