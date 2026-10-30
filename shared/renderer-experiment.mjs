// This branch deliberately replaces the renderer. Keep that choice in one
// module so shared editor components do not depend on branch-name guesses.
export const RENDERER_EXPERIMENT=Object.freeze({
 id:'radix-sogs',name:'Radix preview',performanceNamespace:'radix',
 supportsRadLod:false,supportsSogLod:true
});
