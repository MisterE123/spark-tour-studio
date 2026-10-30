import React from 'react';
import type {SceneRenderIssue} from './runtime';
import {Button} from './ui';
import './scene-unavailable.css';

export function SceneUnavailable({issue,disabled,onReplace,onRetry}:{issue:SceneRenderIssue|null;disabled:boolean;onReplace:()=>void;onRetry:()=>void}){
 if(!issue)return null;
 return <section className="scene-unavailable" aria-label="Scene rendering unavailable"><div>
  <div className="eyebrow">SCENE RETAINED</div><h2>Rendering unavailable</h2>
  <p>{issue.message}</p><p>Your scene settings, views, bubbles and collision data remain editable.</p>
  <div className="actions"><Button primary disabled={disabled} onClick={onReplace}>Replace scene splat</Button>{!issue.unsupported&&<Button disabled={disabled} onClick={onRetry}>Retry scene</Button>}</div>
 </div></section>;
}
