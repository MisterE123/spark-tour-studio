// Sorting never changes the authored order. Older tours use their existing array order.
const names=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
export function browserItems(items,{query='',sort='name',descending=false,type='all',label=item=>item.label||item.name||'',distance=(_item)=>Number(0)}={}){
 const text=query.trim().toLocaleLowerCase();
 return items.map((item,index)=>({item,index,label:label(item),distance:distance(item)}))
  .filter(row=>(type==='all'||row.item.kind===type)&&(!text||row.label.toLocaleLowerCase().includes(text)))
  .sort((a,b)=>{let result=sort==='distance'?a.distance-b.distance:sort==='created'?(a.item.createdAt??(-1e12+a.index))-(b.item.createdAt??(-1e12+b.index)):names.compare(a.label,b.label);if(!Number.isFinite(result))result=0;return (descending?-result:result)||a.index-b.index;});
}
export function editorLayout(value={},width=1280){
 const maxLeft=Math.max(180,Math.min(440,width-480));
 const left=Math.min(maxLeft,Math.max(180,Number(value.left)||235));
 const maxRight=Math.max(240,Math.min(580,width-left-320));
 return {left,right:Math.min(maxRight,Math.max(240,Number(value.right)||340)),browser:value.browser!==false,inspector:value.inspector!==false};
}
