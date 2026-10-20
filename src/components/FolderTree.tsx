import {useState} from 'react';
import {FileTextIcon,FolderIcon,DotsThreeIcon} from '@phosphor-icons/react';
import type {Filter,Note,Workspace} from '../types';
import {insideFolder} from '../lib/folders';
export function FolderTree({workspace,filter,choose,openNote,selectedId,manage}:{workspace:Workspace;filter:Filter;choose:(f:Filter)=>void;openNote:(note:Note)=>void;selectedId:string|null;manage:(id:string,name:string)=>void}) {
 const [expanded,setExpanded]=useState<string[]>([]);
 function nodes(parent:string|null,depth:number):React.ReactNode{return workspace.folders.filter(f=>(f.parentId||null)===parent).map(f=>{
 const children=workspace.folders.some(c=>c.parentId===f.id);
 const files=workspace.notes.filter(n=>!n.deletedAt&&n.folderId===f.id).sort((a,b)=>a.title.localeCompare(b.title,'zh-CN',{numeric:true}));
 const expandable=children||files.length>0;const open=expanded.includes(f.id);
 return <div key={f.id}>
   <div className="folder-tree-row" style={{paddingLeft:depth*12}}>{expandable&&<button className="folder-expand" aria-label={`${open?'收起':'展开'} ${f.name}`} aria-expanded={open} onClick={()=>setExpanded(ids=>open?ids.filter(id=>id!==f.id):[...ids,f.id])}>{open?'▾':'▸'}</button>}
   <button title={f.name} className={filter.kind==='folder'&&filter.id===f.id?'active':''} onClick={()=>{choose({kind:'folder',id:f.id});if(expandable&&!open)setExpanded(ids=>[...ids,f.id]);}}><FolderIcon size={16}/><span className="nav-label">{f.name}</span><small>{workspace.notes.filter(n=>!n.deletedAt&&insideFolder(workspace.folders,n.folderId,f.id)).length}</small></button><button className="folder-manage" aria-label={`管理文件夹 ${f.name}`} title="管理文件夹：移动、改名或删除" onClick={()=>manage(f.id,f.name)}><DotsThreeIcon size={18}/></button></div>
   {open&&<div className="folder-tree-contents" aria-label={`${f.name}的内容`}>{children&&nodes(f.id,depth+1)}{files.map(note=><button key={note.id} className={`folder-tree-note ${selectedId===note.id?'active':''}`} style={{paddingLeft:(depth+1)*12+22}} title={note.title||'未命名笔记'} aria-current={selectedId===note.id?'page':undefined} onClick={()=>openNote(note)}><FileTextIcon size={14}/><span>{note.title||'未命名笔记'}</span></button>)}</div>}
 </div>;
 });}
 return <nav className="folder-nav folder-tree" aria-label="文件夹与笔记">{nodes(null,0)}</nav>;
}
