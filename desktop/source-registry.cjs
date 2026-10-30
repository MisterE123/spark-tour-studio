const path=require('node:path');
class SourceRegistry{
 constructor(write){this.write=write;this.owners=new Map();this.writes=Promise.resolve();}
 key(root){const value=path.resolve(root);return process.platform==='win32'?value.toLowerCase():value;}
 accept(root,sources){this.owners.set(this.key(root),sources);}
 latest(root){return this.owners.get(this.key(root));}
 persist(root,sources){
  // A delayed write belongs to its original folder, but must never overwrite
  // a newer source map accepted for that same folder while it was queued.
  this.writes=this.writes.catch(()=>{}).then(()=>this.write(root,structuredClone(this.latest(root)||sources)));
  return this.writes;
 }
 rollback(root,sources,prefix,info,prior){for(const map of new Set([sources,this.latest(root)])){const current=map?.[prefix];if(current?.dir===info.dir&&current?.kind===info.kind){if(prior===undefined)delete map[prefix];else map[prefix]=prior;}}return this.persist(root,sources);}
}
module.exports={SourceRegistry};
