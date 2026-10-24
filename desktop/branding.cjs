const fs=require('node:fs/promises'),path=require('node:path');
const studioCreditUrl='https://studio.chesapeakeperspectives.com/';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const text=value=>typeof value==='string'?value.trim():'';
function safeUrl(value,{absolute=false}={}){value=text(value);if(!value||/[\u0000-\u001f\u007f]/.test(value)||value.includes('\\'))return '';try{const url=new URL(value,'https://tour.local/');if(!['http:','https:'].includes(url.protocol))return '';if(absolute&&!/^https?:\/\//i.test(value))return '';return value;}catch{return '';}}
function tourBranding(project={}){const b=project.branding&&typeof project.branding==='object'?project.branding:{};return {
 name:text(b.name)||text(project.title)||'Virtual tour',title:text(b.tabTitle)||text(project.title)||text(b.name)||'Virtual tour',
 description:text(b.metaDescription)||text(project.description),website:safeUrl(b.website,{absolute:true}),
 logo:safeUrl(b.logo),favicon:safeUrl(b.favicon),socialImage:safeUrl(b.socialImage)||safeUrl(project.cover),publicUrl:safeUrl(b.publicUrl,{absolute:true}),
 footer:text(b.footer),themeColor:/^#[\da-f]{3}(?:[\da-f]{3})?$/i.test(b.themeColor||'')?b.themeColor:'',showStudioCredit:b.showStudioCredit!==false
};}
async function readTourBranding(root){try{return tourBranding(JSON.parse(await fs.readFile(path.join(root,'config','tour.json'),'utf8')));}catch{return tourBranding();}}
function imageType(ref){const extension=path.extname(new URL(ref,'https://tour.local/').pathname).toLowerCase();return {'.ico':'image/x-icon','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif'}[extension]||'';}
function brandedHead(project){const b=tourBranding(project),tags=[`<title>${escapeHtml(b.title)}</title>`],meta=(name,value,property=false)=>{if(value)tags.push(`<meta ${property?'property':'name'}="${name}" content="${escapeHtml(value)}">`);};
 meta('description',b.description);meta('theme-color',b.themeColor);meta('og:type','website',true);meta('og:title',b.title,true);meta('og:site_name',b.name,true);meta('og:description',b.description,true);
 if(b.favicon)tags.push(`<link rel="icon"${imageType(b.favicon)?` type="${imageType(b.favicon)}"`:''} href="${escapeHtml(b.favicon)}">`);
 if(b.publicUrl){tags.push(`<link rel="canonical" href="${escapeHtml(b.publicUrl)}">`);meta('og:url',b.publicUrl,true);}
 const image=b.socialImage&&(b.publicUrl?new URL(b.socialImage,b.publicUrl).href:b.socialImage);meta('og:image',image,true);meta('twitter:card',image?'summary_large_image':'summary');meta('twitter:title',b.title);meta('twitter:description',b.description);meta('twitter:image',image);
 return tags.join('\n');
}
function brandIndexHtml(html,project){const head=brandedHead(project);if(!/<head\b/i.test(html))return `<!doctype html><html><head>${head}</head><body>${html}</body></html>`;return html.replace(/(<head\b[^>]*>)([\s\S]*?)(<\/head\s*>)/i,(_all,open,content,close)=>{
 const cleaned=content.replace(/<title\b[^>]*>[\s\S]*?<\/title\s*>/gi,'').replace(/<meta\b[^>]*>/gi,tag=>/\b(?:name|property)\s*=\s*["'](?:description|theme-color|generator|og:[^"']*|twitter:[^"']*)["']/i.test(tag)?'':tag).replace(/<link\b[^>]*>/gi,tag=>/\brel\s*=\s*["'](?:canonical|(?:shortcut\s+)?icon|apple-touch-icon(?:-precomposed)?)["']/i.test(tag)?'':tag);
 return open+cleaned+'\n'+head+'\n'+close;
 });}
function launcherHead(b){return `<title>${escapeHtml(b.title)} · Local tour</title>${b.favicon?`<link rel="icon" href="${escapeHtml(b.favicon)}">`:''}`;}
function launcherIdentity(b){return `${b.logo?`<img alt="" src="${escapeHtml(b.logo)}" style="max-width:180px;max-height:80px;object-fit:contain">`:''}<small>${b.website?`<a href="${escapeHtml(b.website)}" target="_blank" rel="noopener noreferrer">${escapeHtml(b.name)}</a>`:escapeHtml(b.name)}</small><h1>${escapeHtml(b.title)}</h1>`;}
function launcherFooter(b){return `${b.footer?`<p class="note">${escapeHtml(b.footer)}</p>`:''}${b.showStudioCredit?`<p class="note"><a href="${studioCreditUrl}" target="_blank" rel="noopener noreferrer">made with 3DGS Perspectives Studio</a></p>`:''}`;}
module.exports={escapeHtml,tourBranding,readTourBranding,brandIndexHtml,launcherHead,launcherIdentity,launcherFooter,studioCreditUrl};
