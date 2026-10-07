import {z} from 'zod';
import {ProjectSchema,HostingSchema} from './project.mjs';

const envelope=z.object({format:z.literal('spark-tour-recovery'),version:z.literal(1),project:ProjectSchema,hosting:HostingSchema});
export function createRecovery(project,hosting){return envelope.parse({format:'spark-tour-recovery',version:1,project,hosting});}
export function parseRecovery(value,savedHosting={}){
 if(value===undefined||value===null)return undefined;
 if(value.format==='spark-tour-recovery'||'project' in value){const parsed=envelope.parse(value);return {project:parsed.project,hosting:parsed.hosting};}
 // Older editor versions wrote a bare project. Their hosting choices were only
 // in the saved config, which remains the correct fallback for that format.
 return {project:ProjectSchema.parse(value),hosting:HostingSchema.parse(savedHosting)};
}
