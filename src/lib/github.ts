import {titleFromMarkdown} from './markdownTitle';
import type { GithubBinding, SourceBinding } from '../types';
import { cloudEnabled, getRepositories, isNotesRepository, configureDesktop, getSessionToken } from './repositories';
export const DEFAULT_REPO = 'https://github.com/Jianglllri/Notess';
export const DEFAULT_BRANCH = 'main';
export function parseGithub(value: string) {
  let url = new URL(value);
  if (url.origin === 'https://vscode.dev' && url.pathname.startsWith('/github/')) url = new URL(`https://github.com/${url.pathname.slice(8)}`);
  const [owner, repo, type, ...rest] = url.pathname.split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password || !owner || !repo || !/^[\w-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || ['.','..'].includes(repo) || (type && !['blob', 'tree'].includes(type))) throw new Error('请输入 https://github.com/用户/仓库 或 blob/tree 文档链接。');
  return { owner, repo: repo.replace(/\.git$/, ''), type, rest };
}
export async function githubRequest(path: string, token = '', init: RequestInit = {}) {
  if(init.method && init.method!=='GET'&&!cloudEnabled())throw new Error('已切换为仅本地模式，停止上传。');
  token=token || getSessionToken();
  if (!token && typeof window !== 'undefined' && window.zhiye) {
    const configured=Object.values(getRepositories()).filter(r=>r.startsWith('https://github.com/'));
    if(configured.some(r=>{const p=new URL(r).pathname;return path===`/repos${p}`||path.startsWith(`/repos${p}/`);})) {await configureDesktop();return window.zhiye.githubRequest(path,init.method || 'GET',init.body?String(init.body):'');}
  }
  const response = await fetch(`https://api.github.com${path}`, { signal: AbortSignal.timeout(30000), ...init, headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  if (!response.ok) throw new Error(`GitHub 请求失败 (${response.status})：${response.status === 409 || response.status === 422 ? '远端已变化或文件已存在，请刷新后重试。' : '请检查链接、网络、访问权限或 API 限额。'}`);
  return response.json();
}
const enc = (s: string) => s.split('/').map(encodeURIComponent).join('/');
export interface ImportedDoc { syncMode?:'reference'|'full'; title: string; content: string; github: GithubBinding; sourceUrl: string; category: string; visibility?: 'public'|'private'; tags?: string[]; deletedAt?: string; source?: SourceBinding; folderPath?: string[]; pinned?: boolean }
type CloudNote = {referenceOnly?:boolean;syncMode?:'reference'|'full';visibility?:'public'|'private';title:string;content:string;tags:string[];deletedAt?:string|null;source?:SourceBinding;folderPath?:string[];pinned?:boolean};
export function decodeNote(raw: string, fallback: string) {
  const match = raw.match(/^\uFEFF?<!-- zhiye:(.+) -->\r?\n/);
  let content = raw; let title = titleFromMarkdown(raw, fallback); let tags: string[] = [];
  let syncMode:'reference'|'full'|undefined; let deletedAt: string | undefined; let source: SourceBinding | undefined; let referenceOnly = false; let folderPath: string[] | undefined; let pinned: boolean | undefined; let visibility:'public'|'private'|undefined;
  if (match) { try {
    const meta = JSON.parse(match[1]);
    if(meta.syncMode==='reference'||meta.syncMode==='full')syncMode=meta.syncMode;
    if (typeof meta.deletedAt === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(meta.deletedAt) && Number.isFinite(Date.parse(meta.deletedAt))) deletedAt = new Date(meta.deletedAt).toISOString();
    if (typeof meta.title === 'string' && meta.title.trim()) title = meta.title.trim();
    if (Array.isArray(meta.tags)) tags = meta.tags.filter((x: unknown) => typeof x === 'string' && x.length <= 40).slice(0, 30);
    if (Array.isArray(meta.folderPath) && meta.folderPath.length <= 200 && meta.folderPath.every((p:unknown)=>typeof p==='string' && p.length>0 && p.length<=60)) folderPath=meta.folderPath;
    if(meta.visibility==='public'||meta.visibility==='private')visibility=meta.visibility;
    if (typeof meta.pinned==='boolean') pinned=meta.pinned;
    if (meta.source) {
      const g=meta.source; parseGithub(g.url);
      if (typeof g.branch!=='string' || !g.branch || g.branch.length>250 || typeof g.path!=='string' || !g.path || g.path.length>1000 || !/^[a-f0-9]{40,64}$/.test(g.sha)) throw new Error('Invalid source');
      source={url:g.url,branch:g.branch,path:g.path,sha:g.sha,baseContent:'',...(/^[a-f0-9]{40,64}$/.test(g.commit)?{commit:g.commit}:{})}; referenceOnly=meta.referenceOnly===true;
    }
    content = raw.slice(match[0].length);
  } catch { /* Ordinary Markdown remains readable. */ } }
  return { ...(syncMode?{syncMode}:{}), title: title.slice(0, 200), content, tags, ...(deletedAt ? {deletedAt} : {}), ...(source ? {source,referenceOnly}:{}), ...(folderPath ? {folderPath}:{}), ...(pinned===undefined?{}:{pinned}),...(visibility?{visibility}:{}) };
}
export function encodeNote(note: CloudNote) {
  const source=note.source;
  const referenceOnly=!!source && (note.referenceOnly ?? (note.syncMode!=='full' && note.content===source.baseContent));
  const meta={...(note.syncMode?{syncMode:note.syncMode}:{}),title:note.title,tags:note.tags,...(note.visibility?{visibility:note.visibility}:{}),...(note.deletedAt?{deletedAt:note.deletedAt}:{}),...(note.folderPath?{folderPath:note.folderPath}:{}),...(note.pinned===undefined?{}:{pinned:note.pinned}),...(source?{source:{url:source.url,branch:source.branch,path:source.path,sha:source.sha,...(source.commit?{commit:source.commit}:{})},referenceOnly}:{})};
  return `<!-- zhiye:${JSON.stringify(meta).replace(/-->/g, '--\\u003e')} -->\n${referenceOnly ? '' : note.content}`;
}
export async function readSource(source: SourceBinding, token='') {
  token=token || getSessionToken();
  const p=parseGithub(source.url);
  if (source.commit && !token) {
    const response=await fetch(`https://raw.githubusercontent.com/${enc(p.owner)}/${enc(p.repo)}/${source.commit}/${enc(source.path)}`,{signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw new Error(`来源下载失败 (${response.status})`);
    const raw=await response.text(); if(new TextEncoder().encode(raw).length>1_000_000) throw new Error('来源文件超过 1 MB。');
    return decodeNote(raw,source.path).content;
  }
  // Resolve the recorded blob, not a moving branch, for reproducible restoration.
  const data=await githubRequest(`/repos/${enc(p.owner)}/${enc(p.repo)}/git/blobs/${source.sha}`,token);
  if (data.encoding!=='base64' || data.size>1_000_000) throw new Error('来源文件超过 1 MB 或不是文本。');
  return decodeNote(new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g,'')),c=>c.charCodeAt(0))),source.path).content;
}
export async function importGithub(url: string, token = '', progress?: (done: number, total: number) => void, cache: {path:string;sha:string;content:string;source?:SourceBinding;localContent?:string}[] = [], paths?: string[], excludedPaths: string[] = []): Promise<ImportedDoc[]> {
  const p = parseGithub(url); const base = `/repos/${enc(p.owner)}/${enc(p.repo)}`;
  const meta = await githubRequest(base, token);
  let branch = meta.default_branch as string; let prefix = '';
  if (p.type) {
    let found = false;
    for (let i = p.rest.length; i >= 1; i--) {
      const candidate = p.rest.slice(0, i).join('/');
      try { await githubRequest(`${base}/branches/${encodeURIComponent(candidate)}`, token); branch = candidate; prefix = p.rest.slice(i).join('/'); found = true; break; }
      catch (error) { if (!(error instanceof Error) || !error.message.includes('(404)')) throw error; }
    }
    if (!found) throw new Error('无法解析分支，请使用仓库主页链接。');
  }
  const commit = await githubRequest(`${base}/commits/${encodeURIComponent(branch)}`, token);
  const tree = await githubRequest(`${base}/git/trees/${commit.sha}?recursive=1`, token);
  if (tree.truncated) throw new Error('仓库目录过大，GitHub 返回了截断目录；请使用较小的资料仓库。');
  const files = (tree.tree as {path:string;type:string;size:number;sha:string}[]).filter(f => f.type === 'blob' && !excludedPaths.includes(f.path) && (!paths || paths.includes(f.path)) && /\.(md|markdown|txt)$/i.test(f.path) && (!prefix || f.path === prefix || f.path.startsWith(prefix + '/')));
  if (files.length > 1000 || files.reduce((n,f) => n + f.size, 0) > 20_000_000 || files.some(f => f.size > 1_000_000)) throw new Error('导入上限为 1000 篇、共 20 MB、单篇 1 MB，请缩小范围。');
  const result: ImportedDoc[] = new Array(files.length); let cursor = 0; let done = 0; let stopped = false;
  try { await Promise.all(Array.from({length: Math.min(6, files.length)}, async () => {
    while (!stopped && cursor < files.length) {
      const i = cursor++; const file = files[i]; let raw: string;
      const cached = cache.find(c => c.path === file.path && c.sha === file.sha);
      if (cached) raw = cached.content;
      else if (meta.private) {
        const data = await githubRequest(`${base}/git/blobs/${file.sha}`, token);
        raw = new TextDecoder().decode(Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0)));
      } else {
        const response = await fetch(`https://raw.githubusercontent.com/${enc(p.owner)}/${enc(p.repo)}/${commit.sha}/${enc(file.path)}`, {signal: AbortSignal.timeout(30000)});
        if (!response.ok) throw new Error(`文档下载失败 (${response.status})：${file.path}`);
        raw = await response.text();
      }
      if (raw.length > 1_000_000) throw new Error('文档超过大小限制。');
      const decoded = decodeNote(raw, file.path.split('/').pop()!);
      if (decoded.source) {
        const local=cache.find(c=>c.path===file.path);
        try {
          const base=local?.source?.sha===decoded.source.sha && !local.source.missing ? local.source.baseContent : await readSource(decoded.source,token);
          decoded.source={...decoded.source,baseContent:base};
          if(decoded.referenceOnly) decoded.content=base;
        } catch {
          decoded.source={...decoded.source,baseContent:local?.source?.baseContent || '',missing:true};
          if(decoded.referenceOnly) decoded.content=local?.localContent || '';
        }
      }
      if (!decoded.source && !isNotesRepository(`https://github.com/${p.owner}/${p.repo}`)) decoded.source={url:`https://github.com/${p.owner}/${p.repo}`,branch,path:file.path,sha:file.sha,commit:commit.sha,baseContent:decoded.content};
      const sourceUrl = `https://github.com/${p.owner}/${p.repo}/blob/${enc(branch)}/${enc(file.path)}`;
      result[i] = {...decoded, visibility:meta.private?'private':decoded.visibility || 'public', sourceUrl, category: file.path.includes('/') ? file.path.split('/').slice(-2,-1)[0].slice(0,60) : p.repo,
        github: {url: `https://github.com/${p.owner}/${p.repo}`, branch, path: file.path, sha: file.sha, format:'md', syncedAt: new Date().toISOString(), baseSnapshot: decoded.source && raw.startsWith('<!-- zhiye:') ? raw : encodeNote(decoded), baseContent: decoded.content}};
      progress?.(++done, files.length);
    }
  })); } catch (error) { stopped = true; throw error; }
  return result;
}
export async function readGithubFile(url: string, branch: string, path: string, token: string) {
  const p = parseGithub(url);
  const endpoint = `/repos/${enc(p.owner)}/${enc(p.repo)}/contents/${enc(path)}`;
  try {
    const file = await githubRequest(`${endpoint}?ref=${encodeURIComponent(branch)}`, token);
    if (file.type !== 'file' || file.encoding !== 'base64' || file.size > 2_000_000) throw new Error('远端不是可编辑文本文件或超过 2 MB。');
    return { sha: file.sha as string, content: new TextDecoder().decode(Uint8Array.from(atob(file.content.replace(/\s/g, '')), c => c.charCodeAt(0))) };
  } catch (error) { if (error instanceof Error && error.message.includes('(404)')) return null; throw error; }
}
export async function publishGithub(url: string, branch: string, path: string, content: string, token: string, expectedSha?: string) {
  if(!cloudEnabled())throw new Error('当前为仅本地模式，请先在使用模式与仓库中开启云端同步。');
  token=token || getSessionToken();
  if ((!token.trim() && !(typeof window !== 'undefined' && window.zhiye)) || !branch.trim() || !path.trim() || path.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('请填写 Token、分支和有效文件路径。');
  const p = parseGithub(url);
  const endpoint = `/repos/${enc(p.owner)}/${enc(p.repo)}/contents/${enc(path)}`;
  let sha: string | undefined;
  try { sha = (await githubRequest(`${endpoint}?ref=${encodeURIComponent(branch)}`, token)).sha; }
  catch (error) { if (!(error instanceof Error) || !error.message.includes('(404)')) throw error; }
  if (sha && !expectedSha) throw new Error('目标文件已存在，请先查看远端版本，再确认更新。');
  if (expectedSha && sha !== expectedSha) throw new Error('远端版本已变化，提交已停止。请查看远端版本，合并需要的内容后重试。');
  const bytes = new TextEncoder().encode(content); let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return githubRequest(endpoint, token, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `${sha ? 'Update' : 'Publish'} note: ${path}`, content: btoa(binary), branch, ...(sha ? {sha} : {}) }) });
}

