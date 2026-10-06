export function assertPagedRad(meta) {
  if (meta.lodTree !== true) {
    throw new Error(`This RAD contains ${meta.count.toLocaleString('en-US')} splats but no LoD tree. Tour streaming requires a RAD exported with a LoD hierarchy. Select the LoD-enabled output; renaming a file or placing it in a LOD folder does not add that hierarchy. The file has not been loaded in full.`);
  }
}
