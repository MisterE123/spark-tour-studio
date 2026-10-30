// Format recognition is shared by authoring, export and the rendering adapter.
// Keep RAD recognizable so existing projects can be reopened and re-imported.
export function splatFormat(reference){
 if(typeof reference!=='string'||!reference)return;
 let name;try{name=decodeURIComponent(new URL(reference,'https://tour-assets.invalid/').pathname).split('/').at(-1)?.toLowerCase();}catch{return;}
 if(name?.endsWith('.rad'))return 'rad';
 if(name==='lod-meta.json')return 'sog-lod';
 if(name==='meta.json'||name?.endsWith('.sog'))return 'sog';
}
export const isRadReference=reference=>splatFormat(reference)==='rad';
export const isSogsReference=reference=>['sog','sog-lod'].includes(splatFormat(reference));
export const isSplatReference=reference=>!!splatFormat(reference);
export function splatSourceLabel(reference){return {rad:'RAD',sog:'SOG', 'sog-lod':'Streamed SOG'}[splatFormat(reference)]||'Splat';}
