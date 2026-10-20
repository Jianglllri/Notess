import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REPO, decodeNote, encodeNote, importGithub } from './github';
import { mergeRemote, withFolderPaths } from './sync';
import { createWorkspace, newNote, validateWorkspace } from './workspace';
import { needsUpload } from './schedule';
import type { ImportedDoc } from './github';
import type { Note } from '../types';
const sha='a'.repeat(40),commit='c'.repeat(40),time='2026-10-19T10:00:00.000Z';
const source={url:'https://github.com/example/questions',branch:'main',path:'docs/q.md',sha,commit,baseContent:'题目原文'};
const external:ImportedDoc={title:'题目',content:'题目原文',category:'docs',sourceUrl:source.url+'/blob/main/docs/q.md',source,github:{...source,format:'md',syncedAt:time}};
function note():Note{return {...newNote(),title:'我的题目',tags:['AI'],folderPath:['题库','基础'],source,content:source.baseContent};}
function own(n:Note,nextSha=sha):ImportedDoc{
 const raw=encodeNote(n),decoded=decodeNote(raw,'q.md');
 return {...decoded,content:decoded.referenceOnly?n.source!.baseContent:decoded.content,source:n.source,category:'notes',sourceUrl:DEFAULT_REPO+'/blob/main/notes/q.md',github:{url:DEFAULT_REPO,branch:'main',path:'notes/q.md',sha:nextSha,format:'md',syncedAt:time,baseSnapshot:raw,baseContent:n.content}};
}
afterEach(()=>vi.unstubAllGlobals());
describe('link-only imported note sync',()=>{
 it('omits unmodified source bodies but uploads personal overrides, including deleted overrides',()=>{
  const n=note();expect(encodeNote(n)).not.toContain('题目原文');expect(decodeNote(encodeNote(n),'q').referenceOnly).toBe(true);
  n.content='个人答案';expect(encodeNote(n)).toContain('个人答案');expect(decodeNote(encodeNote(n),'q').referenceOnly).toBe(false);
  n.deletedAt=time;expect(encodeNote(n)).toContain('个人答案');
  expect(encodeNote(n)).not.toContain('baseContent');
 });
 it('restores folders, tags, pins, body, deletion and restoration on a second device',()=>{
  const n={...note(),pinned:true};let w=withFolderPaths(mergeRemote(createWorkspace(),[own(n)]).workspace);
  let restored=w.notes.at(-1)!;expect(restored.content).toBe(source.baseContent);expect(restored.folderPath).toEqual(n.folderPath);expect(restored.tags).toEqual(['AI']);expect(restored.pinned).toBe(true);expect(needsUpload(restored)).toBe(false);expect(()=>validateWorkspace(w)).not.toThrow();
  const deleted={...n,deletedAt:time};w=withFolderPaths(mergeRemote(w,[own(deleted,'b'.repeat(40))]).workspace);restored=w.notes.at(-1)!;expect(restored.deletedAt).toBe(time);expect(needsUpload(restored)).toBe(false);
  w=withFolderPaths(mergeRemote(w,[own(n,'d'.repeat(40))]).workspace);expect(w.notes.at(-1)!.deletedAt).toBeNull();
 });
 it('recognizes folder moves and metadata changes as pending changes',()=>{
  const n=note();n.github=own(n).github;expect(needsUpload(n)).toBe(false);n.folderPath=['另一个文件夹'];expect(needsUpload(n)).toBe(true);
 });
 it('updates clean source bodies without discarding local overrides or resurrecting deletions',()=>{
  const w=mergeRemote(createWorkspace(),[external]).workspace;
  const updated={...external,content:'新版原文',source:{...source,sha:'b'.repeat(40),baseContent:'新版原文'},github:{...external.github,sha:'b'.repeat(40)}};
  expect(mergeRemote(w,[updated]).workspace.notes.at(-1)!.content).toBe('新版原文');
  w.notes.at(-1)!.content='个人修改';const result=mergeRemote(w,[updated]);expect(result.conflicts).toBe(1);expect(result.workspace.notes.at(-1)!.content).toBe('个人修改');
  w.notes.at(-1)!.deletedAt=time;expect(mergeRemote(w,[updated]).workspace.notes.at(-1)!.deletedAt).toBe(time);
 });
 it('migrates an older imported note conservatively, keeping edits',()=>{
  const w=mergeRemote(createWorkspace(),[external]).workspace;const n=w.notes.at(-1)!;delete n.source;n.content='旧版中做的修改';
  const migrated=mergeRemote(w,[external]).workspace.notes.at(-1)!;expect(migrated.content).toBe('旧版中做的修改');expect(migrated.source?.baseContent).toBe('题目原文');expect(encodeNote(migrated)).toContain('旧版中做的修改');
 });
 for(const fail of [false,true])it(fail?'retains cached text and reports missing sources on failure':'hydrates cloud references using the recorded version',async()=>{
  const raw=encodeNote(note());
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
   if(url.endsWith('/repos/Jianglllri/Notess'))return {ok:true,json:async()=>({default_branch:'main'})};
   if(url.includes('/commits/'))return {ok:true,json:async()=>({sha:commit})};
   if(url.includes('/git/trees/'))return {ok:true,json:async()=>({tree:[{path:'notes/q.md',type:'blob',size:raw.length,sha}]})};
   if(url.includes('Jianglllri/Notess'))return {ok:true,text:async()=>raw};
   expect(url).toContain(commit+'/docs/q.md');return {ok:!fail,status:404,text:async()=>source.baseContent};
  }));
  const [doc]=await importGithub(DEFAULT_REPO,'',undefined,fail?[{path:'notes/q.md',sha,content:raw,localContent:'离线缓存'}]:[]);
  expect(doc.content).toBe(fail?'离线缓存':source.baseContent);expect(doc.source?.missing).toBe(fail?true:undefined);expect(doc.github.baseSnapshot).toBe(raw);
 });
});

