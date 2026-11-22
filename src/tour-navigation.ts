import type {IconName} from './material-symbols';
import type {Mode} from './model';

// Visitor controls share this vocabulary across the browser and headset.
export const modeName: Record<Mode, string> = {jumps: 'Viewpoints', fly: 'Drone', explore: 'Walk'};
export const modeIcon: Record<Mode, IconName> = {jumps: 'photo', fly: 'drone', explore: 'directions_walk'};
export const tourSections = {
  move: 'Movement',
  scenes: 'Scenes',
  views: 'Viewpoints',
  options: 'Settings',
} as const;
