class ImportActivity{
 constructor(context){this.context=context;this.generation=0;this.projectGeneration=0;this.tasks=new Set();}
 get pending(){return this.tasks.size;}
 invalidate(){this.generation++;}
 projectChanged(){this.projectGeneration++;this.invalidate();}
 capture({projectOnly=false}={}){const {root,sources}=this.context(),generation=projectOnly?this.projectGeneration:this.generation;return {root,sources,assertCurrent:()=>{const current=this.context();if(generation!==(projectOnly?this.projectGeneration:this.generation)||root!==current.root||sources!==current.sources)throw Error('The project changed before the import finished. Import the asset again in the current project.');}};}
 async run(operation){const owner=this.capture();let finish;const task=new Promise(resolve=>finish=resolve);this.tasks.add(task);try{return await operation(owner);}finally{this.tasks.delete(task);finish();}}
 async wait(){while(this.tasks.size)await Promise.all([...this.tasks]);}
}
module.exports={ImportActivity};
