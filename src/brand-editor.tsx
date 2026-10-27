import React,{useId,useState} from 'react';
import type {Project,TourBranding} from './model';
import {STUDIO_CREDIT,brandingUrlIssue} from '../shared/branding.mjs';
import {Field} from './ui';
import {ImagePicker} from './image-picker';
import {InspectorSection} from './icons';

function BrandUrlField({label,value,placeholder,onChange}:{label:string;value:string;placeholder:string;onChange:(value:string)=>void}){
 const id=useId(),[blurred,setBlurred]=useState(false),issue=blurred?brandingUrlIssue(value):'';
 return <Field label={label}><input type="text" inputMode="url" autoCapitalize="none" spellCheck={false} value={value} placeholder={placeholder} aria-invalid={issue?true:undefined} aria-describedby={issue?id:undefined} onBlur={()=>setBlurred(true)} onChange={event=>onChange(event.target.value)}/>{issue&&<small id={id} className="muted">{issue}</small>}</Field>;
}

export function BrandEditor({project,base,disabled,change}:{project:Project;base:string;disabled?:boolean;change:(fn:(project:Project)=>void)=>void}){
 const brand=project.branding||{},set=(patch:Partial<TourBranding>)=>change(project=>{project.branding={...project.branding,...patch};});
 return <InspectorSection title="Tour branding" icon="photo" defaultOpen>
  <p className="muted">Your identity in the exported tour. These settings keep the tour’s title and description separate.</p>
  <Field label="Brand name"><input value={brand.name||''} placeholder="Author or organization" onChange={event=>set({name:event.target.value})}/></Field>
  <BrandUrlField label="Brand website" value={brand.website||''} placeholder="example.com or https://…" onChange={website=>set({website})}/>
  <ImagePicker label="Brand logo" disabled={disabled} value={brand.logo||''} base={base} onChange={logo=>set({logo})}/>
  <ImagePicker label="Browser icon" disabled={disabled} value={brand.favicon||''} base={base} onChange={favicon=>set({favicon})}/>
  <p className="muted">PNG, SVG or ICO. The browser icon appears on the tour’s tab.</p>
  <Field label="Footer text"><textarea value={brand.footer||''} placeholder="Copyright, credits or a short note" onChange={event=>set({footer:event.target.value})}/></Field>
  <label className="check"><input aria-label="Show studio credit" type="checkbox" checked={brand.showStudioCredit!==false} onChange={event=>set({showStudioCredit:event.target.checked})}/>Show “{STUDIO_CREDIT}” link</label>
  <p className="muted">Please keep this small credit to help others find the studio. You can turn it off.</p>
  <InspectorSection title="Browser & link previews" icon="ios_share">
   <Field label="Browser tab title"><input value={brand.tabTitle||''} placeholder={project.title} onChange={event=>set({tabTitle:event.target.value})}/></Field>
   <Field label="Search description"><textarea value={brand.metaDescription||''} placeholder={project.description} onChange={event=>set({metaDescription:event.target.value})}/></Field>
   <ImagePicker label="Share image" disabled={disabled} value={brand.socialImage||''} base={base} onChange={socialImage=>set({socialImage})}/>
   <p className="muted">Used when sharing a link. Leave empty to use the tour cover.</p>
   <BrandUrlField label="Public tour URL" value={brand.publicUrl||''} placeholder="your-site.example/tour/" onChange={publicUrl=>set({publicUrl})}/>
   <label className="check"><input aria-label="Use custom browser theme color" type="checkbox" checked={!!brand.themeColor} onChange={event=>{if(event.target.checked)set({themeColor:'#252a2d'});else change(project=>{const next={...project.branding};delete next.themeColor;project.branding=next;});}}/>Use custom browser theme color</label>
   {brand.themeColor&&<Field label="Browser theme color"><input type="color" value={brand.themeColor} onChange={event=>set({themeColor:event.target.value})}/></Field>}
  </InspectorSection>
 </InspectorSection>;
}
