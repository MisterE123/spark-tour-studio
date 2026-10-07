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
 scene.hotspots.push({id,label:'New bubble',position,kind:'page',target:''});ensureBubbleContent(project,sceneId,id);
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
