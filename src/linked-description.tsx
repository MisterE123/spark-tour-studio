import React from 'react';
import {linkifyDescription} from '../shared/description-links.mjs';

/** React escapes prose and labels; descriptions never become authored HTML. */
export function LinkedDescription({text}:{text:string}){
 return <>{linkifyDescription(text).map((part,index)=>part.type==='link'?<a key={index} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>:<React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}
