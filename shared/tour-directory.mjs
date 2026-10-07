import {bubbleLabel} from './bubbles.mjs';
import {listedViewpoints,sceneThumbnail} from './viewpoints.mjs';
import {richTextPlainText} from './rich-text.mjs';

// Stable scene/object IDs are the navigation target. Search never fetches scan
// assets or custom HTML, and excludes unlisted viewpoints from direct view results.
export function tourDirectory(project){
 const scenes=[],places=[];
 for(const scene of project?.scenes||[]){
  const entry=(kind,id,label,description='',thumbnail='')=>({kind,id,sceneId:scene.id,sceneName:scene.name,label,description,thumbnail});
  scenes.push(entry('scene',scene.id,scene.name,'',sceneThumbnail(scene)));
  for(const view of listedViewpoints(scene))places.push(entry('viewpoint',view.id,view.name,view.description||'',view.thumbnail||''));
  for(const bubble of scene.hotspots){
   const page=bubble.kind==='page'?project.pages.find(p=>p.id===bubble.target):undefined;
   const text=page?.blocks.map(block=>block.richText?richTextPlainText(block.richText):block.text).filter(Boolean).join('\n')||'';
   places.push({...entry('bubble',bubble.id,bubbleLabel(bubble,project,scene),text),bubbleKind:bubble.kind});
  }
 }
 return [...scenes,...places];
}
export function searchTour(entries,query='',kind='all'){
 const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return entries.filter(entry=>(kind==='all'||entry.kind===kind)&&words.every(word=>(entry.label+'\n'+entry.sceneName+'\n'+entry.description).toLocaleLowerCase().includes(word)));
}
