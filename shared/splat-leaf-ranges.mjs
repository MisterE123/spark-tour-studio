const integer=value=>Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff;

/** Union overlapping/touching physical splat ranges without visiting duplicates. */
export function mergeSplatLeafRanges(ranges,limit=0xffffffff){
 if(!integer(limit))throw Error('Invalid source splat count.');
 const ordered=ranges.map(range=>{
  if(!range||!integer(range.offset)||!integer(range.count)||range.offset+range.count>limit)throw Error('SOG leaf range exceeds its source splat count.');
  return {offset:range.offset,count:range.count};
 }).filter(range=>range.count>0).sort((a,b)=>a.offset-b.offset);
 const merged=[];
 for(const range of ordered){const last=merged.at(-1),end=range.offset+range.count;if(last&&range.offset<=last.offset+last.count)last.count=Math.max(last.offset+last.count,end)-last.offset;else merged.push({...range});}
 return merged;
}

function resourceKey(reference){
 const url=new URL(reference);
 if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('SOG leaf resources must use HTTP or HTTPS without credentials.');
 // A fragment is never sent in a request. Keep query strings, including signed
 // URLs, because they can select different representations of the same path.
 url.hash='';return url.href;
}

/**
 * Select each spatial leaf's finest available level once, independently of the
 * camera or the viewer's current LoD. Group aliases by their actual fetch URL.
 * ranges:null means the environment is drawn whole and must be scanned once.
 */
export function finestSogLeafFiles(tree){
 const {levels,leaves,files,file,offset,count}=tree||{},length=levels*leaves;
 if(!Number.isSafeInteger(levels)||levels<1||levels>32||!Number.isSafeInteger(leaves)||leaves<1||length>8000000||!Array.isArray(files)||!files.length||file?.length!==length||offset?.length!==length||count?.length!==length)throw Error('Invalid SOG leaf table.');
 const grouped=new Map();
 for(let leaf=0;leaf<leaves;leaf++){
  let found=false;
  for(let level=0;level<levels;level++){
   const at=leaf*levels+level,index=file[at];if(index===-1||count[at]===0)continue;
   if(!Number.isSafeInteger(index)||index<0||index>=files.length)throw Error('Invalid SOG leaf file index.');
   const url=resourceKey(files[index]),entry=grouped.get(url)||{url,ranges:[]};
   if(entry.ranges)entry.ranges.push({offset:offset[at],count:count[at]});
   grouped.set(url,entry);found=true;break;
  }
  if(!found)throw Error('SOG leaf has no source splats.');
 }
 if(tree.environment){const url=resourceKey(tree.environment);grouped.set(url,{url,ranges:null});}
 return [...grouped.values()].map(entry=>({...entry,ranges:entry.ranges===null?null:mergeSplatLeafRanges(entry.ranges)}));
}
