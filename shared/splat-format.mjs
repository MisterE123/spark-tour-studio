// Format recognition is shared by authoring, export and the rendering adapter.
// Keep RAD recognizable so existing projects can be reopened and re-imported.
export function splatEntryName(reference){
 if(typeof reference!=='string'||!reference)return;
 try{return decodeURIComponent(new URL(reference,'https://tour-assets.invalid/').pathname).split('/').at(-1)?.toLowerCase();}catch{return;}
}
export function sogEntryType(name){
 if(name==='lod-meta.json')return 'lod';
 if(name==='meta.json')return 'meta';
 if(name?.endsWith('.sog'))return 'archive';
}
export function splatFormat(reference){
 const name=splatEntryName(reference);
 if(name?.endsWith('.rad'))return 'rad';
 const sog=sogEntryType(name);
 if(sog)return sog==='lod'?'sog-lod':'sog';
}
export const isRadReference=reference=>splatFormat(reference)==='rad';
export const isSogsReference=reference=>['sog','sog-lod'].includes(splatFormat(reference));
export const isSplatReference=reference=>!!splatFormat(reference);
export function splatSourceLabel(reference){return {rad:'RAD',sog:'SOG', 'sog-lod':'Streamed SOG'}[splatFormat(reference)]||'Splat';}
