import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createRequire} from 'node:module';
import {blankProject,newScene} from '../shared/project.mjs';
import {radFixture} from './fixtures.mjs';
const require=createRequire(import.meta.url),{collectTourFiles}=require('../desktop/tour-files.cjs'),{assetReference}=require('../desktop/asset-paths.cjs'),gitTools=require('../desktop/git.cjs');
const richLink=href=>({version:1,doc:{type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Read the history',marks:[{type:'link',attrs:{href}}]}]}]}});
const page=id=>({id,title:id,html:'',blocks:[]});
const filename='Story #100%20 東.html',photo='Photo #1.png';
async function fixture(){
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'perspectives HTML inventory ')),root=path.join(base,'project'),external=path.join(base,'original story');
 for(const dir of [path.join(root,'config'),path.join(external,'assets'),path.join(external,'.git')])await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(root,'scene.rad'),radFixture().rad);await fs.writeFile(path.join(external,filename),'<link rel="stylesheet" href="style.css"><img src="assets/'+assetReference(photo)+'"><a href="../../pages/details.html">Details</a>');await fs.writeFile(path.join(external,'style.css'),'body{color:navy}');await fs.writeFile(path.join(external,'assets',photo),'original photograph');await fs.writeFile(path.join(external,'.env'),'private environment');await fs.writeFile(path.join(external,'.git/config'),'private Git config');await fs.writeFile(path.join(external,'private.pem'),'private key');
 const project=blankProject(),scene=newScene('a','History','scene.rad');project.scenes=[scene];project.startScene='a';project.pages=[page('story'),page('details')];scene.hotspots=[{id:'story',label:'Story',position:[0,1,0],kind:'page',target:'story'}];
 return {base,root,external,project,scene,hosting:{assetBaseUrl:'./',sceneUrls:{}},sources:{'imports/story':{dir:external,kind:'html'}},reference:'imports/story/'+assetReference(filename)+'?version=2#history'};
}
function useHtml(f,kind,reference=f.reference){
 const story=f.project.pages[0];if(kind==='custom-page')story.html=' '+reference+' ';else if(kind==='view-link')f.scene.viewpoints[0].extendedDescription={enabled:true,richText:richLink(reference),links:[]};else if(kind==='rich-link')story.blocks=[{type:'text',text:'History',url:'',richText:richLink(reference)}];else story.blocks=[{type:kind==='block-link'?'link':'embed',text:'History',url:' '+reference+' '}];
 // Predictable generated pages do not become missing on-disk HTML files.
 f.scene.viewpoints[0].extendedDescription??={enabled:true,richText:richLink('./pages/%64etails.html?from=view#history'),links:[]};
}

test('inventories include sibling assets for local HTML bubble pages, links, embeds and rich view descriptions',async()=>{
 for(const kind of ['custom-page','block-link','block-embed','rich-link','view-link']){
  const f=await fixture();try{
   useHtml(f,kind);const original=structuredClone(f.sources),project=structuredClone(f.project);
   for(const resolveHosting of [false,true]){
    const inventory=await collectTourFiles({projectRoot:f.root,...f,resolveHosting});assert.deepEqual(inventory.missing,[],kind);assert.deepEqual(inventory.files.map(file=>file.path).sort(),['imports/story/'+filename,'imports/story/assets/'+photo,'imports/story/style.css','scene.rad'].sort(),kind);assert.deepEqual(inventory.prefixes,['imports/story']);assert.ok(!inventory.files.some(file=>file.path.startsWith('pages/')));
   }
   assert.deepEqual(f.sources,original);assert.deepEqual(f.project,project);assert.equal(await fs.readFile(path.join(f.external,'assets',photo),'utf8'),'original photograph');
  }finally{await fs.rm(f.base,{recursive:true,force:true});}
 }
});

test('structured-only, remote and unreachable HTML do not pull unrelated directories into file inventory',async()=>{
 const f=await fixture();try{
  f.project.pages[0].blocks=[{type:'text',text:'Details',url:'',richText:richLink('pages/details.html#history')},{type:'link',text:'Remote document',url:'https://example.test/story/index.html'}];f.project.pages.push({...page('unused'),html:f.reference});
  const inventory=await collectTourFiles({projectRoot:f.root,...f});assert.deepEqual(inventory.missing,[]);assert.deepEqual(inventory.files.map(file=>file.path),['scene.rad']);assert.deepEqual(inventory.prefixes,[]);assert.deepEqual(f.sources,{'imports/story':{dir:f.external,kind:'html'}});
 }finally{await fs.rm(f.base,{recursive:true,force:true});}
});

test('content-link HTML directories retain private-file and symlink protections',async t=>{
 const f=await fixture();try{
  useHtml(f,'rich-link');const outside=path.join(f.base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.txt'),'outside');
  try{await fs.symlink(outside,path.join(f.external,'linked'),process.platform==='win32'?'junction':'dir');}catch(error){if(['EPERM','EACCES'].includes(error.code)){t.diagnostic('Symlink privilege unavailable; private-file exclusions checked in the inventory regression.');return;}throw error;}
  const inventory=await collectTourFiles({projectRoot:f.root,...f});assert.ok(inventory.missing.some(message=>message.includes('symbolic link')),inventory.missing.join('\n'));assert.ok(!inventory.files.some(file=>/secret|\.env|\.git|private\.pem/.test(file.path)));
 }finally{await fs.rm(f.base,{recursive:true,force:true});}
});

test('saving actual Git history materializes linked HTML assets and clones without external source mappings',async()=>{
 const f=await fixture();try{
  useHtml(f,'view-link');const original=structuredClone(f.sources),git=await gitTools.findGit();assert.ok(git,'Git is required for the real history check');
  const options={...f,git,author:{name:'History fixture',email:'history@example.test'}};await gitTools.enableHistory(options);const saved=await gitTools.saveVersion({...options,message:'History with linked HTML'});assert.ok(saved.id);assert.deepEqual(saved.sources,{});assert.deepEqual(f.sources,original,'The authoring source registry is not mutated by inventory collection');
  assert.equal(await fs.readFile(path.join(f.root,'imports/story/style.css'),'utf8'),'body{color:navy}');assert.equal(await fs.readFile(path.join(f.root,'imports/story/assets',photo),'utf8'),'original photograph');assert.equal(await fs.readFile(path.join(f.external,'style.css'),'utf8'),'body{color:navy}');
  const clone=path.join(f.base,'clone');await gitTools.runGit(git.executable,null,['clone','--no-hardlinks',f.root,clone]);await fs.rm(f.external,{recursive:true});const inventory=await collectTourFiles({projectRoot:clone,project:f.project,hosting:f.hosting,sources:{}});assert.deepEqual(inventory.missing,[]);assert.ok(inventory.files.some(file=>file.path==='imports/story/style.css'));assert.ok(inventory.files.some(file=>file.path==='imports/story/assets/'+photo));assert.equal(await fs.readFile(path.join(clone,'imports/story/assets',photo),'utf8'),'original photograph');
 }finally{await fs.rm(f.base,{recursive:true,force:true});}
});
