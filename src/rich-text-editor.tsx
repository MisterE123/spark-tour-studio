import React,{useEffect,useRef,useState} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import type {RichTextDocument} from './model';
import {IconButton} from './icons';
import {RichTextSchema,plainTextDocument,richTextPlainText,resolveRichReference,safeContentReference} from '../shared/rich-text.mjs';
import './rich-text.css';

export interface RichTextEditorProps {
 value?:RichTextDocument;text:string;base:string;disabled?:boolean;
 onChange:(value:RichTextDocument,text:string)=>void;
 importImage?:(file:File)=>Promise<string>;
}
export function RichTextEditor({value,text,base,disabled=false,onChange,importImage}:RichTextEditorProps){
 const change=useRef(onChange);change.current=onChange;
 const [panel,setPanel]=useState<'link'|'image'|null>(null),[url,setUrl]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const content=value||plainTextDocument(text);
 const editor=useEditor({
  extensions:[StarterKit.configure({heading:{levels:[1,2,3]},codeBlock:false,link:{openOnClick:false,autolink:true,defaultProtocol:'https',isAllowedUri:url=>safeContentReference(url)}}),Image.extend({renderHTML({HTMLAttributes}){return ['img',{...HTMLAttributes,src:resolveRichReference(String(HTMLAttributes.src||''),base)}];}}).configure({allowBase64:false})],
  content:content.doc,editable:!disabled,shouldRerenderOnTransaction:true,
  editorProps:{attributes:{role:'textbox','aria-multiline':'true','aria-label':'Bubble rich text','data-placeholder':'Tell the story of this place.'},transformPastedHTML(html){const parsed=new DOMParser().parseFromString(html,'text/html');for(const element of parsed.querySelectorAll('script,style,iframe,object,embed'))element.remove();for(const element of parsed.querySelectorAll('[href]'))if(!safeContentReference(element.getAttribute('href')||''))element.removeAttribute('href');for(const element of parsed.querySelectorAll('img'))if(!safeContentReference(element.getAttribute('src')||''))element.remove();return parsed.body.innerHTML;}},
  onUpdate({editor}){const parsed=RichTextSchema.safeParse({version:1,doc:editor.getJSON()});if(!parsed.success){setError(parsed.error.issues[0]?.message||'This content cannot be saved.');return;}setError('');change.current(parsed.data as RichTextDocument,richTextPlainText(parsed.data));}
 },[base]);
 useEffect(()=>{if(editor)editor.setEditable(!disabled);},[editor,disabled]);
 useEffect(()=>{if(!editor)return;const parsed=RichTextSchema.safeParse(value||plainTextDocument(text));if(parsed.success&&JSON.stringify(RichTextSchema.safeParse({version:1,doc:editor.getJSON()}).data?.doc)!==JSON.stringify(parsed.data.doc))editor.commands.setContent(parsed.data.doc,{emitUpdate:false});},[editor,value,text]);
 const addImage=async(file:File)=>{if(disabled||working||!editor)return;setWorking(true);setError('');try{const ref=await (importImage?importImage(file):window.studio!.importImageFile(file));if(ref&&safeContentReference(ref)){editor.chain().focus().setImage({src:ref,alt:file.name.replace(/\.[^.]+$/,'')}).run();setPanel(null);}}catch(e){setError(String(e));}finally{setWorking(false);}};
 if(!editor)return null;
 const buttonDisabled=disabled||working;
 return <div className="rich-text-editor" onDragOverCapture={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDropCapture={e=>{const file=e.dataTransfer.files[0];if(file){e.preventDefault();e.stopPropagation();void addImage(file);}}}>
  <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
   <select aria-label="Paragraph style" disabled={buttonDisabled} value={editor.isActive('heading',{level:1})?'h1':editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':'paragraph'} onChange={e=>{if(e.target.value==='paragraph')editor.chain().focus().setParagraph().run();else editor.chain().focus().toggleHeading({level:+e.target.value.slice(1) as 1|2|3}).run();}}><option value="paragraph">Text</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option></select>
   <IconButton icon="format_bold" label="Bold" aria-pressed={editor.isActive('bold')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBold().run()}/>
   <IconButton icon="format_italic" label="Italic" aria-pressed={editor.isActive('italic')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleItalic().run()}/>
   <IconButton icon="format_underlined" label="Underline" aria-pressed={editor.isActive('underline')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleUnderline().run()}/>
   <IconButton icon="format_list_bulleted" label="Bulleted list" aria-pressed={editor.isActive('bulletList')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBulletList().run()}/>
   <IconButton icon="format_list_numbered" label="Numbered list" aria-pressed={editor.isActive('orderedList')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleOrderedList().run()}/>
   <IconButton icon="format_quote" label="Quote" aria-pressed={editor.isActive('blockquote')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBlockquote().run()}/>
   <IconButton icon="link" label="Insert or edit link" aria-pressed={editor.isActive('link')} disabled={buttonDisabled} onClick={()=>{setPanel(panel==='link'?null:'link');setUrl(editor.getAttributes('link').href||'');}}/>
   <IconButton icon="add_photo_alternate" label="Insert image" disabled={buttonDisabled} onClick={()=>{setPanel(panel==='image'?null:'image');setUrl('');}}/>
  </div>
  {panel&&<div className="rich-insert"><label><span>{panel==='link'?'Link URL or project path':'Image URL or project path'}</span><input aria-label={panel==='link'?'Link destination':'Image source'} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><div className="actions"><button type="button" disabled={buttonDisabled||!safeContentReference(url)} onClick={()=>{if(panel==='link')editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();else editor.chain().focus().setImage({src:url}).run();setPanel(null);}}>Apply</button>{panel==='link'&&editor.isActive('link')&&<button type="button" disabled={buttonDisabled} onClick={()=>{editor.chain().focus().extendMarkRange('link').unsetLink().run();setPanel(null);}}>Remove link</button>}{panel==='image'&&<button type="button" disabled={buttonDisabled} onClick={()=>fileInput.current?.click()}>{working?'Adding image…':'Choose image file…'}</button>}<button type="button" onClick={()=>setPanel(null)}>Cancel</button></div></div>}
  <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void addImage(file);e.currentTarget.value='';}}/>
  <EditorContent editor={editor}/>{error&&<small role="alert">{error}</small>}
 </div>;
}
