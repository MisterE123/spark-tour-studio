import {memoizedModule} from '../shared/lazy-module.mjs';

// Start automatically from Stage, after the title has had a chance to paint.
// Keeping this boundary dynamic also keeps Spark's eager WASM off that paint.
export const loadTourRuntime=memoizedModule(()=>import('./runtime'));
