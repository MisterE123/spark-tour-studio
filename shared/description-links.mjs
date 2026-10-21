// Keep authored prose as text. Only recognized web URLs become link tokens.
export function linkifyDescription(value){
 const text=typeof value==='string'?value:'',parts=[],pattern=/(?:https?:\/\/|www\.)[^\s<>"']+/giu;
 let last=0,match;
 while((match=pattern.exec(text))){
  if(match.index>0&&/[\p{L}\p{N}_]/u.test(text[match.index-1]))continue;
  const label=trimPunctuation(match[0]);let url;
  try{url=new URL(/^www\./i.test(label)?'https://'+label:label);if(!['http:','https:'].includes(url.protocol)||!url.hostname)continue;}catch{continue;}
  if(match.index>last)parts.push({type:'text',text:text.slice(last,match.index)});
  parts.push({type:'link',text:label,href:url.href});last=match.index+label.length;
 }
 if(last<text.length)parts.push({type:'text',text:text.slice(last)});
 return parts;
}

function trimPunctuation(value){
 const pairs={')':'(',']':'[','}':'{'},counts={};for(const char of value)if('()[]{}'.includes(char))counts[char]=(counts[char]||0)+1;
 let end=value.length;
 while(end){const char=value[end-1];if(/[.,;:!?\u2019\u201d\u00bb]/u.test(char)){end--;continue;}const open=pairs[char];if(open&&(counts[char]||0)>(counts[open]||0)){counts[char]--;end--;continue;}break;}
 return value.slice(0,end);
}
