import {expect,it} from 'vitest';
import {createWorkspace,validateWorkspace,filterNotes,mergeWorkspace} from './workspace';
import {folderLabel} from './folders';
it('filters descendants and retains hierarchy through backup merging',()=>{
 const w=createWorkspace();w.folders.push({id:'child',name:'目录',parentId:'learning',createdAt:w.updatedAt});w.notes[0].folderId='child';
 expect(filterNotes(w,{kind:'folder',id:'learning'},'').some(n=>n.id==='welcome')).toBe(true);
 const merged=mergeWorkspace(createWorkspace(),w);const child=merged.folders.find(f=>f.name==='目录')!;
 expect(folderLabel(merged.folders,child.id)).toBe('学习笔记 / 目录');expect(()=>validateWorkspace(merged)).not.toThrow();
});
it('rejects folder cycles and missing parents',()=>{
 const w=createWorkspace();w.folders[0].parentId=w.folders[0].id;expect(()=>validateWorkspace(w)).toThrow();
 w.folders[0].parentId='missing';expect(()=>validateWorkspace(w)).toThrow();
});
it('supports repeated folder moves without changing note membership or descendants',()=>{
 const w=createWorkspace();
 const root=w.folders[0];const target=w.folders[1];
 w.folders.push({id:'moving-child',name:'子目录',parentId:root.id,createdAt:w.updatedAt});
 const before=w.notes.map(n=>({id:n.id,folderId:n.folderId,content:n.content}));
 root.parentId=target.id;
 expect(()=>validateWorkspace(w)).not.toThrow();
 expect(folderLabel(w.folders,'moving-child')).toBe(`${target.name} / ${root.name} / 子目录`);
 root.parentId=null;
 expect(()=>validateWorkspace(w)).not.toThrow();
 expect(folderLabel(w.folders,'moving-child')).toBe(`${root.name} / 子目录`);
 expect(w.notes.map(n=>({id:n.id,folderId:n.folderId,content:n.content}))).toEqual(before);
});
