import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {blankProject,newScene,allReferences,ProjectSchema} from '../shared/project.mjs';
import {deleteScene,removeBubble,usedContent,generatedContentId} from '../shared/authoring.mjs';
import {radFixture} from './fixtures.mjs';
const {exportTour}=createRequire(import.meta.url)('../desktop/export.cjs');
const richLink=href=>({version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Read more',marks:[{type:'link',attrs:{href}}]}]}]}});
const page=(id,urls=[])=>({id,title:id,html:'',blocks:urls.map(url=>({type:'link',text:'Continue',url}))});
const bubble=(id,target)=>({id,label:id,position:[0,1,0],kind:'page',target});
function fixture(){const project=blankProject();project.scenes=[newScene('delete','Delete','scene.rad'),newScene('keep','Keep','scene.rad')];project.startScene='delete';return project;}

test('generated page addresses match only known block pages with encoded IDs and URL suffixes',()=>{
 const p=fixture();p.pages=[page('details'),{...page('custom'),html:'imports/custom/index.html'}];
 for(const ref of ['pages/details.html','./pages/%64etails.html?source=view#history'])assert.equal(generatedContentId(p,ref),'details');
 for(const ref of ['https://external.example/pages/details.html','/pages/details.html','../pages/details.html','other/pages/details.html','pages/missing.html','pages/custom.html','pages/details.html/child','pages/%2Fdetails.html','pages/%zz.html'])assert.equal(generatedContentId(p,ref),undefined,ref);
});

test('scene deletion prunes only its unused pages and preserves shared, chained, view-linked and unrelated legacy content',()=>{
 const p=fixture(),[deleted,kept]=p.scenes;
 p.pages=[page('private'),page('shared'),page('through-chain'),page('through-view'),page('legacy',[ 'pages/through-chain.html?from=old#story' ]),page('unrelated'),page('cycle-a',['pages/cycle-b.html']),page('cycle-b',['pages/cycle-a.html'])];
 deleted.hotspots=p.pages.filter(pg=>pg.id!=='legacy'&&pg.id!=='unrelated').map(pg=>bubble('b-'+pg.id,pg.id));kept.hotspots=[bubble('keep-shared','shared')];
 kept.viewpoints[0].extendedDescription={enabled:true,richText:richLink('./pages/%74hrough-view.html#story'),links:[]};
 const undo=structuredClone(p);deleteScene(p,'delete');
 assert.deepEqual(p.pages.map(pg=>pg.id),['shared','through-chain','through-view','legacy','unrelated']);assert.equal(p.startScene,'keep');
 assert.deepEqual(undo.pages.map(pg=>pg.id),['private','shared','through-chain','through-view','legacy','unrelated','cycle-a','cycle-b']);
 const unchanged=structuredClone(p);deleteScene(p,'missing');assert.deepEqual(p,unchanged);
});

test('removing a bubble preserves content referenced by a remaining structured page or viewpoint',()=>{
 const p=fixture(),s=p.scenes[0];p.pages=[page('first'),page('second')];p.pages[1].blocks=[{type:'text',text:'',url:'',richText:richLink('pages/first.html?origin=second')}];s.hotspots=[bubble('first','first'),bubble('second','second')];
 removeBubble(p,s.id,'first');assert.deepEqual(p.pages.map(pg=>pg.id),['first','second']);assert.deepEqual(usedContent(p).map(pg=>pg.id),['first','second']);
 removeBubble(p,s.id,'second');assert.deepEqual(p.pages.map(pg=>pg.id),['first'],'unrelated legacy content is not deleted as a side effect');
 s.viewpoints[0].extendedDescription={enabled:true,richText:richLink('pages/first.html'),links:[]};s.hotspots=[bubble('again','first')];removeBubble(p,s.id,'again');assert.equal(p.pages[0].id,'first');
});

test('cleanup conservatively retains candidates when remaining custom HTML could refer to them',()=>{
 for(const source of ['custom-page','block-link','block-embed','view-link']){
  const p=fixture(),[deleted,kept]=p.scenes;p.pages=[page('candidate'),page('retained')];deleted.hotspots=[bubble('candidate','candidate')];kept.hotspots=[bubble('retained','retained')];
  if(source==='custom-page')p.pages[1].html='imports/custom/index.html';
  if(source==='block-link'||source==='block-embed')p.pages[1].blocks=[{type:source==='block-link'?'link':'embed',text:'Details',url:'imports/custom/index.htm?from=view#story'}];
  if(source==='view-link')kept.viewpoints[0].extendedDescription={enabled:true,richText:richLink('imports/custom/index.html'),links:[]};
  deleteScene(p,'delete');assert.deepEqual(p.pages.map(pg=>pg.id),['candidate','retained'],source);
 }
});

test('active content follows generated-page chains and cycles without treating custom HTML scripts as actions',()=>{
 const p=fixture(),s=p.scenes[0];p.pages=[page('view-root',['pages/next.html?x=1#part']),page('next',['pages/view-root.html']),page('unused'),{...page('custom',['pages/unused.html']),html:'custom/index.html'}];
 s.viewpoints[0].extendedDescription={enabled:true,richText:richLink('pages/view-root.html'),links:[]};s.hotspots=[bubble('html','custom')];
 assert.deepEqual(usedContent(p).map(pg=>pg.id),['view-root','next','custom']);
 const refs=allReferences(p);assert.ok(refs.includes('custom/index.html'));assert.ok(!refs.some(ref=>ref.startsWith('pages/')),'generated pages are not missing project-disk assets');
});

test('portable and referenced export generate view-only page chains, retain URL suffixes and copy their media',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'perspectives-content-export-'));
 try{
  const projectRoot=path.join(root,'project'),dist=path.join(root,'dist');for(const dir of [projectRoot,path.join(dist,'assets'),path.join(dist,'licenses')])await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dist,'index.html'),'fixture');await fs.writeFile(path.join(projectRoot,'scene.rad'),radFixture().rad);await fs.writeFile(path.join(projectRoot,'photo.jpg'),'original photo');
  const p=fixture();p.pages=[page('history',['./pages/%64etails.html?from=view#photo']),{...page('details'),blocks:[{type:'image',text:'Historic view',url:'photo.jpg'},{type:'embed',text:'Return',url:'pages/history.html#return'}]},page('unused')];
  p.scenes[0].viewpoints[0].extendedDescription={enabled:true,richText:richLink('pages/history.html?entry=1#top'),links:[]};const original=structuredClone(p);
  for(const portable of [true,false]){
   const destination=path.join(root,String(portable));await exportTour({project:p,hosting:{assetBaseUrl:'./',sceneUrls:{}},projectRoot,sources:{},destination,dist,portable,omitSplats:false,websiteOnly:true});
   const saved=ProjectSchema.parse(JSON.parse(await fs.readFile(path.join(destination,'config/tour.json'),'utf8')));assert.deepEqual(saved.pages.map(pg=>pg.id),['history','details']);
   assert.equal(saved.pages[0].blocks[0].url,'./pages/%64etails.html?from=view#photo');assert.match(await fs.readFile(path.join(destination,'pages/history.html'),'utf8'),/\.\.\/\.\/pages\/%64etails\.html\?from=view#photo/);
   await fs.access(path.join(destination,'pages/details.html'));assert.equal(await fs.readFile(path.join(destination,'photo.jpg'),'utf8'),'original photo');await assert.rejects(fs.access(path.join(destination,'pages/unused.html')));
  }
  assert.deepEqual(p,original);assert.equal(await fs.readFile(path.join(projectRoot,'photo.jpg'),'utf8'),'original photo');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
