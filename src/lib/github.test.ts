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
