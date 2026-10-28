import React,{useEffect,useLayoutEffect,useRef,useState,useContext} from 'react';
import {EditorContent,useEditor} from '@tiptap/react';
import {EditorState,TextSelection} from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import type {RichTextDocument} from './model';
import {IconButton} from './icons';
import {EditorImportTargetContext,useEditorImport} from './editor-imports';
import {RichTextSchema,plainTextDocument,richTextPlainText,resolveContentResource,normalizeContentResource,safeContentReference} from '../shared/rich-text.mjs';
import './rich-text.css';

export interface RichTextEditorProps {
 label?:string;value?:RichTextDocument;text:string;base:string;disabled?:boolean;documentKey?:string;
 onChange:(value:RichTextDocument,text:string)=>void;
 importImage?:(file:File)=>Promise<string>;
}
export function RichTextEditor(props:RichTextEditorProps){
 const target=useContext(EditorImportTargetContext);
 // A text history belongs to one project document, not an inspector slot.
 return <RichTextDocumentEditor key={JSON.stringify([props.base,props.documentKey,target])} {...props}/>;
}
function RichTextDocumentEditor({label='Bubble rich text',value,text,base,disabled=false,onChange,importImage}:RichTextEditorProps){
 const transaction=useEditorImport(),targetKey=JSON.stringify(useContext(EditorImportTargetContext)||null),liveTarget=useRef(targetKey);liveTarget.current=targetKey;
 const change=useRef(onChange);change.current=onChange;
 const emitted=useRef<RichTextDocument|undefined>(undefined),received=useRef({value,text});
 const [,refresh]=useState(0);
 const [panel,setPanel]=useState<'link'|'image'|null>(null),[url,setUrl]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false);
 const fileInput=useRef<HTMLInputElement>(null);
 const content=value||plainTextDocument(text);
 const editor=useEditor({
  extensions:[StarterKit.configure({heading:{levels:[1,2,3]},codeBlock:false,link:{openOnClick:false,autolink:true,defaultProtocol:'https',isAllowedUri:url=>safeContentReference(url)}}),TextAlign.configure({types:['heading','paragraph']}),Image.extend({renderHTML({HTMLAttributes}){const source=resolveContentResource(String(HTMLAttributes.src||''),base);return source?['img',{...HTMLAttributes,src:source}]:['span',{},String(HTMLAttributes.alt||HTMLAttributes.title||'')];}}).configure({allowBase64:false})],
  content:content.doc,editable:!disabled,shouldRerenderOnTransaction:true,
  editorProps:{attributes:{role:'textbox','aria-multiline':'true','aria-label':label,'data-placeholder':'Write text…'},transformPastedHTML(html){const parsed=new DOMParser().parseFromString(html,'text/html');for(const element of parsed.querySelectorAll('script,style,iframe,object,embed'))element.remove();for(const element of parsed.querySelectorAll('[href]'))if(!safeContentReference(element.getAttribute('href')||''))element.removeAttribute('href');for(const element of parsed.querySelectorAll('img'))if(!normalizeContentResource(element.getAttribute('src')||''))element.remove();return parsed.body.innerHTML;}},
  onUpdate({editor}){const parsed=RichTextSchema.safeParse({version:1,doc:editor.getJSON()});if(!parsed.success){setError(parsed.error.issues[0]?.message||'This content cannot be saved.');return;}setError('');emitted.current=parsed.data as RichTextDocument;change.current(emitted.current,richTextPlainText(parsed.data));}
 },[base]);
 useEffect(()=>{if(editor)editor.setEditable(!disabled,false);},[editor,disabled]);
 useLayoutEffect(()=>{if(!editor)return;const previous=received.current;received.current={value,text};const parsed=RichTextSchema.safeParse(value||plainTextDocument(text));if(!parsed.success)return;const current=RichTextSchema.safeParse({version:1,doc:editor.getJSON()}),changed=JSON.stringify(current.success?current.data.doc:null)!==JSON.stringify(parsed.data.doc),external=(previous.value!==value||previous.text!==text)&&value!==emitted.current;
  if(!changed&&!external)return;
  // setContent({emitUpdate:false}) still enters ProseMirror history. An
  // external project Undo, replacement or reordered block starts a fresh text
  // history instead; the exact object emitted by typing keeps its own history.
  const doc=editor.schema.nodeFromJSON(parsed.data.doc),old=editor.state.selection,position=(n:number)=>doc.resolve(Math.min(n,doc.content.size)),selection=TextSelection.between(position(old.anchor),position(old.head));
  editor.view.updateState(EditorState.create({schema:editor.schema,doc,plugins:editor.state.plugins,selection}));refresh(n=>n+1);
 },[editor,value,text]);
 const addImage=async(file:File)=>{if(disabled||working||!editor)return;const state=editor.state,apply=onChange,target=targetKey;setWorking(true);setError('');try{await transaction(()=>importImage?importImage(file):window.studio!.importImageFile(file),ref=>{
   const source=normalizeContentResource(ref);if(!source)throw Error('The imported image has an invalid path.');
   // The user may inspect another bubble while the file is read. Preserve the
   // original document, caret and callback instead of using a replaced editor.
   const image=state.schema.nodes.image.create({src:source,alt:file.name.replace(/\.[^.]+$/,'')}),insert=state.tr.replaceSelectionWith(image),ownsEditor=!editor.isDestroyed&&editor.state.doc.eq(state.doc)&&(target!=='null'?liveTarget.current===target:change.current===apply);
   if(ownsEditor)editor.view.dispatch(insert.setMeta('preventUpdate',true).scrollIntoView());
   // Plugins may append a trailing paragraph to the dispatched image. Echo
   // that actual document so synchronization does not discard its Undo entry.
   const document=RichTextSchema.parse({version:1,doc:ownsEditor?editor.getJSON():insert.doc.toJSON()});
   emitted.current=document as RichTextDocument;apply(emitted.current,richTextPlainText(document));
   setPanel(null);
  });}catch(e){setError(String(e));}finally{setWorking(false);}};
 if(!editor)return null;
 const buttonDisabled=disabled||working;
 return <div className="rich-text-editor" onDragOverCapture={e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();}} onDropCapture={e=>{const file=e.dataTransfer.files[0];if(file){e.preventDefault();e.stopPropagation();void addImage(file);}}}>
  <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
   <select aria-label="Paragraph style" disabled={buttonDisabled} value={editor.isActive('heading',{level:1})?'h1':editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':'paragraph'} onChange={e=>{if(e.target.value==='paragraph')editor.chain().focus().setParagraph().run();else editor.chain().focus().toggleHeading({level:+e.target.value.slice(1) as 1|2|3}).run();}}><option value="paragraph">Text</option><option value="h1">H1</option><option value="h2">H2</option><option value="h3">H3</option></select>
   <select aria-label="Text alignment" title="Align the selected paragraphs or headings" className="text-alignment" disabled={buttonDisabled} value={(editor.isActive('heading')?editor.getAttributes('heading'):editor.getAttributes('paragraph')).textAlign||'left'} onChange={e=>editor.chain().focus().setTextAlign(e.target.value).run()}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option><option value="justify">Justified</option></select>
   <IconButton icon="format_bold" label="Bold" aria-pressed={editor.isActive('bold')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBold().run()}/>
   <IconButton icon="format_italic" label="Italic" aria-pressed={editor.isActive('italic')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleItalic().run()}/>
   <IconButton icon="format_underlined" label="Underline" aria-pressed={editor.isActive('underline')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleUnderline().run()}/>
   <IconButton icon="format_list_bulleted" label="Bulleted list" aria-pressed={editor.isActive('bulletList')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBulletList().run()}/>
   <IconButton icon="format_list_numbered" label="Numbered list" aria-pressed={editor.isActive('orderedList')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleOrderedList().run()}/>
   <IconButton icon="format_quote" label="Quote" aria-pressed={editor.isActive('blockquote')} disabled={buttonDisabled} onClick={()=>editor.chain().focus().toggleBlockquote().run()}/>
   <IconButton icon="link" label="Insert or edit link" aria-pressed={editor.isActive('link')} disabled={buttonDisabled} onClick={()=>{setPanel(panel==='link'?null:'link');setUrl(editor.getAttributes('link').href||'');}}/>
   <IconButton icon="add_photo_alternate" label="Insert image" disabled={buttonDisabled} onClick={()=>{setPanel(panel==='image'?null:'image');setUrl('');}}/>
  </div>
  {panel&&<div className="rich-insert"><label><span>{panel==='link'?'Link URL or project path':'Image URL or project path'}</span><input aria-label={panel==='link'?'Link destination':'Image source'} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><div className="actions"><button type="button" disabled={buttonDisabled||!(panel==='link'?safeContentReference(url):normalizeContentResource(url))} onClick={()=>{if(panel==='link')editor.chain().focus().extendMarkRange('link').setLink({href:url}).run();else editor.chain().focus().setImage({src:normalizeContentResource(url)}).run();setPanel(null);}}>Apply</button>{panel==='link'&&editor.isActive('link')&&<button type="button" disabled={buttonDisabled} onClick={()=>{editor.chain().focus().extendMarkRange('link').unsetLink().run();setPanel(null);}}>Remove link</button>}{panel==='image'&&<button type="button" disabled={buttonDisabled} onClick={()=>fileInput.current?.click()}>{working?'Adding image…':'Choose image file…'}</button>}<button type="button" onClick={()=>setPanel(null)}>Cancel</button></div></div>}
  <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={e=>{const file=e.currentTarget.files?.[0];if(file)void addImage(file);e.currentTarget.value='';}}/>
  <EditorContent editor={editor}/>{error&&<small role="alert">{error}</small>}
 </div>;
}
