import type {Workspace} from '../types';
import {insideFolder} from './folders';
import {sourceKey} from './sync';
import {pruneUnreferencedAssets} from './workspace';
export interface Selection {notes:string[];folders:string[]}
export function selectionContents(w:Workspace,s:Selection) {
 const folders=new Set(w.folders.filter(f=>s.folders.some(id=>insideFolder(w.folders,f.id,id))).map(f=>f.id));
 const notes=new Set(w.notes.filter(n=>s.notes.includes(n.id)||(n.folderId&&folders.has(n.folderId))).map(n=>n.id));
 return {folders,notes};
}
export function bulkTrash(w:Workspace,s:Selection,at=new Date().toISOString()):Workspace {
 const selected=selectionContents(w,s);
 return {...w,folders:w.folders.filter(f=>!selected.folders.has(f.id)),notes:w.notes.map(n=>selected.notes.has(n.id)?{...n,deletedAt:n.deletedAt||at,updatedAt:at,...(n.folderId&&selected.folders.has(n.folderId)?{folderId:null,folderPath:[]}: {})}:n)};
}
export function bulkMove(w:Workspace,s:Selection,target:string|null,at=new Date().toISOString()):Workspace {
 const selected=selectionContents(w,s);
 if(target&&(!w.folders.some(f=>f.id===target)||selected.folders.has(target)))throw Error('不能移入所选文件夹自身或其子目录。');
 const roots=w.folders.filter(f=>selected.folders.has(f.id)&&!selected.folders.has(f.parentId||''));
 const occupied=new Set(w.folders.filter(f=>(f.parentId||null)===target&&!roots.some(r=>r.id===f.id)).map(f=>f.name));
 for(const root of roots){if(occupied.has(root.name))throw Error(`目标位置已有同名文件夹「${root.name}」，请先改名。`);occupied.add(root.name);}
 return {...w,folders:w.folders.map(f=>roots.some(r=>r.id===f.id)?{...f,parentId:target}:f),notes:w.notes.map(n=>selected.notes.has(n.id)?{...n,updatedAt:at,...(s.notes.includes(n.id)&&!selected.folders.has(n.folderId||'')?{folderId:target}: {})}:n)};
}
export function allSelectable(w:Workspace):Selection {
 return {notes:w.notes.filter(n=>!n.deletedAt).map(n=>n.id),folders:w.folders.map(f=>f.id)};
}
export function invertSelection(w:Workspace,s:Selection):Selection {
 const all=allSelectable(w);
 return {notes:all.notes.filter(id=>!s.notes.includes(id)),folders:all.folders.filter(id=>!s.folders.includes(id))};
}
export function isAllSelected(w:Workspace,s:Selection):boolean {
 const all=allSelectable(w);
 return all.notes.every(id=>s.notes.includes(id)) && all.folders.every(id=>s.folders.includes(id));
}
export function toggleFolderSelection(w:Workspace,s:Selection,folderId:string):Selection {
 const select=!s.folders.includes(folderId);
 const folderIds=new Set(w.folders.filter(f=>insideFolder(w.folders,f.id,folderId)).map(f=>f.id));
 const noteIds=w.notes.filter(n=>!n.deletedAt&&n.folderId&&folderIds.has(n.folderId)).map(n=>n.id);
 if(select)return {folders:[...new Set([...s.folders,...folderIds])],notes:[...new Set([...s.notes,...noteIds])]};
 return {folders:s.folders.filter(id=>!folderIds.has(id)),notes:s.notes.filter(id=>!noteIds.includes(id))};
}
export function emptyTrash(w:Workspace,exclude:string[]=[]):Workspace {
 const excludeSet=new Set(exclude);
 const trashed=w.notes.filter(n=>n.deletedAt&&!excludeSet.has(n.id));
 if(!trashed.length)return w;
 const ignored=new Set(w.ignoredSources||[]);
 for(const n of trashed){
  if(n.github)ignored.add(sourceKey(n.github));
  if(n.sourceUrl)ignored.add(n.sourceUrl);
  if(n.source)ignored.add(sourceKey(n.source));
 }
 return pruneUnreferencedAssets({...w,notes:w.notes.filter(n=>!n.deletedAt||excludeSet.has(n.id)),ignoredSources:[...ignored]});
}
