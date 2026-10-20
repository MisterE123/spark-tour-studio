import type {GitBridge} from './git-model';
import type {z} from 'zod';
import {PerformanceSettingsSchema,PerformanceLibrarySchema,PerformancePresetSchema} from '../shared/performance.mjs';
export type PerformanceSettings=z.infer<typeof PerformanceSettingsSchema>;
export type PerformanceLibrary=z.infer<typeof PerformanceLibrarySchema>;
export type PerformancePresetFile=z.infer<typeof PerformancePresetSchema>;
export type Vec3=[number,number,number];
export type Mode='jumps'|'fly'|'explore';
export interface TourDestination {sceneId:string;kind:'scene'|'viewpoint'|'bubble';id:string}
export interface Transform {position:Vec3;rotation:Vec3;scale:number}
export interface CollisionVolume {id:string;type:'ball'|'box';operation:'add'|'remove';position:Vec3;rotation:Vec3;size:Vec3}
export interface CollisionOptions {detail:.05|.1|.2|.5|1;pageSize?:number;surface:'smooth'|'blocky';smoothing:number;wallHeight:number;extrudeUp?:boolean;ignoreTransparent:boolean;opacityCutoff:number}
export interface CollisionAuthoring {scope?:'selected'|'entire';format?:'paged'|'glb';bounds?:CollisionVolume;volumes:CollisionVolume[];options:CollisionOptions}
export interface AudioTrack {source:string;loop:boolean;volume:number}
export interface SceneLink {id:string;label:string;sceneId:string;viewpointId?:string}
export interface ExtendedDescription {enabled:boolean;richText:RichTextDocument;links:SceneLink[]}
export interface Viewpoint {vrScale?:number;extendedDescription?:ExtendedDescription;listed?:boolean;type?:'photosphere'|'orbit'|'slider';autoAnimate?:boolean;animationSpeed?:number;orbit?:{center:Vec3;radius:number;azimuthBounds?:[number,number];elevationBounds?:[number,number]};slider?:{origin:Vec3;rotation:Vec3;bounds?:[number,number]};description?:string;audio?:AudioTrack;thumbnail?:string;id:string;name:string;position:Vec3;rotation:Vec3}
export interface Hotspot {createdAt?:number;size?:number;id:string;label:string;position:Vec3;kind:'page'|'scene'|'viewpoint';target:string;viewpoint?:string}
export interface RichTextNode {type:string;text?:string;attrs?:Record<string,unknown>;marks?:{type:string;attrs?:Record<string,unknown>}[];content?:RichTextNode[]}
export interface RichTextDocument {version:1;doc:RichTextNode}
export interface Block {type:'text'|'image'|'link'|'embed';text:string;url:string;richText?:RichTextDocument}
export interface Page {sceneLinks?:SceneLink[];id:string;title:string;html:string;blocks:Block[]}
export type SceneBackground={type:"solid";color:string;topColor?:string;bottomColor?:string}|{type:"panorama";source:string;yawDegrees:number}|{type:"splat";source:string;transform:Transform};
export interface BubbleSettings {occlusion?:boolean;translucency?:number;size?:number;distanceFade?:number;fadeDistance?:number|null}
export interface SceneBubbleSettings {occlusion?:boolean;translucency?:number;sizeMultiplier?:number;fadeDistance?:number|null;fadeDistanceMultiplier?:number}
export interface TourScene {bubbles?:SceneBubbleSettings;speedMultiplier?:number;vrScale?:number;collisionAuthoring?:CollisionAuthoring;background?:SceneBackground;walkHeight?:number;walkStepHeight?:number;thumbnailMode?:'starting-view'|'custom';audio?:AudioTrack;id:string;name:string;source:string;thumbnail:string;transform:Transform;collider:string;colliderTransform:Transform;modes:Mode[];entry:string;walkStart:string;viewpoints:Viewpoint[];hotspots:Hotspot[]}
export interface Project {navigation?:{baseSpeed:number;walkHeight?:number;walkStepHeight?:number};appearance?:{glassShade:number};bubbles?:BubbleSettings;performance?:PerformanceLibrary;version:1;title:string;description:string;cover:string;startScene:string;scenes:TourScene[];pages:Page[]}
export interface Hosting {assetBaseUrl:string;collisionBaseUrl?:string;sceneUrls:Record<string,string>}
export interface RecoverySnapshot {project:Project;hosting:Hosting}
export interface Snapshot {project:Project;hosting:Hosting;base:string;path:string;recovery?:RecoverySnapshot}
export interface ImportJob {id:string;name:string;kind:'rad'|'ply';replaceSceneId?:string;expectedSource?:string;options:{method?:string;maxSh?:number};state:'queued'|'running'|'completed'|'failed'|'cancelled';progress:string;error?:string;result?:TourScene;acknowledged:boolean}
export interface ImportQueueState {revision:number;paused:boolean;activeId:string|null;jobs:ImportJob[]}
export interface EditorBridge extends GitBridge {reimportScene(scene:{id:string;name:string;source:string},options:{method:'quality'|'quick';maxSh:number}):Promise<ImportQueueState>;queueScenes(kind:'rad'|'ply',options?:{method:'quality'|'quick';maxSh:number}):Promise<ImportQueueState>;getImportQueue():Promise<ImportQueueState>;importQueueAction(action:string,id?:string):Promise<ImportQueueState>;onImportQueue(fn:(queue:ImportQueueState)=>void):()=>void;importPerformancePreset():Promise<PerformancePresetFile|null>;exportPerformancePreset(preset:PerformancePresetFile):Promise<string|null>;importImageFile(file:File):Promise<string>;saveCollisionGlb(bytes:Uint8Array):Promise<string>;newProject():Promise<Snapshot|null>;openProject():Promise<Snapshot|null>;save(project:Project,hosting:Hosting,saveAs?:boolean):Promise<Snapshot>;autosave(project:Project,hosting?:Hosting):Promise<void>;importPly(options:{method:'quality'|'quick';maxSh:number}):Promise<string|null>;cancelConversion():Promise<void>;importAsset(kind:string):Promise<string|null>;exportTour(project:Project,hosting:Hosting,portable:boolean,omitSplats:boolean):Promise<string|null>;validateAssets(project:Project,hosting?:Hosting):Promise<string[]>;onProgress(fn:(text:string)=>void):()=>void;}
declare global {interface Window {studio?:EditorBridge}}
export interface EditorBridge {
 beginCollisionDiagnostics(summary:{sceneId:string;source:string;format:'paged'|'glb';scope:'selected'|'entire';volumeCount:number;hasBounds:boolean;options:CollisionOptions}):Promise<{id:string;path:string}>;
 appendCollisionDiagnostics(id:string,event:{type:'phase'|'success'|'cancelled'|'error';phase?:string;message?:string;ref?:string;completed?:number;total?:number;stats?:{selected:number;voxels:number;triangles:number}}):Promise<boolean>;
 beginPagedCollision():Promise<string>;
 appendPagedCollision(id:string,key:string,cells:Uint32Array):Promise<void>;
 pagedCollisionKeys(id:string):Promise<string[]>;
 readPagedCollision(id:string,key:string,offset:number,maxCells?:number):Promise<{cells:Uint32Array;done:boolean}>;
 writePagedCollisionTile(id:string,entry:unknown,bytes:Uint8Array):Promise<void>;
 finalizePagedCollision(id:string,manifest:unknown,stepHeight?:number):Promise<string>;
 abortPagedCollision(id:string):Promise<void>;
}
export const uid=()=>crypto.randomUUID();
export const emptyTransform=():Transform=>({position:[0,0,0],rotation:[0,0,0],scale:1});
