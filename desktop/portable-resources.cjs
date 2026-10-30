// Inspect common static resource references in local content. This deliberately
// does not interpret arbitrary page scripts or treat ordinary links as assets.
const namedEntities={amp:'&',AMP:'&',quot:'"',QUOT:'"',apos:"'",lt:'<',LT:'<',gt:'>',GT:'>',colon:':',sol:'/',bsol:'\\',Tab:'\t',NewLine:'\n',nbsp:'\u00a0'};
function attributeText(value){return value.replace(/&#(x[0-9a-f]+|[0-9]+);?|&([a-z][a-z0-9]+);/gi,(all,number,name)=>{if(!number)return namedEntities[name]??all;const code=number[0].toLowerCase()==='x'?parseInt(number.slice(1),16):parseInt(number,10);return code>0&&code<=0x10ffff&&!(code>=0xd800&&code<=0xdfff)?String.fromCodePoint(code):'\ufffd';});}
function external(value){const clean=value.replace(/[\t\n\r]/g,'').replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g,'');for(const protocol of ['https:','http:']){const base=protocol+'//portable-content.invalid/';try{const url=new URL(clean,base);if(['http:','https:'].includes(url.protocol)&&(url.origin!==new URL(base).origin||/^(?:https?:)?[\\/]{2}/i.test(clean)))return true;}catch{}}return false;}
function srcsetUrls(value){
 const urls=[];let i=0;
 while(i<value.length){while(i<value.length&&/[\t\n\f\r ,]/.test(value[i]))i++;const start=i;while(i<value.length&&!/[\t\n\f\r ]/.test(value[i]))i++;let url=value.slice(start,i);if(!url)break;if(url.endsWith(',')){urls.push(url.replace(/,+$/,''));continue;}urls.push(url);let brackets=0;while(i<value.length){const ch=value[i++];if(ch==='(')brackets++;else if(ch===')')brackets=Math.max(0,brackets-1);else if(ch===','&&!brackets)break;}
 }return urls;
}
function openingTags(text){
 const tags=[];let i=0;
 while(i<text.length){const start=text.indexOf('<',i);if(start<0)break;if(text.startsWith('<!--',start)){const end=text.indexOf('-->',start+4);i=end<0?text.length:end+3;continue;}const match=/^<([a-z][^\t\n\f\r />]*)/i.exec(text.slice(start));if(!match){i=start+1;continue;}const tag=match[1].toLowerCase(),attrs=new Map();i=start+match[0].length;
  while(i<text.length){while(/[\t\n\f\r /]/.test(text[i]||''))i++;if(i>=text.length||text[i]==='>'){i++;break;}const nameStart=i;while(i<text.length&&!/[\t\n\f\r /=<>]/.test(text[i]))i++;if(i===nameStart){i++;continue;}const name=text.slice(nameStart,i).toLowerCase();while(/[\t\n\f\r ]/.test(text[i]||''))i++;let value='';if(text[i]==='='){i++;while(/[\t\n\f\r ]/.test(text[i]||''))i++;const quote=text[i]==='"'||text[i]==="'"?text[i++]:undefined,from=i;if(quote){while(i<text.length&&text[i]!==quote)i++;value=text.slice(from,i);if(i<text.length)i++;}else{while(i<text.length&&!/[\t\n\f\r >]/.test(text[i]))i++;value=text.slice(from,i);}}if(!attrs.has(name))attrs.set(name,attributeText(value));
  }const record={tag,attrs};tags.push(record);
  // Markup written inside a raw-text element is text, not another resource tag.
  if(['script','style','title','textarea','xmp','iframe','noembed','noframes'].includes(tag)){const close=new RegExp('</'+tag+'(?=[\\t\\n\\f\\r />])','ig');close.lastIndex=i;const end=close.exec(text);record.content=text.slice(i,end?.index??text.length);i=end?end.index+end[0].length:text.length;}
 }return tags;
}
const srcTags=new Set(['audio','embed','iframe','img','input','script','source','track','video']);
const linkResources=new Set(['stylesheet','preload','modulepreload','prefetch','prerender','preconnect','dns-prefetch','icon','apple-touch-icon','manifest']);
// Retain the existing CSS/module checks, including separate local stylesheets
// and scripts, without interpreting URLs mentioned in page prose as resources.
const codeResource=text=>/(?:url\(|@import\s+|fetch\(|import\s*\(|from\s+)[\s"']*((?:https?:)?\/\/[^\s"')]+)/i.exec(text)?.[1];
function externalStaticResource(text,{markup=true}={}){
 if(!markup)return codeResource(text);
 for(const {tag,attrs,content} of openingTags(text)){
  const check=name=>attrs.has(name)&&external(attrs.get(name))?attrs.get(name):undefined;
  if(srcTags.has(tag)&&(tag!=='input'||(attrs.get('type')||'').toLowerCase()==='image')){const found=check('src');if(found)return found;}
  if(tag==='video'){const found=check('poster');if(found)return found;}
  if(tag==='base'){const found=check('href');if(found)return found;}
  if(tag==='object'){const found=check('data');if(found)return found;}
  if(['image','use','feimage'].includes(tag)){const found=check('href')||check('xlink:href');if(found)return found;}
  const resourceLink=tag==='link'&&(attrs.get('rel')||'').toLowerCase().split(/\s+/).some(rel=>linkResources.has(rel));
  if(resourceLink){const found=check('href');if(found)return found;}
  if(tag==='img'||tag==='source'||resourceLink)for(const url of srcsetUrls(attrs.get(resourceLink?'imagesrcset':'srcset')||''))if(external(url))return url;
  if(attrs.has('style')){const found=/(?:url\(|@import\s+)[\s"']*((?:https?:)?\/\/[^\s"')]+)/i.exec(attrs.get('style'));if(found)return found[1];}
  if(tag==='style'||tag==='script'&&(!attrs.has('type')||/^(?:module|(?:text|application)\/(?:java|ecma)script)$/i.test(attrs.get('type').trim()))){const found=codeResource(content||'');if(found)return found;}
  for(const [name,value] of attrs)if(/^on[a-z]+$/.test(name)){const found=codeResource(value);if(found)return found;}
 }
}
module.exports={externalStaticResource,attributeText,srcsetUrls};
