import type { Note } from '../types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { newNote, createWorkspace } from './workspace';
import { DEFAULT_REPOSITORIES, validateRepositories } from './repositories';
import { encodeNote, decodeNote, publishGithubAtomic, githubRequest, readGithubFile, publishGithub, importGithub, readSource } from './github';
import { publishCloudNote, importCloudRepository, MANIFEST_PATH, parseManifest, markCloudPublished } from './cloudSync';
vi.mock('./github',async original=>({...await original<typeof import('./github')>(),publishGithubAtomic:vi.fn(),githubRequest:vi.fn(),readGithubFile:vi.fn(),publishGithub:vi.fn(),importGithub:vi.fn(),readSource:vi.fn()}));
const source={url:'https://github.com/owner/source',branch:'main',path:'q.md',sha:'a'.repeat(40),baseContent:'原始正文'};
const imported=():Note=>({...newNote(),content:source.baseContent,source});
beforeEach(()=>{vi.resetAllMocks();vi.mocked(publishGithubAtomic).mockResolvedValue(undefined);vi.mocked(githubRequest).mockResolvedValue({private:false});vi.mocked(readGithubFile).mockResolvedValue(null);vi.mocked(publishGithub).mockResolvedValue({content:{sha:'newsha'}});vi.mocked(importGithub).mockResolvedValue([]);vi.mocked(readSource).mockResolvedValue('原始正文');});
describe('separate public/private repositories and import manifests',()=>{
 it('rejects shared public/private targets',()=>expect(()=>validateRepositories({...DEFAULT_REPOSITORIES,private:DEFAULT_REPOSITORIES.public})).toThrow());
 it('blocks private notes before writing to an actually public repository',async()=>{await expect(publishCloudNote({...newNote(),visibility:'private'})).rejects.toThrow('已停止同步');expect(publishGithub).not.toHaveBeenCalled();});
 it('routes private body only to private repository',async()=>{vi.mocked(githubRequest).mockResolvedValue({private:true});await publishCloudNote({...newNote(),visibility:'private',content:'秘密'});expect(publishGithub).toHaveBeenCalledWith(DEFAULT_REPOSITORIES.private,'main',expect.stringMatching(/^notes\//),expect.stringContaining('秘密'),'',undefined);});
 it('stores unmodified imports solely in the manifest, without body',async()=>{const result=await publishCloudNote(imported());expect(result.transport).toBe('manifest');expect(publishGithub).toHaveBeenCalledTimes(1);const args=vi.mocked(publishGithub).mock.calls[0];expect(args[2]).toBe(MANIFEST_PATH);expect(args[3]).not.toContain('原始正文');expect(parseManifest(args[3]).entries).toHaveLength(1);});
 it('keeps other manifest entries when adding a note',async()=>{const other=imported(),record=encodeNote(other);vi.mocked(readGithubFile).mockImplementation(async(_u,_b,p)=>p===MANIFEST_PATH?{sha:'old',content:JSON.stringify({version:1,entries:[{path:'notes/other.md',mode:'reference',record}]})}:null);await publishCloudNote(imported());const args=vi.mocked(publishGithub).mock.calls[0];expect(parseManifest(args[3]).entries).toHaveLength(2);expect(args[5]).toBe('old');});
 it('rejects changed reference records rather than overwriting them',async()=>{const note=imported();note.github=await publishCloudNote(note);vi.mocked(publishGithub).mockClear();vi.mocked(readGithubFile).mockResolvedValue({sha:'changed',content:JSON.stringify({version:1,entries:[{path:note.github.path,mode:'reference',record:encodeNote({...note,title:'远端修改'})}]})});await expect(publishCloudNote(note)).rejects.toThrow('已变化');expect(publishGithub).not.toHaveBeenCalled();});
 it('switches a locally edited reference to full body and marks the manifest entry as copy',async()=>{const note=imported();note.github=await publishCloudNote(note);const old=note.github.baseSnapshot!;vi.mocked(publishGithub).mockClear();vi.mocked(readGithubFile).mockImplementation(async(_u,_b,p)=>p===MANIFEST_PATH?{sha:'old',content:JSON.stringify({version:1,entries:[{path:note.github!.path,mode:'reference',record:old}]})}:null);note.content='个人修改';const binding=await publishCloudNote(note);expect(binding.transport).toBe('file');const files=vi.mocked(publishGithubAtomic).mock.calls[0][2];expect(files[0].content).toContain('个人修改');expect(parseManifest(files[1].content).entries[0].mode).toBe('copy');expect(publishGithub).not.toHaveBeenCalled();});
 it('does not replace a remotely edited body with an old local reference',async()=>{const n=imported();n.github=await publishCloudNote(n);vi.mocked(publishGithub).mockClear();vi.mocked(readGithubFile).mockResolvedValue({sha:'changed',content:JSON.stringify({version:1,entries:[{path:n.github.path,mode:'copy'}]})});await expect(publishCloudNote(n)).rejects.toThrow('正文副本');expect(publishGithub).not.toHaveBeenCalled();});
 it('downloads source bodies from manifest and preserves tags and deletion',async()=>{const n={...imported(),tags:['AI'],deletedAt:'2026-10-19T00:00:00.000Z'};const record=encodeNote(n);vi.mocked(readGithubFile).mockResolvedValue({sha:'manifest',content:JSON.stringify({version:1,entries:[{path:'notes/q.md',mode:'reference',record}]})});const docs=await importCloudRepository(DEFAULT_REPOSITORIES.public,'main','public',[]);expect(docs[0].content).toBe('原始正文');expect(docs[0].deletedAt).toBe(n.deletedAt);expect(docs[0].tags).toEqual(['AI']);expect(docs[0].github.transport).toBe('manifest');expect(importGithub).toHaveBeenCalledWith(expect.any(String),'',undefined,[],undefined,['notes/q.md']);});
 it('retains source cache when source download fails',async()=>{const n=imported();n.github=await publishCloudNote(n);n.source={...source,missing:true};vi.mocked(readGithubFile).mockResolvedValue({sha:'manifest',content:JSON.stringify({version:1,entries:[{path:n.github.path,mode:'reference',record:n.github.baseSnapshot}]})});vi.mocked(readSource).mockRejectedValue(new Error('offline'));const docs=await importCloudRepository(DEFAULT_REPOSITORIES.public,'main','public',[n]);expect(docs[0].content).toBe('原始正文');expect(docs[0].source?.missing).toBe(true);});
 it('tracks old publications after changing target without deleting them',async()=>{const n=newNote();n.github=await publishCloudNote(n);const w={...createWorkspace(),notes:[n]};const binding={...n.github,url:DEFAULT_REPOSITORIES.private};const result=markCloudPublished(w,n.id,binding);expect(result.notes[0].publications?.[0].url).toBe(DEFAULT_REPOSITORIES.public);expect(result.ignoredSources).toHaveLength(1);});
 it('does not accept body copies masquerading as reference entries',()=>expect(()=>parseManifest(JSON.stringify({version:1,entries:[{path:'a.md',mode:'reference',record:encodeNote({...newNote(),content:'body'})}]}))).toThrow());
 it('keeps local source cache out of serialized metadata',()=>expect(decodeNote(encodeNote(imported()),'q.md').source?.baseContent).toBe(''));
});

it('uploads full-mode imports as body even when unchanged from source',async()=>{
 const n={...imported(),syncMode:'full' as const};const binding=await publishCloudNote(n);
 expect(binding.transport).toBe('file');expect(vi.mocked(publishGithub).mock.calls[0][2]).not.toBe(MANIFEST_PATH);
 expect(vi.mocked(publishGithub).mock.calls[0][3]).toContain('原始正文');
});
it('restores recorded source bodies and deletion markers on a new device',async()=>{
 const n={...imported(),syncMode:'reference' as const,folderPath:['来源清单','项目']};
 const record=encodeNote(n),deleted=encodeNote({...n,deletedAt:'2026-10-20T00:00:00.000Z'});
 vi.mocked(readGithubFile).mockResolvedValue({sha:'a'.repeat(40),content:JSON.stringify({version:1,entries:[{path:'a.md',mode:'reference',record},{path:'b.md',mode:'reference',record:deleted}]})});
 const docs=await importCloudRepository(DEFAULT_REPOSITORIES.public,'main','public',[]);
 expect(docs).toHaveLength(2);expect(docs.every(d=>d.content==='原始正文'&&d.syncMode==='reference')).toBe(true);
 expect(docs.find(d=>d.github.path==='b.md')?.deletedAt).toBe('2026-10-20T00:00:00.000Z');
 expect(readSource).toHaveBeenCalledTimes(2);
});

it('recovers a lost atomic-switch response after more local edits',async()=>{
 const n=imported();n.github=await publishCloudNote(n);const record=n.github.baseSnapshot!;
 n.content='第一次修改';
 const first=encodeNote({...n,visibility:'public'});
 vi.mocked(readGithubFile).mockImplementation(async(_u,_b,path)=>path===MANIFEST_PATH?{sha:'m',content:JSON.stringify({version:1,entries:[{path:n.github!.path,mode:'copy',record,fileSha:'body-sha'}]})}:{sha:'body-sha',content:first});
 n.content='继续编辑';vi.mocked(publishGithub).mockClear();await publishCloudNote(n);
 expect(publishGithub).toHaveBeenCalledWith(expect.any(String),'main',n.github.path,expect.stringContaining('继续编辑'),'', 'body-sha');
});
it('recognizes a successful manifest write whose response was lost',async()=>{
 const n=imported(),record=encodeNote({...n,visibility:'public'});
 vi.mocked(readGithubFile).mockResolvedValue({sha:'m',content:JSON.stringify({version:1,entries:[{path:'imports/owner/source/q.md',mode:'reference',record}]})});
 const g=await publishCloudNote(n);expect(g.baseSnapshot).toBe(record);expect(publishGithub).not.toHaveBeenCalled();
});
it('refuses never-published deletion before making any network request',async()=>{
 await expect(publishCloudNote({...imported(),deletedAt:new Date().toISOString()})).rejects.toThrow('无需上传删除记录');
 expect(githubRequest).not.toHaveBeenCalled();expect(readGithubFile).not.toHaveBeenCalled();expect(publishGithub).not.toHaveBeenCalled();
});
it('does not create a tombstone in a newly selected repository or branch',async()=>{
 const n=imported();n.github={url:DEFAULT_REPOSITORIES.public,branch:'old-branch',path:'a.md',sha:'a'.repeat(40),format:'md',syncedAt:n.updatedAt};n.deletedAt=new Date().toISOString();
 await expect(publishCloudNote(n)).rejects.toThrow('原云端仓库或分支');expect(githubRequest).not.toHaveBeenCalled();
});
