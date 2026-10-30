import {expect,it} from 'vitest';
import {createWorkspace,validateWorkspace} from './workspace';
import {configureImport,changeImportMode} from './importPolicy';
import {mergeRemote,withFolderPaths} from './sync';
import {encodeNote,decodeNote} from './github';
import type {ImportedDoc} from './github';
const doc:ImportedDoc={title:'导入',content:'正文',sourceUrl:'https://github.com/a/b/blob/main/doc.md',category:'b',github:{url:'https://github.com/a/b',branch:'main',path:'doc.md',sha:'a'.repeat(40),format:'md',syncedAt:new Date().toISOString()}};
it('places reference imports under the library and preserves that mode in cloud metadata',()=>{
 const w=createWorkspace(),merged=mergeRemote(w,[doc]).workspace;
 const configured=withFolderPaths(configureImport(w,merged,[doc],'reference'));
 const n=configured.notes.at(-1)!;expect(n.folderPath).toEqual(['来源清单','a/b']);
 expect(decodeNote(encodeNote(n),'doc.md').syncMode).toBe('reference');
 expect(decodeNote(encodeNote(n),'doc.md').content).toBe('');expect(()=>validateWorkspace(configured)).not.toThrow();
});
it('full mode preserves unedited body and prevents an external refresh replacing it',()=>{
 const w=createWorkspace();const merged=configureImport(w,mergeRemote(w,[doc]).workspace,[doc],'full');
 const n=merged.notes.at(-1)!;expect(decodeNote(encodeNote(n),'doc.md').content).toBe('正文');
 const refreshed=mergeRemote(merged,[{...doc,content:'上游修改',github:{...doc.github,sha:'b'.repeat(40)}}]);
 expect(refreshed.workspace.notes.at(-1)!.content).toBe('正文');
});
it('does not discard modified contents when changing to reference mode',()=>{
 const w=mergeRemote(createWorkspace(),[doc]).workspace;w.notes.at(-1)!.content='自己的修改';
 expect(()=>changeImportMode(w,[w.notes.at(-1)!.id],'reference')).toThrow('正文已修改');
 expect(decodeNote(encodeNote(w.notes.at(-1)!),'doc.md').content).toBe('自己的修改');
});
