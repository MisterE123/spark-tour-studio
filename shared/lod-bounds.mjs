// Spark's RAD LoD nodes use half-float bounds even with float32 splat paging.
// Saturate overflowing bounds; internal nodes receive a conservative split size.
// The rendered splats and the on-disk RAD/chunks are never modified.
export function repairLodBounds(tree){
 if(!(tree instanceof Uint32Array))return 0;
 const invalid=h=>(h&0x7c00)===0x7c00,finite=h=>invalid(h)?(h&0x8000)|0x7bff:h;
 let repaired=0;
 for(let i=0;i+3<tree.length;i+=4){const x=tree[i]&65535,y=tree[i]>>>16,z=tree[i+1]&65535,size=tree[i+1]>>>16;
  if(!invalid(x)&&!invalid(y)&&!invalid(z)&&!invalid(size))continue;
  tree[i]=(finite(y)<<16)|finite(x);
  const bound=tree[i+2]>0?0x7bff:invalid(size)?0: size;
  tree[i+1]=(bound<<16)|finite(z);repaired++;
 }
 return repaired;
}
