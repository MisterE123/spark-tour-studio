/**
 * Share an import across consumers without making a failed fetch permanent.
 * @template T
 * @param {()=>Promise<T>} importer
 * @returns {()=>Promise<T>}
 */
export function memoizedModule(importer){
 /** @type {Promise<T> | undefined} */
 let pending;
 return ()=>{
  if(pending)return pending;
  const task=Promise.resolve().then(importer);pending=task;
  void task.catch(()=>{if(pending===task)pending=undefined;});
  return task;
 };
}
