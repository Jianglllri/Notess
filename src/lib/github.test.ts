import { afterEach, expect, it, vi } from 'vitest';
import { importGithub, publishGithub } from './github';
afterEach(() => vi.unstubAllGlobals());
const ok = (data: unknown) => ({ ok: true, json: async () => data });
it('imports UTF-8 Markdown using the actual default branch', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(ok({default_branch:'docs'})).mockResolvedValueOnce(ok({sha:'commit-sha'})).mockResolvedValueOnce(ok({sha:'tree-sha',tree:[{type:'blob',path:'README.md',size:20,sha:'a'.repeat(40)}]})).mockResolvedValueOnce({ok:true,text:async()=> '中文笔记'});
  vi.stubGlobal('fetch', fetcher);
  expect((await importGithub('https://github.com/a/b', ''))[0].content).toContain('中文笔记');
  expect(fetcher.mock.calls[1][0]).toContain('/commits/docs');
});
it('never overwrites an existing remote note', async () => {
  const fetcher = vi.fn().mockResolvedValue(ok({sha:'existing'})); vi.stubGlobal('fetch', fetcher);
  await expect(publishGithub('https://github.com/a/b','main','note.md','new','token')).rejects.toThrow('已存在');
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('creates UTF-8 content and passes branch explicitly', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce({ok:false,status:404}).mockResolvedValueOnce(ok({commit:{sha:'new'}})); vi.stubGlobal('fetch', fetcher);
  await publishGithub('https://github.com/a/b','docs','笔记.md','你好','token');
  const payload = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(payload.branch).toBe('docs');
  expect(new TextDecoder().decode(Uint8Array.from(atob(payload.content), c => c.charCodeAt(0)))).toBe('你好');
});
it('updates with the remembered SHA and creates an update commit', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(ok({sha:'old'})).mockResolvedValueOnce(ok({content:{sha:'next'}})); vi.stubGlobal('fetch', fetcher);
  await publishGithub('https://github.com/a/b','main','note.md','edited','token','old');
  const payload = JSON.parse(fetcher.mock.calls[1][1].body);
  expect(payload.sha).toBe('old'); expect(payload.message).toBe('Update note: note.md');
});
it('rejects a changed or deleted remote file without writing', async () => {
  for (const response of [ok({sha:'someone-elses-edit'}), {ok:false,status:404}]) {
    const fetcher = vi.fn().mockResolvedValue(response); vi.stubGlobal('fetch', fetcher);
    await expect(publishGithub('https://github.com/a/b','main','note.md','edited','token','old')).rejects.toThrow('远端版本已变化');
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it('propagates a race conflict from the PUT without forcing a retry', async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(ok({sha:'old'})).mockResolvedValueOnce({ok:false,status:409}); vi.stubGlobal('fetch', fetcher);
  await expect(publishGithub('https://github.com/a/b','main','note.md','edited','token','old')).rejects.toThrow('(409)');
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('imports deletion metadata through the same Markdown transport and cache', async () => {
  const raw='<!-- zhiye:{"title":"已删除","tags":[],"deletedAt":"2026-10-19T09:00:00.000Z"} -->\n保留正文';
  for (const cache of [[],[{path:'note.md',sha:'a'.repeat(40),content:raw}]]) {
    const fetcher=vi.fn().mockResolvedValueOnce(ok({default_branch:'main'})).mockResolvedValueOnce(ok({sha:'commit'})).mockResolvedValueOnce(ok({tree:[{type:'blob',path:'note.md',size:100,sha:'a'.repeat(40)}]})).mockResolvedValueOnce({ok:true,text:async()=>raw});
    vi.stubGlobal('fetch',fetcher);
    const [note]=await importGithub('https://github.com/Jianglllri/Notess','',undefined,cache);
    expect(note.deletedAt).toBe('2026-10-19T09:00:00.000Z');
    expect(note.github.baseSnapshot).toContain('deletedAt');
    expect(note.content).toBe('保留正文');
    expect(fetcher).toHaveBeenCalledTimes(cache.length?3:4);
  }
});

it('restores the baseline of a full copy without replacing its personal body',async()=>{
 const {encodeNote}=await import('./github');const source={url:'https://github.com/upstream/repo',branch:'main',path:'a.md',sha:'a'.repeat(40),baseContent:'source'};
 const raw=encodeNote({title:'copy',content:'personal',tags:[],syncMode:'full',source});
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  if(url.endsWith('/repos/a/b'))return ok({default_branch:'main'});
  if(url.includes('/commits/'))return ok({sha:'b'.repeat(40)});
  if(url.includes('/git/trees/'))return ok({tree:[{type:'blob',path:'copy.md',sha:'c'.repeat(40),size:raw.length}]});
  if(url.includes('/git/blobs/'))return ok({encoding:'base64',content:btoa('source'),size:6});
  return {ok:true,text:async()=>raw};
 }));
 const [doc]=await importGithub('https://github.com/a/b');expect(doc.content).toBe('personal');expect(doc.source?.baseContent).toBe('source');
});

it('atomic publication does not advance the branch when another writer wins',async()=>{
 const {publishGithubAtomic}=await import('./github');const calls:{url:string;method:string}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit={})=>{
  calls.push({url,method:init.method||'GET'});
  if(url.includes('/git/ref/'))return ok({object:{sha:'a'.repeat(40)}});
  if(url.includes('/git/commits/')&&!init.method)return ok({tree:{sha:'b'.repeat(40)}});
  if(url.includes('/contents/'))return {ok:false,status:404};
  if(init.method==='PATCH')return {ok:false,status:422};
  return ok({sha:'c'.repeat(40)});
 }));
 await expect(publishGithubAtomic('https://github.com/a/b','main',[{path:'a.md',content:'a'},{path:'.zhiye/imports.json',content:'{}'}],'test-token')).rejects.toThrow();
 expect(calls.filter(c=>c.method==='PATCH')).toHaveLength(1);
 expect(calls.filter(c=>c.method==='PUT')).toHaveLength(0);
});
