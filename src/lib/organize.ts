import type { Note, Workspace } from '../types';
import { decodeNote } from './github';
import { mergeWorkspace, validateWorkspace } from './workspace';
import { sourceKey, withFolderPaths } from './sync';
function identity(a:Note,b:Note){
 if(a.id===b.id)return true;
 if(a.github&&b.github&&sourceKey(a.github)===sourceKey(b.github))return true;
 if(a.source&&b.source&&sourceKey(a.source)===sourceKey(b.source))return true;
 if(a.sourceUrl&&a.sourceUrl===b.sourceUrl)return true;
 // Known legacy copies of this public project; never match notes by title alone.
 if(b.source?.url==='https://github.com/RiddleGo/agent-interview-300'){
  const path='imports/agent-interview-300/'+b.source.path;
  return (a.github?.url==='https://github.com/Jianglllri/Notess'&&a.github.path===path) || a.sourceUrl===`https://github.com/Jianglllri/Notess/blob/main/${path}`;
 }
 return false;
}
export function organizeWorkspace(current:Workspace,incoming:Workspace){
 current=validateWorkspace(current);
 const prepared=mergeWorkspace({...current,notes:[]},incoming);
 const projects=new Set(incoming.notes.flatMap(n=>[n.github?.url,n.source?.url,n.source?.url==='https://github.com/RiddleGo/agent-interview-300'?'https://github.com/Jianglllri/Notess':undefined].filter((u):u is string=>!!u).map(u=>new URL(u).pathname.slice(1))));
 const notes=[...current.notes];const oldFolders=new Set(current.folders.filter(f=>f.sourceKey&&[...projects].some(p=>f.sourceKey===p||f.sourceKey?.startsWith(p+'/'))).map(f=>f.id));let organized=0,added=0,skipped=0;
 for(const [i,next] of prepared.notes.entries()){
  const original=incoming.notes[i];
  const index=notes.findIndex(n=>identity(n,original));
  if(index<0){if(current.ignoredSources?.includes(next.sourceUrl||'') || (next.github&&current.ignoredSources?.includes(sourceKey(next.github))) || (next.source&&current.ignoredSources?.includes(sourceKey(next.source)))){skipped++;continue;}notes.push({...next,id:original.id});added++;continue;}
  const old=notes[index];
  if(old.visibility&&old.visibility!==next.visibility){skipped++;continue;}
  let oldFolder=old.folderId;while(oldFolder){const f=current.folders.find(f=>f.id===oldFolder);if(!f)break;if(f.sourceKey)oldFolders.add(f.id);oldFolder=f.parentId||null;}
  const originalTitle=old.github?.baseSnapshot?decodeNote(old.github.baseSnapshot,old.github.path).title:old.source?decodeNote(old.source.baseContent,old.source.path).title:next.title;
  notes[index]={...old,title:old.title===originalTitle?next.title:old.title,folderId:next.folderId,folderPath:next.folderPath,tags:[...new Set([...old.tags,...next.tags])].slice(0,30),visibility:next.visibility,source:old.source||next.source,updatedAt:new Date().toISOString()};
  organized++;
 }
 let folders=prepared.folders,removed=true;while(removed){const next=folders.filter(f=>!oldFolders.has(f.id)||notes.some(n=>n.folderId===f.id)||folders.some(c=>c.parentId===f.id));removed=next.length!==folders.length;folders=next;}
 return {workspace:validateWorkspace(withFolderPaths({...prepared,folders,notes})),organized,added,skipped};
}
