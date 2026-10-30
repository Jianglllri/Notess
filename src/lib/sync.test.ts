import {expect,it} from 'vitest';
import {mergeRemote} from './sync';
import {createWorkspace} from './workspace';
import {DEFAULT_REPO,parseGithub,encodeNote,decodeNote} from './github';
import type {ImportedDoc} from './github';
const doc:ImportedDoc={title:'远端笔记',content:'原文',category:'学习',sourceUrl:DEFAULT_REPO+'/blob/main/a.md',github:{url:DEFAULT_REPO,branch:'main',path:'a.md',sha:'a'.repeat(40),format:'md',syncedAt:new Date().toISOString(),baseContent:'原文'}};
it('normalizes vscode.dev links without publishing back to the source repository',()=>{
 expect(parseGithub('https://vscode.dev/github/RiddleGo/agent-interview-300?vscode-lang=zh-cn').repo).toBe('agent-interview-300');
 const external={...doc,github:{...doc.github,url:'https://github.com/RiddleGo/agent-interview-300'}};
 const merged=mergeRemote(createWorkspace(),[external]);
 expect(merged.workspace.notes.at(-1)?.github).toBeUndefined();
 expect(mergeRemote(merged.workspace,[external]).added).toBe(0);
});
it('pulls idempotently, updates clean notes, and preserves dirty local edits',()=>{
 const first=mergeRemote(createWorkspace(),[doc]);
 expect(first.added).toBe(1);expect(mergeRemote(first.workspace,[doc]).added).toBe(0);
 const remote={...doc,content:'远端新版',github:{...doc.github,sha:'b'.repeat(40),baseContent:'远端新版'}};
 expect(mergeRemote(first.workspace,[remote]).workspace.notes.at(-1)?.content).toBe('远端新版');
 first.workspace.notes.at(-1)!.content='本地修改';
 const conflict=mergeRemote(first.workspace,[remote]);
 expect(conflict.conflicts).toBe(1);expect(conflict.workspace.notes.at(-1)?.content).toBe('本地修改');
 expect(conflict.workspace.notes.at(-1)?.github?.sha).toBe(doc.github.sha);
});
it('does not resurrect deleted local notes',()=>{
 const first=mergeRemote(createWorkspace(),[doc]);first.workspace.notes.at(-1)!.deletedAt=new Date().toISOString();
 expect(mergeRemote(first.workspace,[doc]).added).toBe(0);
});
it('roundtrips title, tags and body without executable metadata',()=>{
 const note={title:'标题 --> 你好',content:'## Q: 问题\n答案',tags:['AI']};
 expect(decodeNote(encodeNote(note),'test.md')).toEqual(note);
});
it('groups imported projects, isolates same-named directories, and migrates once',()=>{
 const a={...doc,category:'docs',github:{...doc.github,path:'imports/alpha/docs/a.md'}};
 const b={...doc,category:'docs',github:{...doc.github,path:'imports/beta/docs/b.md'},sourceUrl:DEFAULT_REPO+'/blob/main/imports/beta/docs/b.md'};
 const w=createWorkspace();w.folders.push({id:'old',name:'docs',createdAt:new Date().toISOString()});
 w.notes.push({...w.notes[0],id:'existing',folderId:'old',github:a.github,content:'local edit',pinned:false});
 const first=mergeRemote(w,[a,b]).workspace;
 const alpha=first.folders.find(f=>f.name==='alpha')!;
 const beta=first.folders.find(f=>f.name==='beta')!;
 expect(alpha.parentId).toBeNull();expect(beta.parentId).toBeNull();
 const note=first.notes.find(n=>n.id==='existing')!;
 expect(first.folders.find(f=>f.id===note.folderId)?.parentId).toBe(alpha.id);
 expect(note.content).toBe('local edit');
 expect(first.folders.filter(f=>f.name==='docs')).toHaveLength(2);
 note.folderId='learning';
 const again=mergeRemote(first,[a,b]);expect(again.added).toBe(0);
 expect(again.workspace.notes.find(n=>n.id==='existing')?.folderId).toBe('learning');
});
it('does not recreate removed folders on refresh, but creates folders for new documents',()=>{
 const first=mergeRemote(createWorkspace(),[doc]).workspace;
 const note=first.notes.at(-1)!;
 first.folders=first.folders.filter(f=>f.id!==note.folderId);
 note.folderId=null;
 const refreshed=mergeRemote(first,[{...doc,content:'新版',github:{...doc.github,sha:'b'.repeat(40)}}]).workspace;
 expect(refreshed.folders).toEqual(first.folders);
 expect(refreshed.notes.at(-1)?.folderId).toBeNull();
 expect(refreshed.notes.at(-1)?.content).toBe('新版');
 const added=mergeRemote(refreshed,[{...doc,github:{...doc.github,path:'new.md'}}]);
 expect(added.added).toBe(1);
 expect(added.workspace.folders.length).toBe(first.folders.length+1);
});
it('refreshes source-derived titles but preserves custom names',()=>{
 const external={...doc,title:'旧标题',content:'# 旧标题',github:{...doc.github,url:'https://github.com/example/learning'},sourceUrl:'https://github.com/example/learning/blob/main/a.md'};
 const first=mergeRemote(createWorkspace(),[external]).workspace;
 const updated={...external,title:'新标题',content:'# 新标题',github:{...external.github,sha:'b'.repeat(40)}};
 expect(mergeRemote(first,[updated]).workspace.notes.at(-1)?.title).toBe('新标题');
 first.notes.at(-1)!.title='自己命名';
 expect(mergeRemote(first,[updated]).workspace.notes.at(-1)?.title).toBe('自己命名');
});
