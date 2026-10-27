import {z} from 'zod';
import {normalizeBrandingWebUrl} from './branding-url.mjs';

export const STUDIO_NAME='3DGS Perspectives Studio';
export const STUDIO_URL='https://studio.chesapeakeperspectives.com/';
export const STUDIO_CREDIT='made with '+STUDIO_NAME;
// These are authoring drafts. Validate their destinations at publication time,
// so pausing mid-address never prevents saving the rest of a project.
const webUrl=z.string().trim().max(8192);
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
 return {name:b.name?.trim()||'',website:normalizeBrandingWebUrl(b.website),logo:b.logo||'',favicon:b.favicon||'',
  tabTitle:b.tabTitle?.trim()||project?.title||'Virtual tour',metaDescription:b.metaDescription?.trim()||project?.description||'',
  socialImage:b.socialImage||project?.cover||'',publicUrl:normalizeBrandingWebUrl(b.publicUrl),footer:b.footer||'',themeColor:b.themeColor||'',
  showStudioCredit:b.showStudioCredit!==false};
}

export function brandingReferences(project){return ['logo','favicon','socialImage'].map(key=>project?.branding?.[key]).filter(Boolean);}

export function brandingUrlIssue(value){return typeof value==='string'&&value.trim()&&!normalizeBrandingWebUrl(value)?'Enter a website address, such as example.com or https://example.com.':'';}
export function validateBrandingUrls(branding){return [['website','Brand website'],['publicUrl','Public tour URL']].flatMap(([field,label])=>{const issue=brandingUrlIssue(branding?.[field]);return issue?[`${label}: ${issue}`]:[];});}
