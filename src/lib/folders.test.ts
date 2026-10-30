import {expect,it} from 'vitest';
import {createWorkspace,validateWorkspace,filterNotes,mergeWorkspace} from './workspace';
import {folderLabel,trashFolder} from './folders';
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

it('trashes nested contents without losing bodies or cloud bindings, leaving siblings intact', () => {
 const w=createWorkspace();const at='2026-10-20T12:00:00.000Z';
 const root=w.folders[0].id;
 w.folders.push({id:'nested',name:'嵌套',parentId:root,createdAt:at},{id:'deep',name:'深层',parentId:'nested',createdAt:at});
 const note={...w.notes[0],folderId:'deep',folderPath:['旧目录'],github:{url:'https://github.com/a/b',branch:'main',path:'note.md',sha:'a'.repeat(40),format:'md' as const,syncedAt:at}};
 w.notes=[note,{...note,id:'direct',folderId:root},{...note,id:'old-trash',folderId:'nested',deletedAt:'2026-10-19T00:00:00.000Z'},{...note,id:'outside',folderId:null}];
 const result=trashFolder(w,root,at);
 expect(result.folders.some(f=>[root,'nested','deep'].includes(f.id))).toBe(false);
 for(const n of result.notes.slice(0,3)) {
  expect(n.deletedAt).toBeTruthy();expect(n.folderId).toBeNull();expect(n.folderPath).toEqual([]);
  expect(n.content).toBe(note.content);expect(n.github).toEqual(note.github);expect(n.updatedAt).toBe(at);
 }
 expect(result.notes[2].deletedAt).toBe('2026-10-19T00:00:00.000Z');
 expect(result.notes[3]).toBe(w.notes[3]);
 expect(w.notes[0].deletedAt).toBeNull();
 expect(()=>validateWorkspace(result)).not.toThrow();
 expect(trashFolder(result,root,at)).toBe(result);
});
