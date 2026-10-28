// Track settlement, rather than just successful reads. A native import can
// finish its I/O before its captured callback updates the project and dirty flag.
export function createEditorOperations(){
 const pending=new Set();
 return {
  get pending(){return pending.size;},
  async track(operation){
   let settle;const done=new Promise(resolve=>{settle=resolve;});pending.add(done);
   try{return await operation();}finally{pending.delete(done);settle();}
  },
  async wait(){while(pending.size)await Promise.all([...pending]);}
 };
}
