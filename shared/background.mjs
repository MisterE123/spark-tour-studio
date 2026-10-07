// Old projects have one color. Explicit hemisphere colors override that fallback.
export function solidBackgroundColors(value){
 const solid=value?.type==='solid'?value:undefined;
 return {top:solid?.topColor||solid?.color||'#0b151d',bottom:solid?.bottomColor||solid?.color||'#0b151d'};
}
