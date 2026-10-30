import {createContext,useContext} from 'react';
export {createEditorOperations} from '../shared/editor-operations.mjs';

export interface EditorImportTarget {sceneId?:string;viewpointId?:string;pageId?:string;bubbleId?:string}
export type EditorImportTransaction=<T>(read:()=>Promise<T>,apply:(value:NonNullable<T>)=>void,target?:EditorImportTarget)=>Promise<boolean>;

// Components can also be rendered independently of Studio. In that case there
// is no project operation lock to acquire, and their original behavior remains.
const directImport:EditorImportTransaction=async(read,apply)=>{const value=await read();if(value==null)return false;apply(value);return true;};
export const EditorImportContext=createContext<EditorImportTransaction>(directImport);
export const EditorImportTargetContext=createContext<EditorImportTarget|undefined>(undefined);
export function useEditorImport(){
 const transaction=useContext(EditorImportContext),target=useContext(EditorImportTargetContext);
 return <T,>(read:()=>Promise<T>,apply:(value:NonNullable<T>)=>void)=>transaction(read,apply,target);
}
