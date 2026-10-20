import { expect, it } from 'vitest';
import { decodeNote, encodeNote, DEFAULT_REPO } from './github';
import type { ImportedDoc } from './github';
import { mergeRemote, sourceKey } from './sync';
import { createWorkspace, filterNotes, validateWorkspace, mergeWorkspace } from './workspace';
import { needsUpload } from './schedule';
const at='2026-10-19T09:00:00.000Z';
function doc(sha:string, deletedAt?:string, content='正文'):ImportedDoc {
 const decoded=decodeNote(encodeNote({title:'跨设备笔记',tags:['学习'],content,deletedAt}),'note.md');
 return {...decoded,category:'notes',sourceUrl:DEFAULT_REPO+'/blob/main/notes/shared.md',github:{url:DEFAULT_REPO,branch:'main',path:'notes/shared.md',sha:sha.repeat(40),format:'md',syncedAt:at,baseSnapshot:encodeNote(decoded),baseContent:content}};
}
it('syncs additions, deletion and restoration across independent workspaces without duplicates',()=>{
 const a=mergeRemote(createWorkspace(),[doc('a')]).workspace;
 let b=mergeRemote(createWorkspace(),[doc('a')]).workspace;
 const note=a.notes.at(-1)!;note.deletedAt=at;
 expect(needsUpload(note)).toBe(true);
 const deleted=doc('b',at);note.github=deleted.github;
 expect(needsUpload(note)).toBe(false);
 b=mergeRemote(b,[deleted]).workspace;
 expect(b.notes.at(-1)?.deletedAt).toBe(at);
 expect(filterNotes(b,{kind:'all'},'跨设备')).toHaveLength(0);
 expect(filterNotes(b,{kind:'trash'},'跨设备')).toHaveLength(1);
 expect(needsUpload(b.notes.at(-1)!)).toBe(false);
 note.deletedAt=null;
 expect(needsUpload(note)).toBe(true);
 b=mergeRemote(b,[doc('c')]).workspace;
 expect(b.notes.at(-1)?.deletedAt).toBeNull();
 expect(mergeRemote(b,[doc('c')]).added).toBe(0);
 expect(()=>validateWorkspace(b)).not.toThrow();
});
it('does not display a previously deleted remote note on a new device',()=>{
 const w=mergeRemote(createWorkspace(),[doc('b',at)]).workspace;
 expect(filterNotes(w,{kind:'all'},'跨设备')).toHaveLength(0);
 expect(filterNotes(w,{kind:'trash'},'跨设备')).toHaveLength(1);
 expect(w.folders.some(f=>f.sourceKey)).toBe(false);
});
it('preserves unsynced content and metadata when remote deletion arrives',()=>{
 for(const field of ['content','title','tags'] as const){
 const w=mergeRemote(createWorkspace(),[doc('a')]).workspace;
 const n=w.notes.at(-1)!;
 if(field==='tags')n.tags=['本地标签'];else n[field]='本地修改';
 const result=mergeRemote(w,[doc('b',at)]);
 expect(result.conflicts).toBe(1);expect(result.workspace.notes.at(-1)?.deletedAt).toBeNull();
 expect(result.workspace.notes.at(-1)?.github?.sha).toBe('a'.repeat(40));
 }
});
it('preserves a pending local deletion against remote edits and cached original data',()=>{
 const w=mergeRemote(createWorkspace(),[doc('a')]).workspace;w.notes.at(-1)!.deletedAt=at;
 expect(mergeRemote(w,[doc('a')]).workspace.notes.at(-1)?.deletedAt).toBe(at);
 expect(mergeRemote(w,[doc('b',undefined,'远端修改')]).conflicts).toBe(1);
});
it('persists permanent deletion suppression through validation and backup merge',()=>{
 const w=createWorkspace();w.ignoredSources=[sourceKey(doc('a').github)];
 const restored=validateWorkspace(JSON.parse(JSON.stringify(w)));
 expect(mergeRemote(restored,[doc('b',at)]).added).toBe(0);
 expect(mergeRemote(restored,[doc('c')]).added).toBe(0);
 const merged=mergeWorkspace(createWorkspace(),restored);
 expect(merged.ignoredSources).toEqual(w.ignoredSources);
});
it('ignores malformed deletion markers in ordinary Markdown',()=>{
 expect(decodeNote('<!-- zhiye:{"deletedAt":"not a date"} -->\n正文','a.md').deletedAt).toBeUndefined();
});
