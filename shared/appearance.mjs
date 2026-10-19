import {z} from 'zod';

export const AppearanceSchema=z.object({glassShade:z.number().finite().min(0).max(1).default(.26)});

/** Keep clear glass neutral: shade adjusts light absorption, not its colour. */
export function glassVariables(appearance){
 const shade=Number.isFinite(appearance?.glassShade)?Math.min(1,Math.max(0,appearance.glassShade)):.26;
 const alpha=value=>Math.round(value*1000)/1000;
 return {'--glass':`rgba(0,0,0,${alpha(shade*.46)})`,'--glass-strong':`rgba(0,0,0,${alpha(shade)})`,'--panel':`rgba(0,0,0,${alpha(shade*.92)})`};
}
