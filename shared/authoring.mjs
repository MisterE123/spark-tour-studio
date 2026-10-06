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
