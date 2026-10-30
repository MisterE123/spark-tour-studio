import {z} from 'zod';

const number=(min,max,value)=>z.number().finite().min(min).max(max).default(value);
const integer=(min,max,value)=>z.number().int().min(min).max(max).default(value);

// Keep renderer-specific settings in their own optional namespace. Opening an
// older project must not reinterpret or overwrite its saved Spark presets.
export const RadixPerformanceSettingsSchema=z.object({
 method:z.enum(['ewa','3dgut','htgs','raygs']).default('ewa'),
 sortBits:z.union([z.literal(16),z.literal(24),z.literal(32)]).default(24),
 sortMode:z.enum(['auto','gpu','cpu']).default('auto'),
 autoSortDistance:number(0,5,.05),autoSortAngle:number(0,90,5),
 selectedSplatBudget:integer(50000,32000000,4000000).describe('Selected splat budget per asset. A foreground and splat background each have their own budget.'),
 residentSplatBudget:integer(50000,64000000,16000000).describe('Resident splat target per asset; mandatory coarse coverage, textures and pending work also consume memory.'),
 lodBaseDistance:number(.1,1000,5),lodMultiplier:number(1.2,10,3),
 lodBehindPenalty:number(1,20,2),lodUnderfill:integer(0,31,5),
 lodRangeMin:integer(0,31,0),lodRangeMax:integer(0,31,7),
 lodBudgetMode:z.enum(['limit','target']).default('limit'),
 lodUpdateDistance:number(0,10,.5),lodUpdateAngle:number(0,180,90),
 minContribution:number(0,20,0),blurAmount:number(0,2,.3),
 preBlurAmount:number(0,2,0),sortGuard:number(0,4,0),
 xrResolutionScale:number(.25,2,1)
}).strict().superRefine((value,context)=>{
 if(value.lodRangeMin>value.lodRangeMax)context.addIssue({code:'custom',path:['lodRangeMax'],message:'The coarsest level must be at least the finest level.'});
 if(value.residentSplatBudget<value.selectedSplatBudget)context.addIssue({code:'custom',path:['residentSplatBudget'],message:'The resident budget must be at least the selected splat budget.'});
});

/** @param {{radix?:unknown}|undefined} settings */
export function radixPerformanceSettings(settings){return RadixPerformanceSettingsSchema.parse(settings?.radix===undefined?{}:settings.radix);}

const common=z.object({
 pixelRatio:number(.5,2,1.5),maxSh:integer(0,3,3),
 minAlpha:number(0,.1,.5/255),maxStdDev:number(2,3,Math.sqrt(8)),
 minPixelRadius:number(0,3,0),maxPixelRadius:number(64,1024,512)
});

/**
 * Resolve only fields that Radix actually supports. The temporary automatic
 * scale changes selection, not saved presets, resident limits or source data.
 * @param {Record<string,unknown>|undefined} settings
 * @param {number} adaptiveScale
 */
export function radixRenderSettings(settings,adaptiveScale=1){
 if(!Number.isFinite(adaptiveScale)||adaptiveScale<=0||adaptiveScale>1)throw Error('Automatic detail scale must be greater than zero and at most one.');
 const specific=radixPerformanceSettings(settings),{maxSh,...shared}=common.parse(settings||{});
 return {...specific,...shared,maxShDegree:maxSh,selectedSplatBudget:Math.max(1,Math.floor(specific.selectedSplatBudget*adaptiveScale))};
}
