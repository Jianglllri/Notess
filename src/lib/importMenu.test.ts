import {expect,it} from 'vitest';
import {parseArxivId,paperNoteTemplate} from './importMenu';
it('parses arXiv links and ids into a clean id',()=>{
 expect(parseArxivId('2103.00000')).toBe('2103.00000');
 expect(parseArxivId('https://arxiv.org/abs/2103.00000')).toBe('2103.00000');
 expect(parseArxivId('https://arxiv.org/abs/2103.00000v2')).toBe('2103.00000');
 expect(parseArxivId('https://arxiv.org/pdf/2401.12345')).toBe('2401.12345');
 expect(()=>parseArxivId('')).toThrow();
 expect(()=>parseArxivId('hello')).toThrow();
});
it('renders a paper note template with authors, year and summary',()=>{
 const meta={id:'2103.00000',title:'A Test Paper',authors:['Alice','Bob'],year:'2021',summary:'A short summary.'};
 const {title,content}=paperNoteTemplate(meta);
 expect(title).toBe('A Test Paper');
 expect(content).toContain('# A Test Paper');
 expect(content).toContain('> Alice、Bob · 2021 · arXiv:2103.00000');
 expect(content).toContain('## 摘要');
 expect(content).toContain('A short summary.');
 expect(content).toContain('## 我的笔记 / 疑问');
});

import JSZip from 'jszip';
import {importMarkdownZip} from './importMenu';
import {createWorkspace} from './workspace';
import {exportFolderZip} from './backup';
import {decodeNote} from './github';
async function zipInput(zip:JSZip){return new File([await zip.generateAsync({type:'arraybuffer',compression:'DEFLATE'})],'notes.zip');}
it('recognizes complete backups rather than duplicating UUID Markdown copies',async()=>{
 const w=createWorkspace();const zip=new JSZip().file('workspace.json',JSON.stringify(w)).file('notes/id.md','# Wrong');
 expect(await importMarkdownZip(await zipInput(zip))).toEqual({kind:'backup',workspace:w});
});
it('imports nested markdown with real titles and rejects inflated oversized files',async()=>{
 const zip=new JSZip().file('project/id.md','```python\n# Wrong\n```\n# Exam');
 expect(await importMarkdownZip(await zipInput(zip))).toMatchObject({kind:'notes',items:[{title:'Exam',path:['project']}]});
 await expect(importMarkdownZip(await zipInput(new JSZip().file('huge.md','a'.repeat(1_000_001))))).rejects.toThrow('1 MB');
});
it('enforces total expanded ZIP size',async()=>{
 const zip=new JSZip();for(let i=0;i<21;i++)zip.file(`${i}.md`,'a'.repeat(1_000_000));
 await expect(importMarkdownZip(await zipInput(zip))).rejects.toThrow('20 MB');
});
it('folder export never overwrites colliding titles and retains original titles',async()=>{
 const w=createWorkspace();const base=w.notes[0];w.notes=['A','A','A（1）'].map((title,i)=>({...base,id:`n${i}`,folderId:'learning',title,content:`body ${i}`}));
 const zip=await JSZip.loadAsync(await (await exportFolderZip(w,'learning')).arrayBuffer());
 const entries=Object.values(zip.files).filter(f=>!f.dir);expect(entries).toHaveLength(3);
 const docs=await Promise.all(entries.map(async f=>decodeNote(await f.async('string'),f.name)));
 expect(docs.map(n=>n.content).sort()).toEqual(['body 0','body 1','body 2']);
 expect(docs.map(n=>n.title).sort()).toEqual(['A','A','A（1）']);
});
