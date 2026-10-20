import {z} from 'zod';
export const DEFAULT_WALK_HEIGHT=1.7,DEFAULT_WALK_STEP_HEIGHT=.5334;
export const NavigationSettingsSchema=z.object({baseSpeed:z.number().finite().min(.1).max(100).default(2),walkHeight:z.number().finite().min(1).max(2.4).optional(),walkStepHeight:z.number().finite().min(0).max(1).optional()});
export function movementSpeed(project,scene,visitorMultiplier=1){return (project?.navigation?.baseSpeed??2)*(scene?.speedMultiplier??1)*visitorMultiplier;}
export function walkingSettings(project,scene){return {height:scene?.walkHeight??project?.navigation?.walkHeight??DEFAULT_WALK_HEIGHT,stepHeight:scene?.walkStepHeight??project?.navigation?.walkStepHeight??DEFAULT_WALK_STEP_HEIGHT};}
export function vrWorldScale(scene,view){return (scene?.vrScale??1)*(view?.vrScale??1);}
