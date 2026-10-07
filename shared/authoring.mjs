// Pure authoring operations keep IDs and inbound links consistent and undoable.
export function deleteScene(project,id){
 project.scenes=project.scenes.filter(s=>s.id!==id);
 for(const scene of project.scenes)scene.hotspots=scene.hotspots.filter(h=>!(h.kind==='scene'&&h.target===id));
 if(project.startScene===id)project.startScene=project.scenes[0]?.id||'';
}
export function deleteViewpoint(project,sceneId,id){
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene||scene.viewpoints.length<2)return;
 scene.viewpoints=scene.viewpoints.filter(v=>v.id!==id);const fallback=scene.viewpoints[0].id;
 if(scene.entry===id)scene.entry=fallback;if(scene.walkStart===id)scene.walkStart=fallback;
 scene.hotspots=scene.hotspots.filter(h=>!(h.kind==='viewpoint'&&h.target===id));
 for(const s of project.scenes)for(const h of s.hotspots)if(h.kind==='scene'&&h.target===sceneId&&h.viewpoint===id)delete h.viewpoint;
}
export function reorder(items,id,direction){const index=items.findIndex(x=>x.id===id),to=index+direction;if(index>=0&&to>=0&&to<items.length)[items[index],items[to]]=[items[to],items[index]];}
export function ensureBubbleContent(project,sceneId,bubbleId,sourceId){
 const bubble=project.scenes.find(s=>s.id===sceneId)?.hotspots.find(h=>h.id===bubbleId);if(!bubble)return;
 let content=!sourceId&&project.pages.find(p=>p.id===bubble.target);
 if(!content){const id='content-'+bubbleId,source=project.pages.find(p=>p.id===sourceId);content=!sourceId&&project.pages.find(p=>p.id===id);
  if(!content){content=source?{...structuredClone(source),id}:{id,title:bubble.label,html:'',blocks:[{type:'text',text:'Tell the story of this place.',url:''}]};const index=project.pages.findIndex(p=>p.id===id);if(index<0)project.pages.push(content);else project.pages[index]=content;}}
 content.title=bubble.label;bubble.kind='page';bubble.target=content.id;delete bubble.viewpoint;return content;
}
export function addContentBubble(project,sceneId,id,position){
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene)return;
 scene.hotspots.push({id,label:'New bubble',position,kind:'page',target:'',createdAt:Date.now()});ensureBubbleContent(project,sceneId,id);
}
export function removeBubble(project,sceneId,id){
 const scene=project.scenes.find(s=>s.id===sceneId),bubble=scene?.hotspots.find(h=>h.id===id);if(!scene||!bubble)return;
 scene.hotspots=scene.hotspots.filter(h=>h.id!==id);
 if(bubble.kind==='page'&&!project.scenes.some(s=>s.hotspots.some(h=>h.kind==='page'&&h.target===bubble.target)))project.pages=project.pages.filter(p=>p.id!==bubble.target);
}

export function renameBubble(project,sceneId,id,label){
 const bubble=project.scenes.find(s=>s.id===sceneId)?.hotspots.find(h=>h.id===id);if(!bubble)return;
 bubble.label=label;if(bubble.kind!=='page')return;
 const shared=project.scenes.some(s=>s.hotspots.some(h=>h!==bubble&&h.kind==='page'&&h.target===bubble.target));
 ensureBubbleContent(project,sceneId,id,shared?bubble.target:undefined);
}

// Repair the pre-inline-content workflow without guessing at broken explicit links.
// Stable content IDs win; a unique, unclaimed title recovers older empty references.
export function normalizeBubbleContent(project){
 const claimed=new Set(project.scenes.flatMap(s=>s.hotspots.filter(h=>h.kind==='page'&&h.target).map(h=>h.target)));
 for(const scene of project.scenes)for(const bubble of scene.hotspots){
  if(bubble.kind!=='page'||project.pages.some(p=>p.id===bubble.target))continue;
  let content=project.pages.find(p=>p.id==='content-'+bubble.id);
  if(!content&&!bubble.target){const matches=project.pages.filter(p=>p.title===bubble.label&&!claimed.has(p.id));if(matches.length===1)content=matches[0];}
  if(content){bubble.target=content.id;claimed.add(content.id);continue;}
  if(bubble.target)continue;
  let id='content-'+bubble.id,index=2;while(project.pages.some(p=>p.id===id))id='content-'+bubble.id+'-'+index++;
  project.pages.push({id,title:bubble.label,html:'',blocks:[]});bubble.target=id;claimed.add(id);
 }
 return project;
}
export function usedContent(project){const targets=new Set(project.scenes.flatMap(s=>s.hotspots.filter(h=>h.kind==='page').map(h=>h.target)));return project.pages.filter(p=>targets.has(p.id));}

