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
