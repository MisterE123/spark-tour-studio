import test from 'node:test';import assert from 'node:assert/strict';
import {BrandingSchema,resolveBranding,brandingReferences,STUDIO_NAME,STUDIO_URL,STUDIO_CREDIT} from '../shared/branding.mjs';
import {blankProject,newScene,ProjectSchema,allReferences} from '../shared/project.mjs';
import {createRecovery,parseRecovery} from '../shared/recovery.mjs';

function fixture(){const p=blankProject();p.title='The historic grounds';p.description='A tour of the grounds';p.cover='media/cover.jpg';p.scenes=[newScene('grounds','Grounds','scene.rad')];p.startScene='grounds';return p;}

test('old projects retain their own identity with optional studio credit enabled by default',()=>{
 const project=fixture(),saved=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));assert.equal(saved.branding,undefined);
 assert.deepEqual(resolveBranding(saved),{name:'',website:'',logo:'',favicon:'',tabTitle:project.title,metaDescription:project.description,socialImage:project.cover,publicUrl:'',footer:'',themeColor:'',showStudioCredit:true});
 assert.equal(resolveBranding().tabTitle,'Virtual tour');assert.equal(STUDIO_NAME,'3DGS Perspectives Studio');assert.equal(STUDIO_URL,'https://studio.chesapeakeperspectives.com/');assert.equal(STUDIO_CREDIT,'made with 3DGS Perspectives Studio');
});

test('all branding fields and an explicitly disabled studio credit survive project and recovery round trips',()=>{
 const project=fixture();project.branding={name:'Chesapeake history',website:'https://author.example/about',logo:'media/author logo.svg',favicon:'media/favicon.png',tabTitle:'Historic grounds | Chesapeake',metaDescription:'A locally authored tour',socialImage:'media/share.jpg',publicUrl:'https://tours.example/grounds/',footer:'Copyright 2026\nAuthor supplied text',themeColor:'#1234Ab',showStudioCredit:false};
 const before=structuredClone(project),saved=ProjectSchema.parse(JSON.parse(JSON.stringify(project)));assert.deepEqual(saved.branding,before.branding);assert.equal(resolveBranding(saved).showStudioCredit,false);
 const hosting={assetBaseUrl:'./',sceneUrls:{}},recovered=parseRecovery(JSON.parse(JSON.stringify(createRecovery(saved,hosting))),hosting);assert.deepEqual(recovered.project.branding,before.branding);assert.deepEqual(project,before);
 saved.branding.showStudioCredit=true;assert.equal(resolveBranding(saved).showStudioCredit,true);delete saved.branding.showStudioCredit;assert.equal(resolveBranding(saved).showStudioCredit,true);
});

test('blank optional overrides fall back to the tour without replacing its authored identity or interpreting text',()=>{
 const project=fixture();project.branding={name:'  Museum & <History>  ',website:' https://author.example/ ',tabTitle:'  ',metaDescription:'\n ',logo:'',favicon:'',socialImage:'',publicUrl:'',footer:'<script>literal text</script>',themeColor:'',showStudioCredit:false};
 const resolved=resolveBranding(ProjectSchema.parse(project));assert.equal(resolved.name,'Museum & <History>');assert.equal(resolved.website,'https://author.example/');assert.equal(resolved.tabTitle,project.title);assert.equal(resolved.metaDescription,project.description);assert.equal(resolved.socialImage,project.cover);assert.equal(resolved.footer,'<script>literal text</script>');assert.equal(resolved.showStudioCredit,false);assert.equal(project.branding.name,'  Museum & <History>  ');
});

test('branding accepts bounded prose, local media and HTTP(S) assets while rejecting unsafe or invalid fields',()=>{
 assert.equal(BrandingSchema.safeParse({}).success,true);assert.equal(BrandingSchema.safeParse({name:'<b>Literal</b>',website:'http://author.example/',publicUrl:'https://example.org/tour/',logo:'media/logo.svg',favicon:'https://cdn.example/favicon.ico',socialImage:'media/share image.png',showStudioCredit:false}).success,true);
 for(const field of ['website','publicUrl'])for(const value of ['javascript:alert(1)','data:text/html,hello','file:///C:/private','//example.org','relative/page'])assert.equal(BrandingSchema.safeParse({[field]:value}).success,false,field+' '+value);
 for(const field of ['logo','favicon','socialImage'])for(const value of ['../private.png','media/../private.png','/absolute.png','C:\\private.png','data:image/png;base64,AAAA','javascript:alert(1)'])assert.equal(BrandingSchema.safeParse({[field]:value}).success,false,field+' '+value);
 for(const [field,value]of [['name','x'.repeat(201)],['tabTitle','x'.repeat(301)],['metaDescription','x'.repeat(4001)],['footer','x'.repeat(4001)],['themeColor','#fff'],['themeColor','red'],['showStudioCredit','false']])assert.equal(BrandingSchema.safeParse({[field]:value}).success,false,field);
});

test('branding media participates in project asset tracking while author and canonical links remain ordinary website links',()=>{
 const project=fixture();project.branding={logo:'media/logo.svg',favicon:'media/icon.ico',socialImage:'https://media.example/share.png',website:'https://author.example/',publicUrl:'https://tours.example/grounds/',footer:'Read https://history.example/'};
 const expected=['media/logo.svg','media/icon.ico','https://media.example/share.png'];assert.deepEqual(brandingReferences(project),expected);const refs=allReferences(project,{assetBaseUrl:'https://splats.example/captures/',sceneUrls:{}});for(const ref of expected)assert.ok(refs.includes(ref),ref);for(const ref of [project.branding.website,project.branding.publicUrl,'https://history.example/'])assert.ok(!refs.includes(ref),ref);assert.ok(!refs.some(ref=>ref.includes('splats.example')&&/logo|icon|share/.test(ref)));
});
