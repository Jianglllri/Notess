import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaveStatus, Workspace } from '../types';
import { loadWorkspace, saveWorkspace, StorageConflictError } from '../lib/storage';
import { importGithub, DEFAULT_REPO, parseGithub } from '../lib/github';
import { cloudEnabled, getRepositories, configureDesktop } from '../lib/repositories';
import { importCloudRepository } from '../lib/cloudSync';
import { mergeRemote, withFolderPaths } from '../lib/sync';
import { createWorkspace, validateWorkspace } from '../lib/workspace';

export function useWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState('等待连接笔记仓库');
  const syncing = useRef(false);
  const startupSync = useRef(false);
  const current = useRef<Workspace | null>(null);
  const revision = useRef(0);
  const sequence = useRef(0);
  const failed = useRef(false);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        let stored = await loadWorkspace();
        if (!active) return;
        if (!stored) {
          const seed = createWorkspace();
          try { stored = { workspace: seed, revision: await saveWorkspace(seed, 0) }; }
          catch (error) {
            if (!(error instanceof StorageConflictError)) throw error;
            stored = await loadWorkspace();
          }
        }
        if (!active || !stored) return;
        revision.current = stored.revision;
        current.current = withFolderPaths(stored.workspace);
        setWorkspace(current.current);
        setStatus('saved');
      } catch (cause) {
        if (!active) return;
        setError(`无法打开本地笔记库：${cause instanceof Error ? cause.message : '浏览器存储不可用'}。请检查浏览器的存储权限，不要清除网站数据。`);
        setStatus('error');
      }
    }
    void init();
    return () => { active = false; };
  }, []);

  const persist = useCallback((snapshot: Workspace) => {
    const ticket = ++sequence.current;
    setStatus('saving');
    queue.current = queue.current.then(async () => {
      if (failed.current) return;
      try {
        revision.current = await saveWorkspace(snapshot, revision.current);
        if (ticket === sequence.current) { setStatus('saved'); setError(''); }
      } catch (cause) {
        failed.current = true;
        setStatus(cause instanceof StorageConflictError ? 'conflict' : 'error');
        setError(cause instanceof StorageConflictError ? cause.message : '自动保存失败。当前修改仍在本页，请立即导出备份，并检查浏览器剩余空间或存储权限。');
      }
    });
  }, []);

  const update = useCallback((transform: (value: Workspace) => Workspace) => {
    if (!current.current) return false;
    const next = validateWorkspace(withFolderPaths({ ...transform(current.current), updatedAt: new Date().toISOString() }));
    current.current = next;
    setWorkspace(next);
    if (!failed.current) persist(next);
    return true;
  }, [persist]);

  const retry = useCallback(() => {
    if (!current.current || status === 'conflict') return;
    failed.current = false;
    persist(current.current);
  }, [persist, status]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (status === 'saved' || !current.current) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  const pull = useCallback(async () => {
    if(!cloudEnabled()){setSyncStatus('仅本地模式 · 笔记自动保存在本机');return;}
    if (syncing.current || !current.current) return;
    syncing.current = true; setSyncStatus('正在获取公开 / 私密笔记与导入清单…');
    try {
      await configureDesktop(); const config=getRepositories(); const reports:string[]=[];
      for(const visibility of ['public','private'] as const){
        const repo=config[visibility];if(!repo)continue;
        try{
          const docs=await importCloudRepository(repo,config[visibility==='private'?'privateBranch':'publicBranch'],visibility,current.current.notes,'',(done,total)=>setSyncStatus(`${visibility} 获取笔记 ${done}/${total}`));
          if(!cloudEnabled())return;
          update(w=>{const merged=mergeRemote(w,docs,repo);reports.push(`${visibility} 新增 ${merged.added} / 更新 ${merged.updated}${merged.conflicts?` / 冲突 ${merged.conflicts}（保留本地）`:''}`);return merged.workspace;});
        }catch(error){reports.push(`${visibility} 拉取失败：${error instanceof Error?error.message:'网络不可用'}`);}
      }
      const stats=reports.join(' · ');
      const sources=new Map<string,string>();
      for(const note of current.current?.notes || []) if(note.source && !note.deletedAt) {
        const g=note.source; sources.set(`${g.url}/tree/${g.branch}`,`${g.url}/tree/${g.branch}`);
      }
      for(const note of current.current?.notes || []) if(!note.source && note.sourceUrl && !note.deletedAt) {
        try {const p=parseGithub(note.sourceUrl);const repo=`https://github.com/${p.owner}/${p.repo}`;if(![DEFAULT_REPO,config.public,config.private].some(r=>r.toLowerCase()===repo.toLowerCase()))sources.set(repo,repo);}catch{/* Old non-GitHub links are left unchanged. */}
      }
      let sourceUpdated=0, sourceConflicts=0; const failures:string[]=[];
      for(const url of sources.values()) {
        if(!cloudEnabled())return;
        try {
          const cached=(current.current?.notes || []).filter(n=>n.source && `${n.source.url}/tree/${n.source.branch}`===url && !n.source.missing).map(n=>({path:n.source!.path,sha:n.source!.sha,content:n.source!.baseContent}));
          const paths=(current.current?.notes || []).filter(n=>n.source && `${n.source.url}/tree/${n.source.branch}`===url && !n.deletedAt).map(n=>n.source!.path);
          const incoming=await importGithub(url,'',undefined,cached,paths.length?paths:undefined);
          if(!cloudEnabled())return;
          update(w=>{
            // Refresh only already-tracked files. Re-import the project to add new files.
            const tracked=incoming.filter(d=>w.notes.some(n=>n.source && n.source.url.toLowerCase()===d.github.url.toLowerCase() && n.source.branch===d.github.branch && n.source.path===d.github.path || !n.source && n.sourceUrl===d.sourceUrl));
            const unavailable=w.notes.map(n=>n.source && `${n.source.url}/tree/${n.source.branch}`===url && !n.deletedAt && !incoming.some(d=>d.github.path===n.source!.path) ? {...n,source:{...n.source,missing:true}} : n);
            const merged=mergeRemote({...w,notes:unavailable},tracked);sourceUpdated+=merged.updated;sourceConflicts+=merged.conflicts;return merged.workspace;
          });
        } catch {failures.push(url);}
      }
      const missing=current.current?.notes.filter(n=>n.source?.missing).length || 0;
      setSyncStatus(`${stats} · 来源更新 ${sourceUpdated}${sourceConflicts?` · ${sourceConflicts} 篇来源冲突，保留本地修改`:''}${failures.length || missing?` · ${failures.length} 个来源更新失败 / ${missing} 篇正文待下载，保留本地内容`:''}`);
    } catch (cause) { setSyncStatus(`拉取失败，本地可继续编辑：${cause instanceof Error ? cause.message : '网络不可用'}`); }
    finally { syncing.current = false;if(!cloudEnabled())setSyncStatus('仅本地模式 · 笔记自动保存在本机'); }
  }, [update]);
  useEffect(() => { if (workspace && !startupSync.current) { startupSync.current = true; void pull(); } }, [workspace, pull]);
  useEffect(()=>{const changed=()=>void pull();window.addEventListener('zhiye-repositories-changed',changed);return()=>window.removeEventListener('zhiye-repositories-changed',changed);},[pull]);
  return { workspace, status, error, update, retry, getCurrent: () => current.current, syncStatus, pull };

}
