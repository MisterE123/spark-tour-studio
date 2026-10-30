import {splatFormat} from './splat-format.mjs';

/** Rendering support is separate from project validity: retained sources stay editable. */
export function radixSourceIssue(reference){
 if(typeof reference!=='string'||!reference.trim())return 'This scene has no splat source. Choose SOGS or convert its original PLY.';
 let url;
 try{url=new URL(reference,'https://tour-assets.invalid/');}catch{return 'This splat address is invalid. Choose SOGS or convert its original PLY.';}
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return 'Splat sources need an HTTP(S) address or a project-relative path.';
 const format=splatFormat(reference);
 let pathname;try{pathname=decodeURIComponent(url.pathname);}catch{return 'This splat address is invalid. Choose SOGS or convert its original PLY.';}
 if(format==='rad'||/\.radc$/i.test(pathname))return 'RAD rendering is unavailable in this Radix experiment. Your scene and authoring are retained. Replace its splat with SOGS or convert the original PLY.';
 if(!['sog','sog-lod'].includes(format))return 'This splat format cannot render in Radix. Choose a .sog file, meta.json or lod-meta.json, or convert the original PLY.';
 return '';
}
