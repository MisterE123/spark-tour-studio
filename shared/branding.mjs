import {z} from 'zod';

export const STUDIO_NAME='3DGS Perspectives Studio';
export const STUDIO_URL='https://studio.chesapeakeperspectives.com/';
export const STUDIO_CREDIT='made with '+STUDIO_NAME;
const webUrl=z.string().trim().max(8192).refine(value=>{if(!value)return true;try{return ['http:','https:'].includes(new URL(value).protocol);}catch{return false;}},'Use a complete HTTP(S) address');
const asset=z.string().max(8192).refine(value=>!value||(!value.startsWith('/')&&!value.includes('\\')&&!value.split('/').includes('..')&&(!/^[a-z][a-z0-9+.-]*:/i.test(value)||/^https?:\/\//i.test(value))),'Use a relative asset path or HTTP(S) URL');
export const BrandingSchema=z.object({
 name:z.string().max(200).optional(),website:webUrl.optional(),logo:asset.optional(),favicon:asset.optional(),
 tabTitle:z.string().max(300).optional(),metaDescription:z.string().max(4000).optional(),socialImage:asset.optional(),
 publicUrl:webUrl.optional(),footer:z.string().max(4000).optional(),themeColor:z.string().regex(/^(?:#[0-9a-f]{6})?$/i).optional(),
 showStudioCredit:z.boolean().optional()
});

/** Missing branding never introduces a product logo or name into an author's identity. */
export function resolveBranding(project){
 const b=project?.branding||{};
 return {name:b.name?.trim()||'',website:b.website?.trim()||'',logo:b.logo||'',favicon:b.favicon||'',
  tabTitle:b.tabTitle?.trim()||project?.title||'Virtual tour',metaDescription:b.metaDescription?.trim()||project?.description||'',
  socialImage:b.socialImage||project?.cover||'',publicUrl:b.publicUrl?.trim()||'',footer:b.footer||'',themeColor:b.themeColor||'',
  showStudioCredit:b.showStudioCredit!==false};
}

export function brandingReferences(project){return ['logo','favicon','socialImage'].map(key=>project?.branding?.[key]).filter(Boolean);}
