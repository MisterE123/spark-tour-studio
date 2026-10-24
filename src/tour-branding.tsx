import React,{useEffect} from 'react';
import type {Project} from './model';
import {resolveBranding,STUDIO_CREDIT,STUDIO_URL} from '../shared/branding.mjs';
import {LinkedDescription} from './linked-description';
import './tour-branding.css';

export function brandUrl(value:string,base:string){try{if(!value)return '';const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}}

export function TourIdentity({project,base,compact=false}:{project:Project;base:string;compact?:boolean}){
 const brand=resolveBranding(project),logo=brandUrl(brand.logo,base),website=brandUrl(brand.website,base);
 if(!brand.name&&!logo)return null;
 const identity=<>{logo&&<img className="tour-brand-logo" src={logo} alt={brand.name?brand.name+' logo':'Tour logo'}/ >}{brand.name&&<span>{brand.name}</span>}</>;
 return <div className={'tour-identity '+(compact?'tour-identity-compact':'')}>{website?<a href={website} target="_blank" rel="noopener noreferrer">{identity}</a>:<div>{identity}</div>}</div>;
}

export function TourFooter({project}:{project:Project}){
 const brand=resolveBranding(project);if(!brand.footer&&!brand.showStudioCredit)return null;
 return <footer className="tour-footer">{brand.footer&&<p><LinkedDescription text={brand.footer}/></p>}{brand.showStudioCredit&&<a className="studio-credit" href={STUDIO_URL} target="_blank" rel="noopener noreferrer">{STUDIO_CREDIT}</a>}</footer>;
}

/** Mirror exported metadata when loading authored JSON directly in the viewer. */
export function useTourDocumentBranding(project:Project|null,base:string){
 useEffect(()=>{
  if(!project){document.title='Virtual tour';return;}
  const brand=resolveBranding(project),canonical=brandUrl(brand.publicUrl,base),image=brandUrl(brand.socialImage,canonical||base),favicon=brandUrl(brand.favicon,base);
  document.title=brand.tabTitle;
  const meta=(attribute:'name'|'property',key:string,value:string)=>{
   const matches=Array.from(document.head.querySelectorAll<HTMLMetaElement>(`meta[${attribute}="${key}"]`));let element=matches.shift();for(const duplicate of matches)duplicate.remove();
   if(!value){element?.remove();return;}if(!element){element=document.createElement('meta');element.setAttribute(attribute,key);document.head.append(element);}element.content=value;
  };
  const link=(rel:string,value:string)=>{const matches=Array.from(document.head.querySelectorAll<HTMLLinkElement>(`link[rel${rel==='icon'?'~':''}="${rel}"]`));let element=matches.shift();for(const duplicate of matches)duplicate.remove();if(!value){element?.remove();return;}if(!element){element=document.createElement('link');element.rel=rel;document.head.append(element);}if(rel==='icon')element.removeAttribute('type');element.href=value;};
  meta('name','description',brand.metaDescription);meta('name','theme-color',brand.themeColor);
  meta('property','og:type','website');meta('property','og:title',brand.tabTitle);meta('property','og:description',brand.metaDescription);meta('property','og:site_name',brand.name||project.title||'Virtual tour');meta('property','og:image',image);meta('property','og:url',canonical);
  meta('name','twitter:card',image?'summary_large_image':'summary');meta('name','twitter:title',brand.tabTitle);meta('name','twitter:description',brand.metaDescription);meta('name','twitter:image',image);
  link('icon',favicon);link('canonical',canonical);
 },[project,base]);
}
