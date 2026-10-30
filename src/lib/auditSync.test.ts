import {it,expect} from 'vitest';
import {createWorkspace,newNote} from './workspace';
import {encodeNote,decodeNote,DEFAULT_REPO} from './github';
import {needsUpload} from './schedule';
import {mergeRemote} from './sync';
import type {ImportedDoc} from './github';
const source={url:'https://github.com/owner/source',branch:'main',path:'a.md',sha:'a'.repeat(40),baseContent:'original'};
const external:ImportedDoc={title:'A',content:'new',sourceUrl:`${source.url}/blob/main/a.md`,visibility:'private',category:'',github:{...source,sha:'b'.repeat(40),format:'md',syncedAt:new Date().toISOString()}};
it('compares empty body copies without changing their reference semantics',()=>{
 const n={...newNote(),source,content:''};const raw=encodeNote(n);
 const note={...n,github:{url:DEFAULT_REPO,branch:'main',path:'a.md',sha:'a'.repeat(40),format:'md' as const,syncedAt:n.updatedAt,baseSnapshot:raw}};
 expect(decodeNote(raw,'a').referenceOnly).toBe(false);expect(needsUpload(note)).toBe(false);
 expect(needsUpload({...note,content:'original'})).toBe(true);
});
it('tightens privacy for every source copy and refreshes active references past deleted/full copies',()=>{
 const base={...newNote(),source,content:'original',visibility:'public' as const};
 const notes=[{...base,deletedAt:base.updatedAt},{...base,id:'copy',syncMode:'full' as const},{...base,id:'active'}];
 const result=mergeRemote({...createWorkspace(),notes},[external]);
 expect(result.workspace.notes.every(n=>n.visibility==='private')).toBe(true);
 expect(result.workspace.notes[2].content).toBe('new');expect(result.workspace.notes[1].content).toBe('original');
});
it('never rolls newer pending sources back while hydrating an older missing record',()=>{
 const old={...source,baseContent:''};const n={...newNote(),source:{...source,sha:'b'.repeat(40),baseContent:'new',missing:true},content:'new',visibility:'public' as const};
 const raw=encodeNote({...n,source:old,content:''});
 const github={url:DEFAULT_REPO,branch:'main',path:'a.md',sha:'c'.repeat(40),format:'md' as const,syncedAt:n.updatedAt,baseSnapshot:raw};
 const doc:ImportedDoc={title:n.title,content:'original',source,sourceUrl:'',category:'',github};
 const result=mergeRemote({...createWorkspace(),notes:[{...n,github}]},[doc]);
 expect(result.conflicts).toBe(1);expect(result.workspace.notes[0].content).toBe('new');expect(result.workspace.notes[0].source?.sha).toBe('b'.repeat(40));
});
