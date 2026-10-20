import {z} from 'zod';
export const NavigationSettingsSchema=z.object({baseSpeed:z.number().finite().min(.1).max(100).default(2)});
export function movementSpeed(project,scene,visitorMultiplier=1){return (project?.navigation?.baseSpeed??2)*(scene?.speedMultiplier??1)*visitorMultiplier;}
export function vrWorldScale(scene,view){return (scene?.vrScale??1)*(view?.vrScale??1);}