it('replaces a stale offline cache after retry, while preserving edits made during the failure',()=>{
 const w=mergeRemote(createWorkspace(),[external]).workspace;
 const n=w.notes.at(-1)!;n.source={...source,missing:true};
 const fresh={...external,content:'恢复后的正文',source:{...source,baseContent:'恢复后的正文'}};
 expect(mergeRemote(w,[fresh]).workspace.notes.at(-1)!.content).toBe('恢复后的正文');
 n.content='断网时个人答案';expect(mergeRemote(w,[fresh]).workspace.notes.at(-1)!.content).toBe('断网时个人答案');
 n.content='';expect(mergeRemote(w,[fresh]).workspace.notes.at(-1)!.content).toBe('');
});
it('keeps local folder moves when the remote record is unchanged',()=>{
 const n=note();let w=withFolderPaths(mergeRemote(createWorkspace(),[own(n)]).workspace);
 const local=w.notes.at(-1)!;local.folderId=null;w=withFolderPaths(w);
 const next=mergeRemote(w,[own(n)]);expect(next.workspace.notes.at(-1)!.folderId).toBeNull();expect(next.workspace.folders).toEqual(w.folders);
});

it('links an independently imported source to its cloud record without duplicates or losing local deletions',()=>{
 const w=withFolderPaths(mergeRemote(createWorkspace(),[external]).workspace);
 const local=w.notes.at(-1)!;local.deletedAt=time;
 const merged=mergeRemote(w,[own(note())]);
 expect(merged.workspace.notes).toHaveLength(w.notes.length);expect(merged.added).toBe(0);
 const adopted=merged.workspace.notes.at(-1)!;expect(adopted.id).toBe(local.id);expect(adopted.deletedAt).toBe(time);expect(adopted.github?.path).toBe('notes/q.md');expect(needsUpload(adopted)).toBe(true);
});
