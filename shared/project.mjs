import {normalizeBubbleContent,usedContent} from './authoring.mjs';
import {BubbleSettingsSchema} from './bubbles.mjs';
import { z } from 'zod';
import {ViewControlsSchema} from './viewpoints.mjs';
import {PerformanceLibrarySchema} from './performance.mjs';
import {RichTextSchema,richTextReferences,renderRichText,resolveRichReference} from './rich-text.mjs';
const finite = z.number().finite();
const vec = z.tuple([finite, finite, finite]);
const transform = z.object({ position: vec, rotation: vec, scale: finite.positive() });
const ref = z.string().refine(s => !s || ((!/^[a-z][a-z0-9+.-]*:/i.test(s)||/^https?:\/\//i.test(s)) && !s.startsWith('/') && !s.includes('\\') && !s.split('/').includes('..')), 'Use a relative asset path or HTTP(S) URL');
const id = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, digits, underscores or hyphens');
const mode = z.enum(['jumps','fly','explore']);
const audio = z.object({source:ref,loop:z.boolean().default(false),volume:finite.min(0).max(1).default(1)});
const viewpoint = z.object({...ViewControlsSchema.shape, listed:z.boolean().optional(), description:z.string().max(4000).optional(), audio:audio.optional(), thumbnail:z.string().regex(/^data:image\/(?:jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/).max(300000).optional(), id, name:z.string(), position:vec, rotation:vec });
const typedViewpoint=viewpoint.refine(v=>v.type!=='orbit'||!!v.orbit,'Orbit views need orbit geometry').refine(v=>v.type!=='slider'||!!v.slider,'Slider views need plane geometry');
const block = z.object({ type:z.enum(['text','image','link','embed']), text:z.string(), url:ref, richText:RichTextSchema.optional() });
const page = z.object({ id, title:z.string(), html:ref, blocks:z.array(block) });
const hotspot = z.object({ createdAt:finite.int().min(0).optional(), size:finite.min(0).max(4).optional(), id, label:z.string(), position:vec, kind:z.enum(['page','scene','viewpoint']), target:z.string(), viewpoint:z.string().optional() });
const backgroundColor=z.string().regex(/^#[0-9a-f]{6}$/i);
export const BackgroundSchema=z.discriminatedUnion('type',[z.object({type:z.literal('solid'),color:backgroundColor,topColor:backgroundColor.optional(),bottomColor:backgroundColor.optional()}),z.object({type:z.literal('panorama'),source:ref,yawDegrees:finite.min(-360).max(360).default(0)}),z.object({type:z.literal('splat'),source:ref,transform})]);
const scene = z.object({ background:BackgroundSchema.optional(), walkHeight:finite.min(1).max(2.4).optional(), audio:audio.optional(), id, name:z.string(), source:ref, thumbnail:ref, thumbnailMode:z.enum(['starting-view','custom']).optional(), transform, collider:ref, colliderTransform:transform, modes:z.array(mode), entry:z.string(), walkStart:z.string(), viewpoints:z.array(typedViewpoint), hotspots:z.array(hotspot) });
export const ProjectSchema = z.object({ bubbles:BubbleSettingsSchema.optional(), performance:PerformanceLibrarySchema.optional(), version:z.literal(1), title:z.string().min(1), description:z.string(), cover:ref, startScene:z.string(), scenes:z.array(scene), pages:z.array(page) }).transform(normalizeBubbleContent);
export const HostingSchema = z.object({ assetBaseUrl:ref.default('./'), sceneUrls:z.record(z.string(),ref).default({}) });
export function identity(){return {position:[0,0,0],rotation:[0,0,0],scale:1};}
export function blankProject(){return {version:1,title:'Untitled tour',description:'A new perspective. A place to explore.',cover:'',startScene:'',scenes:[],pages:[]};}
export function newScene(id,name,source){return {id,name,source,thumbnail:'',transform:identity(),collider:'',colliderTransform:identity(),modes:['jumps','fly'],entry:'start',walkStart:'start',viewpoints:[{id:'start',name:'Starting view',position:[0,1.7,3],rotation:[0,0,0]}],hotspots:[]};}
export function validateProject(value){
 const parsed=ProjectSchema.safeParse(value); if(!parsed.success)return parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`);
 const p=parsed.data, errors=[];
 const unique=(items,label)=>{const ids=new Set();for(const x of items){if(ids.has(x.id))errors.push(`Duplicate ${label}: ${x.id}`);ids.add(x.id);}};
 unique(p.scenes,'scene');unique(p.pages,'page');
 if(!p.scenes.length)errors.push('Add at least one scene.');
 if(!p.scenes.some(s=>s.id===p.startScene))errors.push('Choose a valid starting scene.');
 for(const s of p.scenes){
  unique(s.viewpoints,`${s.name} viewpoint`);unique(s.hotspots,`${s.name} bubble`);
  if(!s.modes.length)errors.push(`${s.name}: enable at least one navigation mode.`);
  if(s.background&&s.background.type!=='solid'){if(!s.background.source)errors.push(`${s.name}: choose a background asset.`);if(s.background.type==='splat'&&s.background.source&&!/\.rad(?:[?#]|$)/i.test(s.background.source))errors.push(`${s.name}: background splat must be a .rad URL or file.`);}
  if(!s.source)errors.push(`${s.name}: choose a RAD source.`);
  if(s.source && !/\.rad(?:[?#]|$)/i.test(s.source))errors.push(`${s.name}: source must be a .rad URL or file.`);
  if(!s.viewpoints.some(v=>v.id===s.entry))errors.push(`${s.name}: missing entry viewpoint.`);
  if(s.modes.includes('explore')&&(!s.collider||!s.viewpoints.some(v=>v.id===s.walkStart)))errors.push(`${s.name}: Walk needs a collider and walking start.`);
  for(const h of s.hotspots){const targets=h.kind==='page'?p.pages:h.kind==='scene'?p.scenes:s.viewpoints;if(!targets.some(t=>t.id===h.target))errors.push(`${s.name}: bubble “${h.label}” ${h.kind==='page'?'is missing its content':`has a broken ${h.kind==='scene'?'scene':'viewpoint'} link`}.`);if(h.kind==='scene'&&h.viewpoint&&!p.scenes.find(t=>t.id===h.target)?.viewpoints.some(v=>v.id===h.viewpoint))errors.push(`${s.name}: destination viewpoint is missing.`);}
 }
 return errors;
}
export function assetUrl(ref,base){return new URL(ref,base).href;}
export function sceneUrl(scene,hosting,base){const override=hosting.sceneUrls?.[scene.id];return override?new URL(override,base).href:new URL(scene.source,new URL(hosting.assetBaseUrl||'./',base)).href;}
// Resolve splat delivery exactly as the viewer does, independently of app/media URLs.
export function splatReference(source,hosting={},override=false){if(!source)return '';const root='https://spark-tour.local/';const url=new URL(source,override?root:new URL(hosting.assetBaseUrl||'./',root));return url.origin===new URL(root).origin?decodeURIComponent(url.pathname.slice(1)):url.href;}
export function allReferences(p,hosting={}){return [p.cover,...p.scenes.flatMap(s=>[splatReference(hosting.sceneUrls?.[s.id]||s.source,hosting,!!hosting.sceneUrls?.[s.id]),s.background?.type==='splat'?splatReference(s.background.source,hosting):s.background?.type==='panorama'?s.background.source:'',s.collider,s.thumbnailMode==='starting-view'?'':s.thumbnail,s.audio?.source,...s.viewpoints.map(v=>v.audio?.source)]),...usedContent(p).flatMap(pg=>pg.html?[pg.html]:pg.blocks.flatMap(b=>b.type==='text'?(b.richText?richTextReferences(b.richText).filter(r=>r.kind==='image'||(!/^https?:/i.test(r.ref)&&!r.ref.startsWith('#'))).map(r=>r.ref):[]):b.type==='image'||!/^https?:/i.test(b.url)?[b.url]:[]))].filter(Boolean);}
export function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function renderPage(page){
 const esc=escapeHtml;
 return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(page.title)}</title><style>body{font:18px/1.65 system-ui;background:#f7f9fb;color:#263b46;padding:24px;max-width:850px;margin:auto}h1,h2,h3{line-height:1.2}figure{margin:1em 0}img,iframe{width:100%;border:0;border-radius:12px}iframe{height:400px}a{color:#426e8a}p{white-space:pre-wrap}blockquote{border-left:3px solid currentColor;margin:1em 0;padding-left:1em}code{font-size:.9em}</style><h1>${esc(page.title)}</h1>${page.blocks.map(b=>b.type==='text'?(b.richText?renderRichText(b.richText,'../'):`<p>${esc(b.text)}</p>`):b.type==='image'?`<figure><img src="${esc(resolveRichReference(b.url,'../'))}" alt="${esc(b.text)}"><figcaption>${esc(b.text)}</figcaption></figure>`:b.type==='link'?`<p><a target="_blank" rel="noopener noreferrer" href="${esc(resolveRichReference(b.url,'../'))}">${esc(b.text||b.url)}</a></p>`:`<iframe title="${esc(b.text||'Embedded content')}" src="${esc(resolveRichReference(b.url,'../'))}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups" allow="fullscreen"></iframe>`).join('')}</html>`;
}
