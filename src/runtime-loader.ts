import {memoizedModule} from '../shared/lazy-module.mjs';

// Start automatically from Stage, after the title has had a chance to paint.
// Keep renderer preparation and GPU allocation off that first title paint.
export const loadTourRuntime=memoizedModule(()=>import('./runtime'));