// Publish related files in one commit. A non-forced branch update rejects races.
export async function publishGithubAtomic(url:string,branch:string,files:{path:string;content:string;sha?:string}[],token='') {
  if(!cloudEnabled())throw Error('当前为仅本地模式。');
  const p=parseGithub(url),base=`/repos/${enc(p.owner)}/${enc(p.repo)}`;
  const ref=await githubRequest(`${base}/git/ref/heads/${enc(branch)}`,token);
  const parent=ref.object.sha as string;
  const commit=await githubRequest(`${base}/git/commits/${parent}`,token);
  for(const file of files){
    if(file.path.split('/').some(s=>!s||s==='.'||s==='..'))throw Error('无效文件路径');
    const remote=await readGithubFile(url,parent,file.path,token);
    if(remote?.sha!==file.sha)throw Error('远端版本已变化，提交已停止。');
  }
  const tree=await githubRequest(`${base}/git/trees`,token,{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:files.map(f=>({path:f.path,mode:'100644',type:'blob',content:f.content}))})});
  const next=await githubRequest(`${base}/git/commits`,token,{method:'POST',body:JSON.stringify({message:'Update note and import manifest atomically',tree:tree.sha,parents:[parent]})});
  await githubRequest(`${base}/git/refs/heads/${enc(branch)}`,token,{method:'PATCH',body:JSON.stringify({sha:next.sha,force:false})});
}
export async function gitBlobSha(content:string){
  const bytes=new TextEncoder().encode(content),header=new TextEncoder().encode(`blob ${bytes.length}\0`);
  const input=new Uint8Array(header.length+bytes.length);input.set(header);input.set(bytes,header.length);
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1',input)),b=>b.toString(16).padStart(2,'0')).join('');
}
