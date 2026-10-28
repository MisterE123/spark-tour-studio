const path=require('node:path');

// A project reference is a URL, while the corresponding disk name is decoded
// exactly once. Check before URL normalization can erase a traversal segment.
function localReference(value){
 if(typeof value!=='string'||!value||/[\u0000-\u001f\u007f\\]/.test(value)||/^[a-z][a-z0-9+.-]*:/i.test(value)||value.startsWith('/'))throw Error('Use a relative asset URL.');
 let decoded;try{decoded=decodeURIComponent(value.split(/[?#]/)[0]);}catch{throw Error('Invalid asset URL encoding.');}
 if(!decoded||decoded.startsWith('/')||/^[a-z]:/i.test(decoded)||/[\u0000-\u001f\u007f\\]/.test(decoded)||decoded.split('/').includes('..'))throw Error('Asset URL escapes its folder.');
 const url=new URL(value,'https://tour-assets.invalid/'),name=decodeURIComponent(url.pathname.slice(1));
 if(url.origin!=='https://tour-assets.invalid'||!name)throw Error('Use a relative asset URL.');
 return {path:name,reference:url.pathname.slice(1)+url.search+url.hash,search:url.search,hash:url.hash};
}
function assetReference(name){
 if(typeof name!=='string'||!name||path.isAbsolute(name)||/[\u0000-\u001f\u007f\\]/.test(name)||name.split('/').some(part=>!part||part==='.'||part==='..'))throw Error('Invalid asset filename.');
 return name.split('/').map(part=>encodeURIComponent(part)).join('/');
}
module.exports={localReference,assetReference};
