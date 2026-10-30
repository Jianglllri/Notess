import type {Workspace} from '../src/types';
import {mergeWorkspace, validateWorkspace} from '../src/lib/workspace';
import {folderLabel} from '../src/lib/folders';

/** One-time migration: identical notes collapse; differing versions remain separate. */
export function migrateWorkspace(current: Workspace | null, incoming: Workspace): Workspace {
  incoming=validateWorkspace(incoming);
  if(!current)return incoming;
  const signature=(w:Workspace,n:Workspace['notes'][number])=>JSON.stringify([
    n.title,n.content,n.folderId?folderLabel(w.folders,n.folderId):'',n.tags,n.pinned,n.deletedAt,n.visibility,
  ]);
  const existing=new Set(current.notes.map(n=>signature(current!,n)));
  const notes=incoming.notes.filter(n=>!existing.has(signature(incoming,n)));
  if(!notes.length)return current;
  return mergeWorkspace(current,{...incoming,notes});
}
