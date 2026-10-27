/** Resolve a finished website address without treating unfinished drafts as local paths. */
export function normalizeBrandingWebUrl(value){
 if(typeof value!=='string')return '';
 const text=value.trim();if(!text||/[\u0000-\u001f\u007f\\]/.test(text)||text.startsWith('//'))return '';
 const explicit=/^https?:\/\//i.test(text);
 try{
  const url=new URL(explicit?text:'https://'+text);
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password)return '';
  if(!explicit){
   const host=url.hostname.toLowerCase().replace(/\.$/,''),authority=text.split(/[/?#]/,1)[0];
   const ipv4=/^(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?$/.test(authority);
   const dns=host.includes('.')&&host.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(part))&&/^(?:[a-z]{2,}|xn--[a-z0-9-]+)$/i.test(host.split('.').at(-1));
   if(host!=='localhost'&&!ipv4&&!host.startsWith('[')&&!dns)return '';
  }
  return url.href;
 }catch{return '';}
}
