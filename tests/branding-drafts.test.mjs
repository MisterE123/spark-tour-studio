import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
import {normalizeBrandingWebUrl} from '../shared/branding-url.mjs';
import {BrandingSchema,resolveBranding,brandingUrlIssue,validateBrandingUrls} from '../shared/branding.mjs';
import {blankProject,newScene,ProjectSchema,validateProject} from '../shared/project.mjs';import {createRecovery,parseRecovery} from '../shared/recovery.mjs';import {radFixture} from './fixtures.mjs';
const require=createRequire(import.meta.url),desktopBranding=require('../desktop/branding.cjs');
function fixture(){const project=blankProject();project.title='Draft branding';project.description='A saved tour';project.scenes=[newScene('grounds','Grounds','main.rad')];project.startScene='grounds';return project;}
const drafts=['https://','www.','museum','not a website','javascript:alert(1)','data:text/html,<svg onload=alert(1)>','file:///C:/private','//example.org','example.org:99999','https://user:password@example.org/'];

test('complete web URLs and common bare addresses normalize safely without changing stored draft text',()=>{
 for(const [value,expected]of [
  ['museum.example','https://museum.example/'],['www.museum.example/visit?year=1900#history','https://www.museum.example/visit?year=1900#history'],['  MUSEUM.EXAMPLE/Visit  ','https://museum.example/Visit'],
  ['münich.example/history','https://xn--mnich-kva.example/history'],['localhost:8443/tour/','https://localhost:8443/tour/'],['192.168.1.20:8443/tour/','https://192.168.1.20:8443/tour/'],['http://127.0.0.1:8080/','http://127.0.0.1:8080/'],['HTTPS://MUSEUM.EXAMPLE:443/Visit','https://museum.example/Visit']
 ]){assert.equal(normalizeBrandingWebUrl(value),expected,value);assert.equal(brandingUrlIssue(value),'',value);const stored=BrandingSchema.parse({website:value,publicUrl:value});assert.equal(stored.website,value.trim());assert.equal(stored.publicUrl,value.trim());}
 assert.equal(normalizeBrandingWebUrl(), '');assert.equal(normalizeBrandingWebUrl(''), '');assert.equal(brandingUrlIssue(' '),'');
});

test('in-progress and invalid branding URL drafts survive project saves and autosave recovery',()=>{
 for(const value of drafts){const project=fixture();project.branding={name:'Author',website:' '+value+' ',publicUrl:value,showStudioCredit:false};const before=structuredClone(project),saved=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));assert.equal(saved.branding.website,value);assert.equal(saved.branding.publicUrl,value);const recovery=parseRecovery(JSON.parse(JSON.stringify(createRecovery(saved,{assetBaseUrl:'./',sceneUrls:{}}))));assert.equal(recovery.project.branding.website,value);assert.equal(recovery.project.branding.publicUrl,value);assert.equal(recovery.project.branding.showStudioCredit,false);assert.deepEqual(project,before);}
 for(const value of [null,5,false,{},'x'.repeat(8193)])assert.equal(BrandingSchema.safeParse({website:value}).success,false,'draft storage remains bounded and typed');
});

test('invalid, unsafe and incomplete addresses never become clickable website or canonical links',()=>{
 for(const value of [...drafts,'https://example.org\\evil','https://museum.example/\nsecret','https://user@example.org/','999.1.2.3','bad_host.example']){
  assert.equal(normalizeBrandingWebUrl(value),'',value);const project=fixture();project.branding={name:'Author',website:value,publicUrl:value};const resolved=resolveBranding(project);assert.equal(resolved.website,'',value);assert.equal(resolved.publicUrl,'',value);const native=desktopBranding.tourBranding(project);assert.equal(native.website,'',value);assert.equal(native.publicUrl,'',value);assert.ok(!desktopBranding.launcherIdentity(native).includes('href='),value);assert.ok(!desktopBranding.brandIndexHtml('<html><head></head><body></body></html>',project).includes('rel="canonical"'),value);
 }
});

test('publication validation gives field-specific errors without making drafts unreadable or blocking valid bare domains',()=>{
 const project=fixture();project.branding={website:'https://',publicUrl:'javascript:alert(1)'};assert.equal(ProjectSchema.safeParse(project).success,true);const errors=validateBrandingUrls(project.branding);assert.equal(errors.length,2);assert.ok(errors.some(error=>/Brand website/i.test(error)));assert.ok(errors.some(error=>/Public tour URL/i.test(error)));assert.ok(errors.every(error=>!/Zod|\[object Object\]/.test(error)));const projectErrors=validateProject(project);for(const error of errors)assert.ok(projectErrors.includes(error));assert.ok(brandingUrlIssue('https://').length>0);
 project.branding={website:'www.museum.example',publicUrl:'tours.museum.example/grounds/'};assert.deepEqual(validateBrandingUrls(project.branding),[]);assert.deepEqual(validateProject(project),[]);assert.equal(resolveBranding(project).website,'https://www.museum.example/');assert.equal(desktopBranding.tourBranding(project).publicUrl,'https://tours.museum.example/grounds/');
});

test('export refuses invalid drafts before writing output, then exports bare addresses with safe metadata and preserved author input',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'branding-draft-export-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const project=fixture(),projectRoot=path.join(root,'project'),dist=path.join(root,'dist'),destination=path.join(root,'site'),launcher=path.join(root,'launcher.exe'),{exportTour}=require('../desktop/export.cjs');await fs.mkdir(projectRoot);await fs.mkdir(path.join(dist,'assets'),{recursive:true});await fs.mkdir(path.join(dist,'licenses'));await fs.writeFile(path.join(dist,'index.html'),'<html><head><title>Virtual tour</title></head><body>Fixture</body></html>');await fs.writeFile(launcher,'fixture launcher');await fs.writeFile(path.join(projectRoot,'main.rad'),radFixture().rad);
 project.branding={website:'javascript:alert(1)',publicUrl:'https://'};const options={project,hosting:{assetBaseUrl:'./',sceneUrls:{}},projectRoot,sources:{},destination,dist,launcher,portable:true,omitSplats:false};await assert.rejects(exportTour(options),error=>/Brand website/.test(error.message)&&/Public tour URL/.test(error.message)&&!/Zod/.test(error.message));await assert.rejects(fs.access(destination));
 project.branding={name:'Museum',website:'www.museum.example/history',publicUrl:'tours.museum.example/grounds/',showStudioCredit:false};const before=structuredClone(project);await exportTour(options);const saved=JSON.parse(await fs.readFile(path.join(destination,'config/tour.json'),'utf8')),html=await fs.readFile(path.join(destination,'index.html'),'utf8');assert.deepEqual(saved.branding,before.branding);assert.deepEqual(project,before);assert.ok(html.includes('href="https://tours.museum.example/grounds/"'));assert.ok(desktopBranding.launcherIdentity(desktopBranding.tourBranding(saved)).includes('href="https://www.museum.example/history"'));assert.deepEqual(validateProject(saved),[]);
});