// A conversion result only commits after it is complete. Re-import changes the
// source on the current scene object, so edits made during conversion survive.
export function applySceneImport(project,job){
 if(job.state!=='completed'||!job.result?.source)return {status:'ignored'};
 if(job.replaceSceneId){
  const scene=project.scenes.find(s=>s.id===job.replaceSceneId);
  if(!scene)return {status:'discarded',message:`${job.name}: the scene was deleted while importing.`};
  if(scene.source===job.result.source)return {status:'already'};
  if(job.expectedSource!==undefined&&scene.source!==job.expectedSource)return {status:'discarded',message:`${scene.name}: its source changed while importing. The generated RAD was kept without replacing the scene.`};
  scene.source=job.result.source;return {status:'replaced',sceneId:scene.id,source:scene.source};
 }
 if(project.scenes.some(s=>s.id===job.result.id))return {status:'already'};
 project.scenes.push(structuredClone(job.result));if(!project.startScene)project.startScene=job.result.id;
 return {status:'added',sceneId:job.result.id};
}

// Keep an explicitly edited source effective when delivery has a scene
// override. Native file relinks are project-local even with a CDN asset base.
export function setSceneSource(project,hosting,sceneId,source,local=false){
 const scene=project.scenes.find(s=>s.id===sceneId);if(!scene)return false;
 let otherBase=false;if(local){const base='https://spark-tour.local/project/';try{otherBase=new URL('asset.rad',new URL(hosting.assetBaseUrl||'./',base)).href!==new URL('asset.rad',base).href;}catch{otherBase=true;}}
 if(hosting.sceneUrls?.[sceneId]||otherBase)hosting.sceneUrls={...hosting.sceneUrls,[sceneId]:source};
 scene.source=source;return true;
}

export function duplicateBubble(project,sceneId,id,newId){
 const scene=project.scenes.find(s=>s.id===sceneId),source=scene?.hotspots.find(h=>h.id===id);if(!source)return;
 const copy={...structuredClone(source),id:newId,createdAt:Date.now()};
 if(copy.kind==='page')copy.label=copy.label+' copy';scene.hotspots.push(copy);
 if(copy.kind==='page')ensureBubbleContent(project,sceneId,newId,source.target);
 return copy;
}
export function duplicateViewpoint(project,sceneId,id,newId){
 const scene=project.scenes.find(s=>s.id===sceneId),source=scene?.viewpoints.find(v=>v.id===id);if(!source)return;
 const copy={...structuredClone(source),id:newId,name:source.name+' copy'};scene.viewpoints.push(copy);return copy;
}
export function duplicateScene(project,id,newId,makeId){
 const source=project.scenes.find(s=>s.id===id);if(!source)return;
 const copy={...structuredClone(source),id:newId,name:source.name+' copy'},views=new Map();
 for(const view of copy.viewpoints){const next=makeId();views.set(view.id,next);view.id=next;}
 copy.entry=views.get(copy.entry)||'';copy.walkStart=views.get(copy.walkStart)||'';
 for(const bubble of copy.hotspots){bubble.id=makeId();bubble.createdAt=Date.now();if(bubble.kind==='viewpoint')bubble.target=views.get(bubble.target)||bubble.target;if(bubble.kind==='scene'&&bubble.target===id){bubble.target=newId;if(bubble.viewpoint)bubble.viewpoint=views.get(bubble.viewpoint)||bubble.viewpoint;}}
 project.scenes.push(copy);for(const bubble of copy.hotspots)if(bubble.kind==='page')ensureBubbleContent(project,newId,bubble.id,bubble.target);
 return copy;
}
