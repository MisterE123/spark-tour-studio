import {z} from 'zod';

// Authored rich text is a small, versioned document, never stored HTML. The same
// bounded schema and renderer run in the editor, exported pages and viewer.
export function safeContentReference(value){
 if(typeof value!=='string'||!value||value.length>4096||/[\u0000-\u001f\\]/.test(value))return false;
 if(/^https?:\/\//i.test(value)){try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}}
 if(/^[a-z][a-z0-9+.-]*:/i.test(value)||value.startsWith('/'))return false;
 try{const decoded=decodeURIComponent(value.split(/[?#]/)[0]);return !decoded.includes('\\')&&!decoded.startsWith('/')&&!decoded.split('/').includes('..');}catch{return false;}
}
const reference=z.string().refine(safeContentReference,'Use a relative asset path or HTTP(S) URL');
const mark=z.discriminatedUnion('type',[
 ...['bold','italic','underline','strike','code'].map(type=>z.object({type:z.literal(type)})),
 z.object({type:z.literal('link'),attrs:z.object({href:reference})})
]);
const inlineTypes=new Set(['text','hardBreak']);
const blockTypes=new Set(['paragraph','heading','blockquote','bulletList','orderedList','image','horizontalRule']);
const node=z.lazy(()=>z.object({
 type:z.enum(['doc','paragraph','heading','blockquote','bulletList','orderedList','listItem','text','hardBreak','image','horizontalRule']),
 attrs:z.object({level:z.number().int().min(1).max(3).optional(),start:z.number().int().min(1).max(100000).optional(),src:reference.optional(),alt:z.string().max(4000).nullable().optional(),title:z.string().max(4000).nullable().optional()}).optional(),
 text:z.string().max(120000).optional(),marks:z.array(mark).max(8).optional(),content:z.array(node).max(6000).optional()
}).superRefine((n,ctx)=>{
 const children=n.content||[],fail=message=>ctx.addIssue({code:'custom',message});
 if(n.type==='heading'&&!n.attrs?.level)fail('Heading level is required');
 if(n.type==='image'&&!n.attrs?.src)fail('Image source is required');
 if(n.type==='text'&&(typeof n.text!=='string'||children.length))fail('Text nodes need text and cannot contain nodes');
 if(['text','hardBreak','image','horizontalRule'].includes(n.type)&&children.length)fail('This node cannot contain nodes');
 if(['paragraph','heading'].includes(n.type)&&children.some(c=>!inlineTypes.has(c.type)))fail('Paragraphs and headings contain text');
 if(['doc','blockquote','listItem'].includes(n.type)&&children.some(c=>!blockTypes.has(c.type)))fail('Invalid block content');
 if(['bulletList','orderedList'].includes(n.type)&&children.some(c=>c.type!=='listItem'))fail('Lists contain list items');
 if(n.type!=='text'&&(n.text!==undefined||n.marks?.length))fail('Marks belong to text nodes');
}).transform(n=>{
 const clean={type:n.type};if(n.type==='text'){clean.text=n.text;if(n.marks?.length)clean.marks=n.marks;}
 if(n.type==='heading')clean.attrs={level:n.attrs.level};
 if(n.type==='orderedList'&&n.attrs?.start)clean.attrs={start:n.attrs.start};
 if(n.type==='image')clean.attrs={src:n.attrs.src,alt:n.attrs.alt||'',title:n.attrs.title||''};
 if(!['text','hardBreak','image','horizontalRule'].includes(n.type))clean.content=n.content||[];
 return clean;
}));
export const RichTextSchema=z.object({version:z.literal(1),doc:z.unknown()}).superRefine((value,ctx)=>{
 // Bound the raw tree before recursive validation so malformed files cannot
 // overflow the stack or make the authoring interface unresponsive.
 let count=0,chars=0;const pending=[{node:value.doc,depth:0}];while(pending.length){const item=pending.pop(),n=item.node;if(++count>6000||item.depth>16){ctx.addIssue({code:'custom',message:'Rich text exceeds its node or nesting limit'});return;}if(!n||typeof n!=='object'||Array.isArray(n)){ctx.addIssue({code:'custom',message:'Invalid rich text node'});return;}if(typeof n.text==='string')chars+=n.text.length;if(chars>120000){ctx.addIssue({code:'custom',message:'Rich text exceeds its text limit'});return;}if(Array.isArray(n.content))for(const child of n.content)pending.push({node:child,depth:item.depth+1});}
 const parsed=node.safeParse(value.doc);if(!parsed.success){for(const issue of parsed.error.issues)ctx.addIssue({...issue,path:['doc',...issue.path]});return;}if(parsed.data.type!=='doc')ctx.addIssue({code:'custom',message:'Rich text must have a document root'});
}).transform(value=>({version:1,doc:node.parse(value.doc)}));

export function plainTextDocument(text=''){
 const lines=String(text).split('\n'),content=[];for(let i=0;i<lines.length;i++){if(i)content.push({type:'hardBreak'});if(lines[i])content.push({type:'text',text:lines[i]});}
 return {version:1,doc:{type:'doc',content:[{type:'paragraph',content}]}};
}
export function richTextForBlock(block){return block.richText||plainTextDocument(block.text||'');}
function inlineText(node){if(node.type==='text')return node.text||'';if(node.type==='hardBreak')return '\n';return (node.content||[]).map(inlineText).join('');}
export function richTextPlainText(value){const text=[];const walk=n=>{if(n.type==='paragraph'||n.type==='heading'){text.push(inlineText(n));return;}if(n.type==='image'){if(n.attrs?.alt)text.push(n.attrs.alt);return;}for(const c of n.content||[])walk(c);};walk(value.doc);return text.join('\n');}

// XR uses deliberate text/list/heading summaries and individual selectable
// links/images rather than attempting to rasterize arbitrary page HTML.
export function richTextToBlocks(value){
 const out=[],linkKeys=new Set();const links=n=>{for(const m of n.marks||[])if(m.type==='link'&&safeContentReference(m.attrs?.href)){const key=m.attrs.href+'\n'+inlineText(n);if(!linkKeys.has(key)){out.push({type:'link',text:inlineText(n)||m.attrs.href,url:m.attrs.href});linkKeys.add(key);}}for(const c of n.content||[])links(c);};
 const walk=(n,prefix='')=>{
  if(n.type==='image'){out.push({type:'image',text:n.attrs?.alt||n.attrs?.title||'',url:n.attrs?.src||''});return;}
  if(n.type==='paragraph'||n.type==='heading'){const text=prefix+inlineText(n);if(text)out.push({type:'text',text,url:''});links(n);return;}
  if(n.type==='horizontalRule')return;
  if(n.type==='bulletList'||n.type==='orderedList'){let i=n.attrs?.start||1;for(const item of n.content||[])walk(item,n.type==='bulletList'?'• ':`${i++}. `);return;}
  const children=n.content||[];for(let i=0;i<children.length;i++)walk(children[i],i===0?prefix:'');
 };walk(value.doc);return out;
}
export function richTextReferences(value){const out=[];const walk=n=>{if(n.type==='image'&&n.attrs?.src)out.push({ref:n.attrs.src,kind:'image'});for(const m of n.marks||[])if(m.type==='link'&&m.attrs?.href)out.push({ref:m.attrs.href,kind:'link'});for(const c of n.content||[])walk(c);};walk(value.doc);return out;}
export async function mapRichTextReferences(value,map){const copy=structuredClone(value);const walk=async n=>{if(n.type==='image'&&n.attrs?.src)n.attrs.src=await map(n.attrs.src,'image');for(const m of n.marks||[])if(m.type==='link'&&m.attrs?.href)m.attrs.href=await map(m.attrs.href,'link');for(const c of n.content||[])await walk(c);};await walk(copy.doc);return copy;}
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function resolveRichReference(value,base=''){
 if(!safeContentReference(value))return '';if(/^https?:\/\//i.test(value)||value.startsWith('#'))return value;
 try{return base?new URL(value,base).href:value;}catch{return base+value;}
}
export function renderRichText(value,base=''){
 const parsed=RichTextSchema.safeParse(value);if(!parsed.success)return '';
 const render=n=>{
  if(n.type==='text'){let html=esc(n.text||'');for(const m of n.marks||[]){const tag={bold:'strong',italic:'em',underline:'u',strike:'s',code:'code'}[m.type];if(tag)html=`<${tag}>${html}</${tag}>`;else if(m.type==='link')html=`<a href="${esc(resolveRichReference(m.attrs.href,base))}" target="_blank" rel="noopener noreferrer">${html}</a>`;}return html;}
  if(n.type==='hardBreak')return '<br>';
  if(n.type==='image')return `<figure><img src="${esc(resolveRichReference(n.attrs.src,base))}" alt="${esc(n.attrs.alt||'')}" title="${esc(n.attrs.title||'')}" loading="lazy"></figure>`;
  if(n.type==='horizontalRule')return '<hr>';
  const html=(n.content||[]).map(render).join('');if(n.type==='doc')return html;const tag={paragraph:'p',heading:'h'+n.attrs?.level,blockquote:'blockquote',bulletList:'ul',orderedList:'ol',listItem:'li'}[n.type];return tag?`<${tag}${n.type==='orderedList'&&n.attrs?.start?` start="${n.attrs.start}"`:''}>${html}</${tag}>`:html;
 };return render(parsed.data.doc);
}
