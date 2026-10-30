import {memo,useState} from 'react';
import {FileTextIcon,FolderIcon,DotsThreeIcon} from '@phosphor-icons/react';
import type {Filter,Folder,Note,Workspace} from '../types';
import {insideFolder} from '../lib/folders';
const UNFILED_KEY='__unfiled__';
function FolderTreeView({workspace,filter,choose,openNote,selectedId,manage,batch}:{workspace:Workspace;filter:Filter;choose:(f:Filter)=>void;openNote:(note:Note)=>void;selectedId:string|null;manage:(id:string,name:string)=>void;batch?:{notes:string[];folders:string[];toggle:(kind:"notes"|"folders",id:string)=>void;toggleNotes?:(ids:string[],selected:boolean)=>void}}) {
 const [expanded,setExpanded]=useState<string[]>([]);
 const folderInSelection=(id:string)=>batch?batch.folders.some(sel=>insideFolder(workspace.folders,id,sel)):false;
 const noteInSelection=(note:Note)=>batch?(batch.notes.includes(note.id)||(note.folderId?folderInSelection(note.folderId):false)):false;
 const checkState=(f:Folder):'all'|'some'|'none'=>{
   if(!batch)return 'none';
   if(folderInSelection(f.id))return 'all';
   const someChild=workspace.folders.some(c=>c.id!==f.id&&insideFolder(workspace.folders,c.id,f.id)&&batch.folders.includes(c.id))
     ||workspace.notes.some(n=>!n.deletedAt&&n.folderId&&insideFolder(workspace.folders,n.folderId,f.id)&&batch.notes.includes(n.id));
   return someChild?'some':'none';
 };
 const unfiled=workspace.notes.filter(n=>!n.deletedAt&&!n.folderId).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
 const unfiledOpen=expanded.includes(UNFILED_KEY);
 const unfiledChecked=unfiled.length>0&&unfiled.every(n=>batch?.notes.includes(n.id));
 const unfiledIndeterminate=!unfiledChecked&&unfiled.some(n=>batch?.notes.includes(n.id));
 function nodes(parent:string|null,depth:number):React.ReactNode{return workspace.folders.filter(f=>(f.parentId||null)===parent).map(f=>{
 const children=workspace.folders.some(c=>c.parentId===f.id);
 const files=workspace.notes.filter(n=>!n.deletedAt&&n.folderId===f.id).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
 const expandable=children||files.length>0;const open=expanded.includes(f.id);
 const state=checkState(f);
 return <div key={f.id}>
   <div className={`folder-tree-row ${folderInSelection(f.id)?'selected':''}`} style={{paddingLeft:depth*12}}>{batch&&<input type="checkbox" aria-label={`选择文件夹 ${f.name}`} checked={state==='all'} ref={el=>{if(el)el.indeterminate=state==='some';}} onChange={()=>batch.toggle("folders",f.id)}/>} {expandable&&<button className="folder-expand" aria-label={`${open?'收起':'展开'} ${f.name}`} aria-expanded={open} onClick={()=>setExpanded(ids=>open?ids.filter(id=>id!==f.id):[...ids,f.id])}>{open?'▾':'▸'}</button>}
   <button title={f.name} className={filter.kind==='folder'&&filter.id===f.id?'active':''} onClick={()=>{choose({kind:'folder',id:f.id});if(expandable&&!open)setExpanded(ids=>[...ids,f.id]);}}><FolderIcon size={16}/><span className="nav-label">{f.name}</span><small>{workspace.notes.filter(n=>!n.deletedAt&&insideFolder(workspace.folders,n.folderId,f.id)).length}</small></button><button className="folder-manage" aria-label={`管理文件夹 ${f.name}`} title="管理文件夹：移动、改名或删除" onClick={()=>manage(f.id,f.name)}><DotsThreeIcon size={18}/></button></div>
   {open&&<div className="folder-tree-contents" aria-label={`${f.name}的内容`}>{children&&nodes(f.id,depth+1)}{files.map(note=><div className={`tree-note-selection ${noteInSelection(note)?'selected':''}`} key={note.id}>{batch&&<input type="checkbox" aria-label={`选择笔记 ${note.title}`} checked={batch.notes.includes(note.id)} onChange={()=>batch.toggle("notes",note.id)}/>}<button className={`folder-tree-note ${selectedId===note.id?'active':''}`} style={{paddingLeft:(depth+1)*12+22}} title={note.title||'未命名笔记'} aria-current={selectedId===note.id?'page':undefined} onClick={()=>openNote(note)}><FileTextIcon size={14}/><span>{note.title||'未命名笔记'}</span></button></div>)}</div>}
 </div>;
 });}
 return <nav className="folder-nav folder-tree" aria-label="文件夹与笔记">
  <div>
   <div className={`folder-tree-row ${filter.kind==='unfiled'?'selected':''}`}>{batch&&<input type="checkbox" aria-label="选择未分类笔记" checked={unfiledChecked} ref={el=>{if(el)el.indeterminate=unfiledIndeterminate;}} onChange={()=>batch.toggleNotes?.(unfiled.map(n=>n.id),!unfiledChecked)}/>}{unfiled.length>0&&<button className="folder-expand" aria-label={`${unfiledOpen?'收起':'展开'} 未分类`} aria-expanded={unfiledOpen} onClick={()=>setExpanded(ids=>unfiledOpen?ids.filter(id=>id!==UNFILED_KEY):[...ids,UNFILED_KEY])}>{unfiledOpen?'▾':'▸'}</button>}
   <button title="未分类" className={filter.kind==='unfiled'?'active':''} onClick={()=>{choose({kind:'unfiled'});if(unfiled.length&&!unfiledOpen)setExpanded(ids=>[...ids,UNFILED_KEY]);}}><FolderIcon size={16}/><span className="nav-label">未分类</span><small>{unfiled.length}</small></button></div>
   {unfiledOpen&&<div className="folder-tree-contents" aria-label="未分类的内容">{unfiled.map(note=><div className={`tree-note-selection ${noteInSelection(note)?'selected':''}`} key={note.id}>{batch&&<input type="checkbox" aria-label={`选择笔记 ${note.title}`} checked={batch.notes.includes(note.id)} onChange={()=>batch.toggle("notes",note.id)}/>}<button className={`folder-tree-note ${selectedId===note.id?'active':''}`} style={{paddingLeft:22}} title={note.title||'未命名笔记'} aria-current={selectedId===note.id?'page':undefined} onClick={()=>openNote(note)}><FileTextIcon size={14}/><span>{note.title||'未命名笔记'}</span></button></div>)}</div>}
  </div>
  {nodes(null,0)}</nav>;
}

// Tree rows do not display bodies, timestamps or cloud bindings.
export const FolderTree=memo(FolderTreeView,(a,b)=>a.workspace.folders===b.workspace.folders && a.selectedId===b.selectedId && JSON.stringify(a.filter)===JSON.stringify(b.filter) && JSON.stringify(a.batch&&{notes:a.batch.notes,folders:a.batch.folders})===JSON.stringify(b.batch&&{notes:b.batch.notes,folders:b.batch.folders}) && a.workspace.notes.length===b.workspace.notes.length && a.workspace.notes.every((n,i)=>{const m=b.workspace.notes[i];return n.id===m.id&&n.title===m.title&&n.folderId===m.folderId&&n.deletedAt===m.deletedAt;}));
