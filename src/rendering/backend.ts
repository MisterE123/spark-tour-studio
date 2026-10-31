import * as THREE from 'three';
import type {WebGPURenderer} from 'three/webgpu';

export interface RadixRenderSettings {
 method:'ewa'|'3dgut'|'htgs'|'raygs';sortBits:16|24|32;sortMode:'auto'|'gpu'|'cpu';autoSortDistance:number;autoSortAngle:number;
 selectedSplatBudget:number;residentSplatBudget:number;
 lodBaseDistance:number;lodMultiplier:number;lodBehindPenalty:number;lodUnderfill:number;
 lodRangeMin:number;lodRangeMax:number;lodBudgetMode:'limit'|'target';lodUpdateDistance:number;lodUpdateAngle:number;
 maxShDegree:number;minAlpha:number;maxStdDev:number;minPixelRadius:number;maxPixelRadius:number;minContribution:number;blurAmount:number;preBlurAmount:number;sortGuard:number;
 pixelRatio:number;xrResolutionScale:number;
}
export interface SplatAssetMetadata {format:'sog'|'sogs'|'sog-lod';lod:boolean;splatCount:number;levels:number;bounds:THREE.Box3}
export interface SplatAssetStats {
 phase:'loading'|'streaming'|'ready'|'error'|'disposed';selected:number;shown:number;residentSplats:number;residentFiles:number;loading:number;failed:number;error:string;
 /** Mandatory selectable leaf coverage for this LoD asset; excludes fixed environment splats. */
 selectionFloor?:number;
}
export interface SplatAssetOptions {signal?:AbortSignal;maxSh?:number;onProgress?:(fraction:number,stage:string)=>void;onError?:(error:Error)=>void}
/** A renderer-independent authored transform and bounded surface-picking target. */
export abstract class SplatAssetGroup extends THREE.Group {
 abstract readonly initialized:Promise<SplatAssetMetadata>;
 abstract readonly bounds:THREE.Box3;
 abstract readonly stats:SplatAssetStats;
 abstract get maxSh():number;
 abstract set maxSh(value:number);
 abstract setMaxSh(degree:number):void;
 abstract invalidateTransform():void;
 abstract setSelection(volumes:unknown[]):void;
 abstract dispose():void;
 abstract retry():void;
}
export interface SplatBackendStats {
 backend:'webgpu'|'webgpu-gl';selected:number;shown:number;visible:number;residentSplats:number;loading:number;failed:number;frames:number;
 /** Lowest per-asset LoD floor among attached visible assets. Undefined if none can adapt. */
 selectionFloor?:number;
}
export interface SplatBackend {
 readonly renderer:WebGPURenderer;
 readonly node:THREE.Object3D;
 readonly stats:SplatBackendStats;
 createAsset(url:string,options?:SplatAssetOptions):SplatAssetGroup;
 update(camera:THREE.Camera,time?:number):void;
 applySettings(settings:Partial<RadixRenderSettings>):void;
 hasPresented(asset:SplatAssetGroup):boolean;
 markRendered():void;
 dispose():void;
}
export interface RadixBackendOptions {canvas?:HTMLCanvasElement;backend?:'auto'|'webgpu'|'webgpu-gl';xr?:boolean;multiview?:boolean;directCanvas?:boolean;settings?:Partial<RadixRenderSettings>}
