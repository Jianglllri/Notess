import {it,expect} from 'vitest';
import {createWorkspace,newNote,validateWorkspace,MAX_WORKSPACE_BYTES} from './workspace';
import {editContent,rememberWorkspaceSize} from './editContent';
it('checks the same serialized limit with escaping and multi-byte characters',()=>{
 let w=rememberWorkspaceSize(validateWorkspace(createWorkspace()));
 for(const text of ['😀中文','"\\\n'.repeat(20),'']){w=editContent(w,w.notes[0].id,text);expect(validateWorkspace(w).notes[0].content).toBe(text);}
});
it('edits a roughly 45 MB workspace without reparsing every note',()=>{
 const text='a'.repeat(600_000);const w=rememberWorkspaceSize(validateWorkspace({...createWorkspace(),notes:Array.from({length:75},()=>({...newNote(),content:text,folderId:null}))}));
 const bytes=new TextEncoder().encode(JSON.stringify(w)).length;expect(bytes).toBeLessThan(MAX_WORKSPACE_BYTES);
 const times:number[]=[];let next=w;
 for(let i=0;i<10;i++){const start=performance.now();next=editContent(next,w.notes[0].id,text+i);times.push(performance.now()-start);}
 const start=performance.now();validateWorkspace(next);const full=performance.now()-start;
 console.info(`45 MB edit median=${times.sort((a,b)=>a-b)[5].toFixed(2)}ms; full validation=${full.toFixed(2)}ms`);
 expect(next.notes[74]).toBe(w.notes[74]);expect(next.notes[0].content).toBe(text+'9');
},20000);
