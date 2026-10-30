import type { Folder } from '../types';
export function insideFolder(folders:Folder[], id:string|null, parent:string):boolean {
  const seen=new Set<string>();
  while(id&&!seen.has(id)){if(id===parent)return true;seen.add(id);id=folders.find(f=>f.id===id)?.parentId||null;}
  return false;
}
export function folderLabel(folders:Folder[],id:string):string {
  const parts:string[]=[];const seen=new Set<string>();let cursor:string|null=id;
  while(cursor&&!seen.has(cursor)){seen.add(cursor);const f=folders.find(f=>f.id===cursor);if(!f)break;parts.unshift(f.name);cursor=f.parentId||null;}
  return parts.join(' / ');
}

/** Remove a folder tree while retaining recoverable note tombstones for sync. */
export function trashFolder(workspace: import('../types').Workspace, folderId: string, at = new Date().toISOString()): import('../types').Workspace {
  if (!workspace.folders.some(folder => folder.id === folderId)) return workspace;
  const removed = new Set(workspace.folders.filter(folder => insideFolder(workspace.folders, folder.id, folderId)).map(folder => folder.id));
  return {
    ...workspace,
    folders: workspace.folders.filter(folder => !removed.has(folder.id)),
    notes: workspace.notes.map(note => note.folderId && removed.has(note.folderId)
      ? { ...note, folderId: null, folderPath: [], deletedAt: note.deletedAt || at, updatedAt: at }
      : note),
  };
}
