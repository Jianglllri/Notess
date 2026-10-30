import {expect,it} from 'vitest';
import {allSelectable,bulkMove,bulkTrash,emptyTrash,invertSelection,isAllSelected,selectionContents,toggleFolderSelection} from './bulk';
import {createWorkspace,validateWorkspace} from './workspace';
import {withFolderPaths} from './sync';
it('moves parent and child selection once, carries contained notes and supports another move',()=>{
 const w=createWorkspace();w.folders.push({id:'child',name:'子级',parentId:'learning',createdAt:w.updatedAt});w.notes[0].folderId='child';
 const s={folders:['learning','child'],notes:[w.notes[0].id,'idea']};
 const moved=withFolderPaths(bulkMove(w,s,'snippets'));
 expect(moved.folders.find(f=>f.id==='child')?.parentId).toBe('learning');
 expect(moved.notes[0].folderPath).toEqual(['代码片段','学习笔记','子级']);
 expect(moved.notes.find(n=>n.id==='idea')?.folderId).toBe('snippets');
 const again=withFolderPaths(bulkMove(moved,{folders:['learning'],notes:[]},null));
 expect(again.notes[0].folderPath).toEqual(['学习笔记','子级']);expect(()=>validateWorkspace(again)).not.toThrow();
});
it('rejects self, descendant, missing destination and duplicate folder names',()=>{
 const w=createWorkspace();w.folders.push({id:'child',name:'子级',parentId:'learning',createdAt:w.updatedAt});
 for(const id of ['learning','child','missing'])expect(()=>bulkMove(w,{folders:['learning'],notes:[]},id)).toThrow();
 w.folders.push({id:'same',name:'学习笔记',parentId:'snippets',createdAt:w.updatedAt});
 expect(()=>bulkMove(w,{folders:['learning'],notes:[]},'snippets')).toThrow('同名');
});
it('soft deletes a mixed selection recursively without affecting unrelated notes',()=>{
 const w=createWorkspace();const s={folders:['learning'],notes:['welcome','idea']};
 const ids=selectionContents(w,s);expect(ids.notes.size).toBe(3);
 const result=withFolderPaths(bulkTrash(w,s));expect(result.notes.filter(n=>n.deletedAt)).toHaveLength(3);
 expect(result.notes.find(n=>n.id==='code')).toEqual({...w.notes.find(n=>n.id==='code'),folderPath:['代码片段']});
 expect(result.notes.find(n=>n.id==='welcome')?.folderId).toBeNull();expect(()=>validateWorkspace(result)).not.toThrow();
 expect(w.notes.every(n=>!n.deletedAt)).toBe(true);
});
it('selects all non-deleted notes and all folders, then inverts and detects full selection',()=>{
 const w=createWorkspace();const all=allSelectable(w);
 expect(all.folders).toEqual(['learning','snippets','ideas']);
 expect(all.notes).toEqual(['welcome','markdown','code','idea']);
 expect(isAllSelected(w,all)).toBe(true);
 const inverted=invertSelection(w,{notes:['welcome'],folders:['learning']});
 expect(inverted.notes).toEqual(['markdown','code','idea']);
 expect(inverted.folders).toEqual(['snippets','ideas']);
 expect(isAllSelected(w,{notes:['welcome'],folders:['learning']})).toBe(false);
});
it('excludes trashed notes from select-all and invert',()=>{
 const w=createWorkspace();w.notes[0]={...w.notes[0],deletedAt:w.updatedAt};
 const all=allSelectable(w);
 expect(all.notes).not.toContain('welcome');expect(all.notes).toHaveLength(3);
 expect(isAllSelected(w,all)).toBe(true);
 const inverted=invertSelection(w,{notes:[],folders:[]});
 expect(inverted.notes).toEqual(all.notes);expect(inverted.folders).toEqual(all.folders);
});
it('toggles a folder together with its descendants and contained notes',()=>{
 const w=createWorkspace();w.folders.push({id:'child',name:'子级',parentId:'learning',createdAt:w.updatedAt});w.notes[0].folderId='child';
 const on=toggleFolderSelection(w,{notes:[],folders:[]},'learning');
 expect(on.folders).toEqual(expect.arrayContaining(['learning','child']));
 expect(on.notes).toEqual(expect.arrayContaining(['welcome','markdown']));
 const off=toggleFolderSelection(w,on,'learning');
 expect(off.folders).toEqual([]);expect(off.notes).toEqual([]);
});
it('empties trash permanently while keeping live notes',()=>{
 const w=createWorkspace();w.notes[0]={...w.notes[0],deletedAt:w.updatedAt};w.notes[1]={...w.notes[1],deletedAt:w.updatedAt};
 const result=emptyTrash(w);
 expect(result.notes.map(n=>n.id)).toEqual(['code','idea']);
 expect(w.notes).toHaveLength(4);expect(()=>validateWorkspace(result)).not.toThrow();
});
it('keeps excluded trashed notes during empty',()=>{
 const w=createWorkspace();w.notes[0]={...w.notes[0],deletedAt:w.updatedAt};w.notes[1]={...w.notes[1],deletedAt:w.updatedAt};
 const result=emptyTrash(w,['welcome']);
 expect(result.notes.some(n=>n.id==='welcome'&&n.deletedAt)).toBe(true);
 expect(result.notes.some(n=>n.id==='markdown')).toBe(false);
});
