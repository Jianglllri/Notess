import {sharedStorageEnabled} from './lib/storage';
import {decodeNote} from './lib/github';
import {TitleRepair} from './components/TitleRepair';
import {editContent} from './lib/editContent';
import {BulkActions} from './components/BulkActions';
import {ImportMenu} from './components/ImportMenu';
import {allSelectable,emptyTrash,invertSelection,toggleFolderSelection} from './lib/bulk';
import { organizeWorkspace } from './lib/organize';
import { useCloudMode } from './hooks/useCloudMode';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { MarkdownEditor } from './components/MarkdownEditor';
import type { MarkdownEditorHandle } from './components/MarkdownEditor';
import {
  ArrowCounterClockwiseIcon, ArrowLeftIcon, ArrowSquareOutIcon, ArrowUpRightIcon,
  BookOpenIcon, CaretRightIcon, CheckCircleIcon, CheckSquareIcon, CodeIcon,
  DownloadSimpleIcon, FileTextIcon, FolderIcon, FolderPlusIcon, GithubLogoIcon,
  HashIcon, ImageIcon, LeafIcon, ListBulletsIcon, MagnifyingGlassIcon,
  NotePencilIcon, PlusIcon, PushPinIcon, SidebarSimpleIcon, SplitHorizontalIcon,
  TrashIcon, UploadSimpleIcon, WarningCircleIcon,
  TextBIcon, TextHIcon, XIcon,
} from '@phosphor-icons/react';
import { useWorkspace } from './hooks/useWorkspace';
import type { Asset, Filter, Note, NoteSort, ViewMode, Workspace } from './types';
import { filterNotes, MAX_IMAGE_BYTES, mergeWorkspace, newNote, pruneUnreferencedAssets, noteSummary } from './lib/workspace';
import { downloadBlob, exportBackup, exportFolderZip, exportNote, importBackup } from './lib/backup';
import { MarkdownPreview } from './components/MarkdownPreview';
import { Modal } from './components/Modal';
import { RichEditor } from './components/RichEditor';
import { RepositorySettings } from './components/RepositorySettings';
import { noteDestination, getSessionToken } from './lib/repositories';
import { publishCloudNote, markCloudPublished } from './lib/cloudSync';
import { FlowTool } from './components/FlowTool';
import { MindMapTool } from './components/MindMapTool';
import { PaneResize } from './components/PaneResize';
import { FolderTree } from './components/FolderTree';
import { folderLabel, insideFolder, trashFolder } from './lib/folders';
import { needsDeletionSync } from './lib/schedule';
import { sourceKey } from './lib/sync';
import { AppUpdates } from './components/AppUpdates';
import { SyncReminder } from './components/SyncReminder';
import { StudyTools } from './components/StudyTools';

const dateLabel = (date: string) => new Date(date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
const fullDate = (date: string) => new Date(date).toLocaleString('zh-CN');
type ModalState = 'folder' | 'backup' | 'info' | 'delete' | 'trash' | null;

export default function App() {
  const cloud=useCloudMode();
  const { workspace, status, error, update: commit, edit, retry, getCurrent, syncStatus, pull } = useWorkspace();
  const [panes, setPanes] = useState(() => {
    const defaults={sidebar:true,list:false,sidebarWidth:210,listWidth:240};
    try { const saved=JSON.parse(localStorage.getItem('zhiye-panes') || '{}');return {...defaults,sidebar:typeof saved.sidebar==='boolean'?saved.sidebar:true,list:typeof saved.list==='boolean'?saved.list:false,sidebarWidth:Math.max(160,Math.min(420,Number(saved.sidebarWidth)||210)),listWidth:Math.max(160,Math.min(420,Number(saved.listWidth)||240))}; } catch { return defaults; }
  });
  useEffect(()=>{try{localStorage.setItem('zhiye-panes',JSON.stringify(panes));}catch{/* Layout is optional. */}},[panes]);
  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [query, setQuery] = useState('');
  const [batchMode,setBatchMode]=useState(false);
  const [batch,setBatch]=useState<{notes:string[];folders:string[]}>({notes:[],folders:[]});
  const clearBatch=()=>setBatch({notes:[],folders:[]});
  const [selectedId, setSelectedId] = useState<string | null>('welcome');
  const [view, setView] = useState<ViewMode>('preview');
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>(() => {
    try { const saved = localStorage.getItem('zhiye-theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; } catch { return 'system'; }
  });
  const [noteSort, setNoteSort] = useState<NoteSort>(() => {
    try {
      const saved = localStorage.getItem('zhiye-note-sort');
      return saved === 'created' || saved === 'titleAsc' || saved === 'titleDesc' ? saved : 'updated';
    } catch { return 'updated'; }
  });
  useEffect(() => { try { localStorage.setItem('zhiye-note-sort', noteSort); } catch { /* Sorting is nonessential. */ } }, [noteSort]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderParentId, setFolderParentId] = useState<string | null>(null);
  const [folderError, setFolderError] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('typescript');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [trashToken, setTrashToken] = useState('');
  const [organizeImport,setOrganizeImport]=useState(false);
  const [incoming, setIncoming] = useState<Workspace | null>(null);
  const [backupError, setBackupError] = useState('');
  const [limitError,setLimitError]=useState('');
  const editor = useRef<MarkdownEditorHandle>(null);
  const search = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const markdownInput = useRef<HTMLInputElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const [searchQuery,setSearchQuery]=useState(query);
  useEffect(()=>{const timer=setTimeout(()=>setSearchQuery(query),150);return()=>clearTimeout(timer);},[query]);
  const notes = useMemo(() => workspace ? filterNotes(workspace, filter, searchQuery, noteSort) : [], [workspace, filter, searchQuery, noteSort]);
  const selected = notes.find(note => note.id === selectedId) ?? notes[0] ?? null;
  const liveNotes = workspace?.notes.filter(note => !note.deletedAt) ?? [];
  const tags = [...new Set(liveNotes.flatMap(note => note.tags))].sort();
  const filterLabel = filter.kind === 'all' ? '全部笔记' : filter.kind === 'pinned' ? '置顶笔记' : filter.kind === 'trash' ? '回收站' : filter.kind === 'unfiled' ? '未分类' : filter.kind === 'tag' ? `# ${filter.id}` : workspace?.folders.find(folder => folder.id === filter.id)?.name ?? '文件夹';
  const saveLabel = status === 'saved' ? (sharedStorageEnabled()?'已保存到本机共享库':'已保存到本地') : status === 'saving' ? '正在保存…' : status === 'loading' ? '正在打开…' : status === 'conflict' ? '多窗口编辑冲突' : '保存失败';

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media?.matches ? 'dark' : 'light') : theme; };
    apply();
    media?.addEventListener('change', apply);
    try { localStorage.setItem('zhiye-theme', theme); } catch { /* Appearance is nonessential. */ }
    return () => media?.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        setPanes(p=>({...p,list:true}));
        event.preventDefault(); setMobileEditor(false); requestAnimationFrame(()=>search.current?.focus());
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault(); setNotice(status === 'saved' ? '笔记已自动保存在本地。' : '请查看顶部保存状态；有问题时先导出备份。');
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [status]);

  function update(transform: (value: Workspace) => Workspace): boolean {
    try { return commit(transform); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : '修改未保存，请检查内容。'); return false; }
  }
  function acceptEditorChange(content: string): boolean {
    try {
      const current = getCurrent();
      if (!current || !selected || selected.deletedAt) return false;
      editContent(current,selected.id,content);
      return true;
    } catch (cause) {
      setTimeout(() => setLimitError(cause instanceof Error ? cause.message : '内容超过上限，修改未应用。'), 0);
      return false;
    }
  }
  function chooseFilter(value: Filter) {  setFilter(value); setQuery(''); setSidebarOpen(false); setMobileEditor(false); }
  function patchNote(patch: Partial<Note>) {
    if (!selected || selected.deletedAt) return false;
    return update(w => ({ ...w, notes: w.notes.map(note => note.id === selected.id ? { ...note, ...patch, updatedAt: new Date().toISOString() } : note) }));
  }
  function moveSelectedNote(folderId: string | null) {
    if (!selected || selected.deletedAt) return;
    const id = selected.id;
    if (!update(w => ({ ...w, notes: w.notes.map(n => n.id === id ? { ...n, folderId, updatedAt: new Date().toISOString() } : n) }))) return;
    setFilter(folderId ? { kind: 'folder', id: folderId } : { kind: 'unfiled' });
    setQuery(''); setSelectedId(id); 
    setNotice('笔记已移动，可继续编辑或再次移动。');
  }
  function createNote() {
    
    if (!workspace) return;
    if (workspace.notes.length >= 1000) { setNotice('已达到 1000 篇上限，请先整理回收站。'); return; }
    const note = newNote(filter.kind === 'folder' ? filter.id : null);
    if (filter.kind === 'tag') note.tags = [filter.id];
    if (filter.kind === 'pinned') note.pinned = true;
    if (!update(w => ({ ...w, notes: [note, ...w.notes] }))) return;
    if (filter.kind === 'trash') setFilter({ kind: 'all' });
    setQuery(''); setSelectedId(note.id); setMobileEditor(true); setView('rich');
  }
  function insert(before: string, after = '', placeholder = '') {
    const instance = editor.current?.view;
    if (!instance || !selected || selected.deletedAt) return;
    const { from, to } = instance.state.selection.main;
    const text = instance.state.sliceDoc(from, to) || placeholder;
    instance.dispatch({ changes: { from, to, insert: `${before}${text}${after}` }, selection: { anchor: from + before.length, head: from + before.length + text.length }, scrollIntoView: true });
    instance.focus();
  }
  function addTag() {
    const tag = tagDraft.trim().replace(/^#/, '').trim();
    if (!selected || !tag) return;
    if (tag.length > 40) { setNotice('标签不能超过 40 个字符。'); return; }
    if (selected.tags.length >= 30) { setNotice('每篇笔记最多添加 30 个标签。'); return; }
    if (!selected.tags.includes(tag)) patchNote({ tags: [...selected.tags, tag] });
    setTagDraft('');
  }
  function saveFolder(event: React.FormEvent) {
    event.preventDefault();
    const name = folderName.trim();
    if (!workspace || !name) { setFolderError('请输入文件夹名称。'); return; }
    if (folderParentId && (!workspace.folders.some(f => f.id === folderParentId) || (folderId && insideFolder(workspace.folders, folderParentId, folderId)))) { setFolderError('不能移入自身或子文件夹，请重新选择位置。'); return; }
    if (workspace.folders.some(folder => folder.name === name && folder.id !== folderId && (folder.parentId || null) === folderParentId)) { setFolderError('这个文件夹名称已存在。'); return; }
    if (!folderId && workspace.folders.length >= 200) { setFolderError('最多创建 200 个文件夹。'); return; }
    const id = folderId ?? crypto.randomUUID();
    if (!update(w => ({ ...w, folders: folderId ? w.folders.map(folder => folder.id === id ? { ...folder, name, parentId: folderParentId } : folder) : [...w.folders, { id, name, parentId: folderParentId, createdAt: new Date().toISOString() }] }))) return;
    setModal(null); chooseFilter({ kind: 'folder', id });
  }
  function removeFolder() {
    if (!folderId) return;
    if (!update(w => trashFolder(w, folderId))) return;
    setModal(null); chooseFilter({ kind: 'trash' }); setNotice('文件夹及子文件夹已删除，其中笔记已移入回收站。确认上传后同步删除状态；恢复笔记后可重新分类。');
  }
  async function downloadBackup() {
    if (!workspace) return;
    setBusy(true); setBackupError('');
    try {
      const result = await exportBackup(workspace);
      downloadBlob(result.blob, `枝叶笔记-${result.at.slice(0, 10)}.zip`);
      update(w => ({ ...w, lastBackupAt: result.at }));
      setNotice('已发起备份下载，请确认文件已保存在下载目录。');
    } catch (cause) { setBackupError(cause instanceof Error ? cause.message : '导出失败，请重试。'); }
    finally { setBusy(false); }
  }
  async function exportFolderNow() {
    if (!workspace || filter.kind !== 'folder') return;
    setBusy(true);
    try {
      const blob = await exportFolderZip(workspace, filter.id);
      downloadBlob(blob, `${filterLabel || '文件夹'}.zip`);
      setNotice('文件夹已导出为 ZIP，重新导入可还原文件夹和笔记。');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : '导出失败。'); }
    finally { setBusy(false); }
  }
  async function readBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setBackupError(''); setIncoming(null);setOrganizeImport(false);
    try { setIncoming(await importBackup(file)); }
    catch (cause) { setBackupError(cause instanceof Error ? cause.message : '无法读取备份。'); }
    finally { setBusy(false); }
  }
  function applyImport() {
    if (!workspace || !incoming) return;
    try {
      let resultMessage='备份已合并导入，原有笔记未被覆盖。同名笔记作为副本保留。';
      if (!commit(w => {if(!organizeImport)return mergeWorkspace(w,incoming);const result=organizeWorkspace(w,incoming);resultMessage=`整理 ${result.organized} 篇，新增 ${result.added} 篇，跳过 ${result.skipped} 篇；保留本地正文和删除状态。`;return result.workspace;})) return;
      setIncoming(null); setModal(null); chooseFilter({ kind: 'all' });
      setNotice(resultMessage);
    } catch (cause) { setBackupError(cause instanceof Error ? cause.message : '合并失败，原笔记未修改。'); }
  }
  async function readMarkdown(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []); event.target.value = '';
    if (!workspace || !files.length) return;
    setBusy(true); setBackupError('');
    try {
      if (files.length + workspace.notes.length > 1000) throw new Error('导入后将超过 1000 篇笔记。');
      const imported = await Promise.all(files.map(async file => {
        if (!/\.(md|markdown|txt)$/i.test(file.name) || file.size > 1_000_000) throw new Error('只支持不超过 1 MB 的 Markdown 或文本文件。');
        const decoded=decodeNote(await file.text(),file.name);
        return { ...newNote(), title:decoded.title,content:decoded.content,tags:decoded.tags,visibility:decoded.visibility };
      }));
      if (!commit(w => ({ ...w, notes: [...w.notes, ...imported] }))) return;
      setModal(null); chooseFilter({ kind: 'all' }); setSelectedId(imported[0].id);
      setNotice(`已导入 ${imported.length} 篇笔记。文件中的相对路径图片不会自动导入。`);
    } catch (cause) { setBackupError(cause instanceof Error ? cause.message : '导入失败，原笔记未修改。'); }
    finally { setBusy(false); }
  }
  async function readImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !workspace || !selected) return;
    const noteId = selected.id;
    try {
      if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES || !file.size) throw new Error('请选择不超过 8 MB 的 PNG、JPG、GIF 或 WebP 图片。');
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('读取图片失败。')); reader.readAsDataURL(file);
      });
      const asset: Asset = { id: crypto.randomUUID(), name: file.name.slice(0, 200), mime: file.type, size: file.size, dataUrl, createdAt: new Date().toISOString() };
      const alt = file.name.replace(/[[\]\\\n\r]/g, '');
      const text = `\n\n![${alt}](asset://${asset.id})\n`;
      commit(w => {
        const note = w.notes.find(note => note.id === noteId);
        if (!note || note.deletedAt) throw new Error('原笔记已移除或在回收站中，图片未插入。');
        return { ...w, assets: [...w.assets, asset], notes: w.notes.map(note => note.id === noteId ? { ...note, content: `${note.content}${text}`, updatedAt: new Date().toISOString() } : note) };
      });
      setNotice('图片已保存为本地附件，并插入笔记末尾。');
    } catch (cause) { setNotice(cause instanceof Error ? cause.message : '图片导入失败。'); }
  }
  function deleteNote() {
    if (!selected) return;
    const id = selected.id;
    if (cloud && selected.deletedAt && needsDeletionSync(selected)) { setModal(null); setNotice('请先在「备份与同步」确认同步删除记录，再永久删除。'); return; }
    if (!update(w => ({ ...w, ...(selected.deletedAt ? pruneUnreferencedAssets({ ...w, notes: w.notes.filter(note => note.id !== id), ignoredSources: [...new Set([...(w.ignoredSources || []), ...(selected.github ? [sourceKey(selected.github)] : []), ...(selected.sourceUrl ? [selected.sourceUrl] : []), ...(selected.source ? [sourceKey(selected.source)] : [])])] }) : { notes: w.notes.map(note => note.id === id ? { ...note, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : note) }) }))) return;
    setModal(null); setSelectedId(null); setMobileEditor(false);
setNotice(selected.deletedAt ? '笔记已永久删除。' : (selected.github ? '笔记已移入回收站；已关联云端的删除记录需确认同步。' : '笔记已移入本地回收站，无需上传删除记录。'));
}
  async function emptyTrashNow() {
    if (!workspace) return;
    const trashed = workspace.notes.filter(n => n.deletedAt);
    const pending = cloud ? trashed.filter(needsDeletionSync) : [];
    if (!trashed.length) { setModal(null); setNotice('回收站已经是空的。'); return; }
    setBusy(true);
    const keep = new Set<string>();
    try {
      if (cloud) {

        for (const note of pending) {
          try {
            const github = await publishCloudNote(note, trashToken || getSessionToken());
            if (!update(w => markCloudPublished(w, note.id, github))) throw new Error('本地关联保存失败。');
          } catch (cause) {
            keep.add(note.id);
            setNotice(`${note.title || '未命名笔记'}：${cause instanceof Error ? cause.message : '同步失败'}，已保留在回收站。`);
          }
        }
      }
      if (!update(w => {
        for (const n of w.notes.filter(n=>n.deletedAt)) {
          const original=trashed.find(old=>old.id===n.id);
          if(!original || original.updatedAt!==n.updatedAt || (cloud && needsDeletionSync(n))) keep.add(n.id);
        }
        return emptyTrash(w, [...keep]);
      })) { setNotice('清空失败，请重试。'); return; }
      setModal(null);
      setNotice(keep.size ? `回收站已清空，${keep.size} 篇未完成同步或在操作期间变化的笔记已保留。` : (pending.length ? '回收站已彻底清空，已关联云端的删除状态已同步。' : '回收站已彻底清空，无需上传删除记录。'));
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : '清空回收站失败。');
    } finally { setBusy(false); }
  }

  const trashNeedsSync = cloud && !!workspace?.notes.some(needsDeletionSync);
  if (!workspace) return <main className="startup"><LeafIcon size={42} weight="duotone" /><h1>枝叶笔记</h1>{status === 'loading' ? <><p>正在打开你的本地笔记库…</p><div className="loading-line" /></> : <><p role="alert">{error}</p><button className="primary-button" onClick={() => location.reload()}>重新打开</button></>}</main>;
  const selectAll=()=>setBatch(allSelectable(workspace));
  const invertBatch=()=>setBatch(s=>invertSelection(workspace,s));
  const toggleBatch=(kind:'notes'|'folders',id:string)=>setBatch(s=>kind==='folders'?toggleFolderSelection(workspace,s,id):{...s,notes:s.notes.includes(id)?s.notes.filter(x=>x!==id):[...s.notes,id]});
  const toggleBatchNotes=(ids:string[],selected:boolean)=>setBatch(s=>({...s,notes:selected?[...new Set([...s.notes,...ids])]:s.notes.filter(id=>!ids.includes(id))}));
  return <div style={{'--sidebar-width':`${panes.sidebarWidth}px`,'--list-width':`${panes.listWidth}px`} as CSSProperties} className={`app-shell ${view === 'preview' ? 'reading-mode' : ''} ${panes.sidebar ? '' : 'sidebar-hidden'} ${panes.list ? '' : 'list-hidden'} ${mobileEditor ? 'show-editor' : ''}`}>
    <a className="skip-link" href="#note-title">跳到笔记编辑</a>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setSidebarOpen(false)} />}
    <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`} aria-label="笔记分类">
      <div className="brand"><span className="brand-mark"><LeafIcon size={26} weight="duotone" /></span><div><strong>枝叶</strong><span>给想法一个生长的地方</span></div><button className="icon-button mobile-close" aria-label="关闭导航" onClick={() => setSidebarOpen(false)}><XIcon /></button></div>
      <div className="sidebar-actions">
        <button className="new-note-button" onClick={createNote}><PlusIcon size={16} weight="bold" />新建笔记</button>
        <ImportMenu onBackup={w=>{setIncoming(w);setBackupError('');setModal('backup');}} workspace={workspace} update={update} onImported={id => { setFilter({kind:'all'}); setQuery(''); setSelectedId(id); setMobileEditor(true); setView('rich'); }} onNotice={setNotice} />
        <button className="sidebar-action-icon" aria-label="新建文件夹" title="新建文件夹" onClick={() => { setFolderId(null); setFolderParentId(filter.kind === 'folder' ? filter.id : null); setFolderName(''); setFolderError(''); setModal('folder'); }}><FolderPlusIcon size={17} /></button>
        <button className={`sidebar-action-icon ${batchMode?'active':''}`} aria-label="多选" title="多选笔记" onClick={()=>{setBatchMode(!batchMode);clearBatch();setPanes(p=>({...p,list:true}));}}><CheckSquareIcon size={17} /></button>
      </div>
      <nav className="main-nav">
        <button className={filter.kind === 'all' ? 'active' : ''} onClick={() => chooseFilter({ kind: 'all' })}><BookOpenIcon />全部笔记<span>{liveNotes.length}</span></button>
        <button className={filter.kind === 'pinned' ? 'active' : ''} onClick={() => chooseFilter({ kind: 'pinned' })}><PushPinIcon />置顶笔记<span>{liveNotes.filter(note => note.pinned).length}</span></button>
      </nav>
      <div className="sidebar-scroll">{batchMode&&<BulkActions workspace={workspace} selection={batch} update={update} clear={clearBatch} onSelectAll={selectAll} onInvert={invertBatch}/>}
        <div className="section-label"><span>我的文件夹</span></div>
        <FolderTree batch={batchMode?{...batch,toggle:toggleBatch,toggleNotes:toggleBatchNotes}:undefined} manage={(id,name)=>{setFolderId(id);setFolderParentId(workspace.folders.find(f=>f.id===id)?.parentId || null);setFolderName(name);setFolderError('');setModal('folder');}} workspace={workspace} filter={filter} selectedId={selectedId} choose={value=>{setFilter(value);setQuery('');setMobileEditor(false);}} openNote={note=>{setFilter(note.folderId?{kind:'folder',id:note.folderId}:{kind:'unfiled'});setQuery('');setSelectedId(note.id);setMobileEditor(true);setSidebarOpen(false);}}/>
        <div className="section-label tags-label"><span>标签</span><HashIcon size={14} /></div>
        <div className="sidebar-tags">{tags.length ? tags.map(tag => <button key={tag} className={filter.kind === 'tag' && filter.id === tag ? 'active' : ''} onClick={() => chooseFilter({ kind: 'tag', id: tag })}><span>#</span>{tag}</button>) : <small>在笔记中添加标签，方便寻找。</small>}</div>
        <button className={`trash-nav ${filter.kind === 'trash' ? 'active' : ''}`} onClick={() => chooseFilter({ kind: 'trash' })}><TrashIcon size={18} />回收站<span>{workspace.notes.filter(note => note.deletedAt).length}</span></button>
      </div>
      <div className="sidebar-bottom">
        <details className="sidebar-tools"><summary>备份与同步</summary><div className="local-card"><button onClick={() => { setBackupError(''); setIncoming(null); setModal('backup'); }}>备份与导入<ArrowUpRightIcon size={16} /></button><small>{workspace.lastBackupAt ? `最近发起备份：${dateLabel(workspace.lastBackupAt)}` : '还没有导出过备份'}</small></div>
        {cloud&&<button className="sidebar-pull" title={syncStatus} onClick={()=>void pull()}>↻ 获取 GitHub 更新</button>}<small className="source-sync-status" role="status">{syncStatus}</small><RepositorySettings /><SyncReminder workspace={workspace} update={update} ready={status === 'saved'} /><AppUpdates /></details><div className="sidebar-footer"><button onClick={() => setModal('info')}><GithubLogoIcon size={18} />使用说明</button><select className="theme-select" aria-label="外观主题" value={theme} onChange={event => setTheme(event.target.value as typeof theme)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></div>
      </div>
    </aside>
    <PaneResize label="调整目录栏宽度" width={panes.sidebarWidth} setWidth={sidebarWidth=>setPanes(p=>({...p,sidebarWidth}))} /><section className="notes-panel" aria-label="笔记列表">
      <div className="list-heading"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setSidebarOpen(true)}><SidebarSimpleIcon /></button><h1>{filterLabel}</h1>{filter.kind === 'folder' && <><button className="icon-button" aria-label="导出此文件夹" title="导出文件夹为 ZIP" disabled={busy} onClick={() => void exportFolderNow()}><DownloadSimpleIcon size={18} /></button><button className="icon-button" aria-label="管理当前文件夹" onClick={() => { setFolderId(filter.id); setFolderParentId(workspace.folders.find(f=>f.id===filter.id)?.parentId || null); setFolderName(filterLabel); setFolderError(''); setModal('folder'); }}><NotePencilIcon size={18} /></button></>}{filter.kind === 'trash' && workspace.notes.some(n => n.deletedAt) && <button className="text-button danger-text" onClick={() => { setTrashToken(''); setModal('trash'); }}>清空回收站</button>}</div>
      <div className="search-field"><MagnifyingGlassIcon size={18} /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} aria-label="搜索笔记" placeholder="搜索标题、正文、标签" /><kbd>⌘ K</kbd></div>
      <div className="list-caption">{batchMode&&<button onClick={()=>setBatch(s=>({...s,notes:[...new Set([...s.notes,...notes.map(n=>n.id)])]}))}>全选当前列表</button>}{query ? <span>搜索结果</span> : <select className="sort-select" value={noteSort} onChange={event => setNoteSort(event.target.value as NoteSort)} aria-label="笔记排序方式"><option value="updated">按最近修改排序</option><option value="created">按创建时间排序</option><option value="titleAsc">按标题拼音 A→Z</option><option value="titleDesc">按标题拼音 Z→A</option></select>}<span>{notes.length} 篇</span></div>
      <div className="note-list">{notes.length ? notes.map(note => <div className={`note-selection-row ${batchMode&&batch.notes.includes(note.id)?'selected':''}`} key={note.id}>{batchMode&&<input type="checkbox" aria-label={`选择列表笔记 ${note.title}`} checked={batch.notes.includes(note.id)} onChange={()=>toggleBatch('notes',note.id)}/>}<button className={`note-item ${selected?.id === note.id ? 'selected' : ''}`} onClick={() => { setSelectedId(note.id); setMobileEditor(true); }}><div className="note-item-title"><FileTextIcon size={17} /><strong>{note.title || '未命名笔记'}</strong>{note.pinned && <PushPinIcon size={13} weight="fill" />}</div><p>{noteSummary(note)}</p><div className="note-item-meta"><span>{dateLabel(note.updatedAt)}</span>{note.tags[0] && <span className="mini-tag">{note.tags[0]}</span>}</div></button>{!batchMode && <button className="note-export" aria-label={`导出 ${note.title}`} title="导出此篇 Markdown" onClick={() => exportNote(note.title, note.content)}><DownloadSimpleIcon size={15} /></button>}</div>) : <div className="list-empty"><MagnifyingGlassIcon size={32} /><h2>{query ? '没有找到这篇笔记' : '这里还没有笔记'}</h2><p>{query ? '换个关键词，或查看其他分类。' : filter.kind === 'trash' ? '移入回收站的笔记会出现在这里。' : '新建一篇，把想法记录下来。'}</p>{query ? <button onClick={() => setQuery('')}>清除搜索</button> : filter.kind !== 'trash' && <button onClick={createNote}>新建笔记</button>}</div>}</div>
      <div className="list-footer">{cloud?<button title={syncStatus} onClick={()=>void pull()}>↻ 刷新笔记库</button>:<small>仅本地 · 自动保存</small>}</div>
    </section>
    <PaneResize label="调整笔记列表宽度" width={panes.listWidth} setWidth={listWidth=>setPanes(p=>({...p,listWidth}))} /><main className="workspace-panel">
      <header className="workspace-header"><div className="pane-toggles"><button className="text-button" aria-label="切换目录侧栏" aria-pressed={panes.sidebar} onClick={()=>{if(window.innerWidth<=800)setSidebarOpen(v=>!v);else setPanes(p=>({...p,sidebar:!p.sidebar}));}}><SidebarSimpleIcon size={16}/>目录</button><button className="text-button" aria-label="切换笔记列表" aria-pressed={panes.list} onClick={()=>{setPanes(p=>({...p,list:!p.list}));setMobileEditor(false);}}><ListBulletsIcon size={16}/>列表</button></div><div className="breadcrumb"><button className="icon-button back-button" aria-label="返回笔记列表" onClick={() => setMobileEditor(false)}><ArrowLeftIcon /></button><span>个人空间</span><CaretRightIcon size={12} /><strong>{selected ? workspace.folders.find(folder => folder.id === selected.folderId)?.name ?? '未分类' : '笔记'}</strong></div><span className={`save-status ${status}`} role="status">{status === 'saved' ? <CheckCircleIcon size={15} /> : status === 'saving' ? <span className="saving-dot" /> : <WarningCircleIcon size={16} />}{saveLabel}</span></header>
      {limitError && <div className="storage-alert" role="alert">{limitError}<button onClick={()=>{setBackupError('');setModal('backup');}}>导出备份</button><button onClick={()=>chooseFilter({kind:'trash'})}>整理回收站</button><button onClick={()=>setLimitError('')}>关闭</button></div>}
      {error && <div className="storage-alert" role="alert"><WarningCircleIcon size={20} /><div>{error}</div><button onClick={() => { setBackupError(''); setIncoming(null); setModal('backup'); }}>导出备份</button>{status === 'error' && <button onClick={retry}>重试保存</button>}{status === 'conflict' && <button onClick={() => { if (window.confirm('重新载入会丢弃本页未保存内容。请先导出备份，确定继续？')) location.reload(); }}>重新载入</button>}</div>}
      {selected ? <>
        {view !== 'preview' && <div className="note-heading"><div className="note-kicker"><span className="document-kind"><FileTextIcon size={15} />MARKDOWN</span><div className="note-actions">{selected.deletedAt ? <button className="text-button" onClick={() => { update(w => ({ ...w, notes: w.notes.map(note => note.id === selected.id ? { ...note, deletedAt: null, updatedAt: new Date().toISOString() } : note) })); setNotice('笔记已恢复。'); }}><ArrowCounterClockwiseIcon />恢复笔记</button> : <button className={`icon-button ${selected.pinned ? 'is-pinned' : ''}`} aria-label={selected.pinned ? '取消置顶' : '置顶笔记'} onClick={() => patchNote({ pinned: !selected.pinned })}><PushPinIcon size={19} weight={selected.pinned ? 'fill' : 'regular'} /></button>}<button className="icon-button" aria-label="导出此篇 Markdown，不含附件" onClick={() => exportNote(selected.title, selected.content)}><DownloadSimpleIcon size={19} /></button><button className="icon-button" aria-label={selected.deletedAt ? '永久删除笔记' : '移入回收站'} onClick={() => setModal('delete')}><TrashIcon size={19} /></button></div></div>
          <input id="note-title" className="note-title" aria-label="笔记标题" value={selected.title} maxLength={200} readOnly={!!selected.deletedAt} onChange={event => patchNote({ title: event.target.value })} placeholder="未命名笔记" />
          <div className="note-metadata"><label className="folder-select"><FolderIcon size={14} /><span>移动到</span><select aria-label="笔记所属文件夹" value={selected.folderId ?? ''} disabled={!!selected.deletedAt} onChange={event => moveSelectedNote(event.target.value || null)}><option value="">未分类</option>{workspace.folders.map(folder => <option key={folder.id} value={folder.id}>{folderLabel(workspace.folders,folder.id)}</option>)}</select></label><select className="note-visibility" aria-label="笔记公开或私密" value={selected.visibility || 'public'} disabled={!!selected.deletedAt} onChange={e=>patchNote({visibility:e.target.value as 'public'|'private'})}><option value="public">public · 公开</option><option value="private">private · 私密</option></select><span className="meta-separator" /><span title={fullDate(selected.updatedAt)}>更新于 {dateLabel(selected.updatedAt)}</span>{selected.deletedAt && <span className="deleted-badge">已在回收站 · 只读</span>}
          <div className="note-tags">{selected.tags.map(tag => <span className="note-tag" key={tag}><HashIcon size={11} />{tag}{!selected.deletedAt && <button aria-label={`移除标签 ${tag}`} onClick={() => patchNote({ tags: selected.tags.filter(item => item !== tag) })}><XIcon size={11} /></button>}</span>)}{!selected.deletedAt && <form onSubmit={event => { event.preventDefault(); addTag(); }}><PlusIcon size={12} /><input aria-label="添加标签，按回车确认" maxLength={40} placeholder="添加标签" value={tagDraft} onChange={event => setTagDraft(event.target.value)} /></form>}</div></div>
        </div>}
        <div className="editor-controls"><div className="view-switch" aria-label="笔记显示模式">{([{ id: 'rich', title: '即时编辑', icon: NotePencilIcon }, { id: 'edit', title: '源码', icon: NotePencilIcon }, { id: 'split', title: '双栏', icon: SplitHorizontalIcon }, { id: 'preview', title: '阅读', icon: BookOpenIcon }] as const).map(mode => <button key={mode.id} aria-pressed={view === mode.id} className={view === mode.id ? 'active' : ''} onClick={() => setView(mode.id)}><mode.icon size={15} />{mode.title}</button>)}</div>{view !== 'preview' && <><MindMapTool key={selected.id} content={selected.content} readOnly={!!selected.deletedAt} onSave={content => patchNote({ content })} /><FlowTool key={`flow-${selected.id}`} content={selected.content} readOnly={!!selected.deletedAt} onSave={content => patchNote({ content })} /></>}<StudyTools workspace={workspace} selected={selected} update={update} /></div>
        {((selected.github && selected.github.url.toLowerCase()!==noteDestination(selected).url.toLowerCase()) || !!selected.publications?.length) && <div className="storage-alert" role="status">此笔记有旧仓库发布副本。切换 public / private 只改变后续上传目标，不会删除旧副本或 Git 历史；需要在旧仓库另行撤回。</div>}
        {selected.source?.missing && <div className="storage-alert" role="status">来源暂时无法下载，已保留本地内容。恢复网络或权限后点击「刷新笔记库」重试。</div>}
        <div className={`editor-layout mode-${view}`}>
          {view === 'rich' && <RichEditor key={`${selected.id}-${!!selected.deletedAt}`} value={selected.content} readOnly={!!selected.deletedAt} acceptChange={acceptEditorChange} onChange={content => {try{edit(selected.id,content);}catch(cause){setLimitError(cause instanceof Error?cause.message:'修改未保存');}}} />}
          {view !== 'preview' && view !== 'rich' && <section className="editor-pane" aria-label="Markdown 编辑区域"><div className="format-toolbar"><button aria-label="插入标题" disabled={!!selected.deletedAt} onClick={() => insert('## ', '', '标题')}><TextHIcon /></button><button aria-label="插入粗体" disabled={!!selected.deletedAt} onClick={() => insert('**', '**', '加粗文字')}><TextBIcon /></button><button aria-label="插入列表" disabled={!!selected.deletedAt} onClick={() => insert('\n- ', '', '列表内容')}><ListBulletsIcon /></button><button aria-label="插入待办" disabled={!!selected.deletedAt} onClick={() => insert('\n- [ ] ', '', '待办事项')}><CheckSquareIcon /></button><span className="toolbar-divider" /><select aria-label="代码块语言" value={codeLanguage} onChange={event => setCodeLanguage(event.target.value)}>{['typescript', 'javascript', 'python', 'java', 'sql', 'bash', 'json', 'html', 'css', 'go', 'rust', 'cpp', 'text'].map(language => <option key={language} value={language}>{language}</option>)}</select><button aria-label="插入代码块" disabled={!!selected.deletedAt} onClick={() => insert(`\n\n\`\`\`${codeLanguage}\n`, '\n```\n', '// 在这里写代码')}><CodeIcon /></button><button aria-label="插入本地图片" disabled={!!selected.deletedAt} onClick={() => imageInput.current?.click()}><ImageIcon /></button></div>
            <MarkdownEditor ref={editor} key={`${selected.id}-${!!selected.deletedAt}`} value={selected.content} readOnly={!!selected.deletedAt} acceptChange={acceptEditorChange} onChange={content => {try{edit(selected.id,content);}catch(cause){setLimitError(cause instanceof Error?cause.message:'修改未保存');}}} />
          </section>}
          {view !== 'edit' && view !== 'rich' && <section key={selected.id} className="preview-pane" aria-label="笔记预览"><div className="reading-paper">{view === 'preview' && <header className="reading-heading"><small>{selected.folderId ? folderLabel(workspace.folders, selected.folderId) : '未分类'}</small><h1 id="note-title">{selected.title || '未命名笔记'}</h1><div><span>更新于 {dateLabel(selected.updatedAt)}</span><span>约 {Math.max(1, Math.ceil(selected.content.length / 500))} 分钟阅读</span>{selected.deletedAt && <span>回收站 · 只读</span>}</div>{selected.tags.length > 0 && <p>{selected.tags.map(tag => <span className="note-tag" key={tag}># {tag}</span>)}</p>}</header>}<div className="preview-caption"><BookOpenIcon size={14} /><span>预览</span><span>{sharedStorageEnabled()?'本机 App 与浏览器共享':'内容仅保存在本机'}</span></div><MarkdownPreview content={selected.content} assets={workspace.assets} /></div></section>}
        </div>
        <footer className="editor-footer"><span>{selected.content.length.toLocaleString()} 字符<span className="footer-dot">·</span>{selected.content.split('\n').length} 行</span><span>创建于 {dateLabel(selected.createdAt)}<span className="footer-dot">·</span>自动保存</span></footer>
      </> : <div className="workspace-empty"><span className="empty-mark"><NotePencilIcon size={44} weight="duotone" /></span><h2>选择或新建笔记</h2><button className="primary-button" onClick={createNote}><PlusIcon />新建笔记</button><StudyTools workspace={workspace} selected={null} update={update} /></div>}
    </main>
    <input className="hidden-input" ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="选择本地图片" onChange={event => void readImage(event)} />
    <input className="hidden-input" ref={backupInput} type="file" accept=".zip,.json" aria-label="选择备份文件" onChange={event => void readBackup(event)} />
    <input className="hidden-input" ref={markdownInput} type="file" accept=".md,.markdown,.txt" multiple aria-label="选择 Markdown 文件" onChange={event => void readMarkdown(event)} />
    <Modal open={modal === 'folder'} title={folderId ? '管理文件夹' : '新建文件夹'} description="删除文件夹会同时删除所有子文件夹，其中的笔记移入回收站，可恢复到未分类。未关联云端的笔记无需上传删除记录。" onClose={() => setModal(null)}><form onSubmit={saveFolder}><label className="form-label" htmlFor="folder-name">文件夹名称</label><input className="form-input" id="folder-name" maxLength={60} value={folderName} onChange={event => setFolderName(event.target.value)} autoFocus /><label className="form-label" htmlFor="folder-parent">位置（移动到）</label><select className="form-input" id="folder-parent" value={folderParentId || ''} onChange={event=>setFolderParentId(event.target.value || null)}><option value="">顶层文件夹</option>{workspace.folders.filter(f=>!folderId || !insideFolder(workspace.folders,f.id,folderId)).map(f=><option key={f.id} value={f.id}>{folderLabel(workspace.folders,f.id)}</option>)}</select><p className="backup-footnote">移动会保留其中的笔记和子文件夹，可随时再次调整。仅调整本地分类，不改变 GitHub 文件路径。</p>{folderError && <p className="form-error" role="alert">{folderError}</p>}<div className="modal-actions">{folderId && <button type="button" className="danger-button" onClick={() => { const count = workspace.notes.filter(n => !n.deletedAt && insideFolder(workspace.folders, n.folderId, folderId)).length; const children = workspace.folders.filter(f => f.id !== folderId && insideFolder(workspace.folders, f.id, folderId)).length; if (window.confirm(`删除「${folderName}」及 ${children} 个子文件夹？其中 ${count} 篇笔记将移入回收站，可恢复到未分类。只有已关联云端的笔记才需要同步删除记录。`)) removeFolder(); }}>删除文件夹</button>}<button type="button" className="secondary-button" onClick={() => setModal(null)}>取消</button><button className="primary-button" type="submit">{folderId ? '保存' : '创建文件夹'}</button></div></form></Modal>
    <Modal open={modal === 'backup'} title="带走你的笔记" description="备份包含全部笔记、回收站、文件夹、标签和本地图片。下载后请确认文件已保存。" onClose={() => { if (!busy) setModal(null); }}><TitleRepair workspace={workspace} update={update}/><div className="backup-options"><button disabled={busy} onClick={() => void downloadBackup()}><DownloadSimpleIcon size={24} /><div><strong>{busy ? '正在处理…' : '导出完整 ZIP 备份'}</strong><small>可恢复的原始数据 + 独立 Markdown + 图片</small></div><ArrowUpRightIcon /></button><button disabled={busy} onClick={() => backupInput.current?.click()}><UploadSimpleIcon size={24} /><div><strong>从备份导入</strong><small>支持枝叶笔记 ZIP / JSON，不覆盖已有内容</small></div><ArrowUpRightIcon /></button><button disabled={busy} onClick={() => markdownInput.current?.click()}><FileTextIcon size={24} /><div><strong>导入 Markdown</strong><small>支持多个 .md / .txt 文件，不含相对路径图片</small></div><ArrowUpRightIcon /></button></div>{incoming && <div className="import-summary"><strong>准备导入 {incoming.notes.length} 篇笔记</strong><p>{incoming.folders.length} 个文件夹，{incoming.assets.length} 个附件。</p><label><input type="checkbox" checked={organizeImport} onChange={e=>setOrganizeImport(e.target.checked)}/>按云端路径／来源整理已有笔记，保留本地正文与删除状态</label><p>{organizeImport?'只对识别到的同一文档更新分类、标签和未自行修改的标题；其他笔记作为新增导入。':'同名笔记作为副本保留；原有内容不变。'}</p><div><button className="secondary-button" onClick={() => setIncoming(null)}>取消导入</button><button className="primary-button" onClick={applyImport}>确认合并导入</button></div></div>}{backupError && <p className="form-error" role="alert">{backupError}</p>}{(status === 'error' || status === 'conflict') && <button className="text-button" onClick={() => downloadBlob(new Blob([JSON.stringify(workspace)], { type: 'application/json' }), '枝叶笔记-紧急恢复.json')}>下载当前页面原始 JSON，保留未保存修改</button>}<p className="backup-footnote">{workspace.lastBackupAt ? `最近发起备份下载：${fullDate(workspace.lastBackupAt)}` : '你还没有导出过备份，建议现在保留一份。'}<br />整个笔记库上限 50 MB。公开与私密笔记分别同步到对应仓库；ZIP 备份保存在本地。</p></Modal>
    <Modal open={modal === 'info'} title="本地记录，按需发布" description="笔记默认保存在本机，只有主动发布才会上传到 GitHub。" onClose={() => setModal(null)}><div className="roadmap-row"><GithubLogoIcon size={24} /><div><strong>GitHub 文档导入与发布</strong><p>在笔记正文上方点击 GitHub 导入 / 发布。支持导入 Markdown 文档，发布或更新 MD / HTML 文件；远端有新修改时会停止并提示冲突。</p></div></div><a className="text-button" href="https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages" target="_blank" rel="noopener noreferrer">了解 GitHub Pages <ArrowSquareOutIcon size={15} /></a></Modal>
    <Modal open={modal === 'delete'} title={selected?.deletedAt ? '永久删除这篇笔记？' : '移入回收站？'} description={selected?.github ? (selected.deletedAt ? '永久删除无法撤销。已关联云端的笔记需先同步删除记录。' : '笔记会保留在回收站。确认同步删除记录后，其他设备刷新时生效。') : (selected?.deletedAt ? '仅删除本地记录，无法撤销；无需上传删除记录。' : '笔记会保留在本机回收站，可恢复；没有云端关联，无需上传删除记录。')} onClose={() => setModal(null)}><p className="delete-note-name">{selected?.title}</p><div className="modal-actions"><button className="secondary-button" onClick={() => setModal(null)}>取消</button><button className="danger-button" onClick={deleteNote}>{selected?.deletedAt ? '确认永久删除' : '移入回收站'}</button></div></Modal>
<Modal open={modal === 'trash'} title="清空回收站？" description={trashNeedsSync ? "永久删除无法撤销。仅为已关联云端且尚未同步删除的笔记上传删除记录；同步失败的笔记保留。" : "永久删除本地回收站内容，无法撤销。本次无需联网、Token 或上传删除记录。"} onClose={() => { if (!busy) setModal(null); }}><p className="delete-note-name">共 {workspace.notes.filter(n => n.deletedAt).length} 篇笔记</p>{trashNeedsSync && !window.zhiye && (getSessionToken() ? <p className="backup-footnote">将使用本次窗口已保存的 GitHub Token 同步删除状态。</p> : <><label>GitHub Token（浏览器版需要，桌面版自动使用本机登录）<input type="password" autoComplete="off" value={trashToken} disabled={busy} onChange={e => setTrashToken(e.target.value)} /></label><a className="text-button" href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">如何获取 Token（需要 Contents 读写权限）</a></>)}<p className="backup-footnote">清空后本机笔记将彻底删除。云端删除状态会同步（GitHub 文件保留在历史中，不物理删除）；未关联云端的本地笔记直接彻底删除。</p><div className="modal-actions"><button className="secondary-button" disabled={busy} onClick={() => setModal(null)}>取消</button><button className="danger-button" disabled={busy || (trashNeedsSync && !window.zhiye && !trashToken && !getSessionToken())} onClick={() => void emptyTrashNow()}>{busy ? '正在清空…' : '确认清空'}</button></div></Modal>
    {notice && <div className="toast" role="status"><CheckCircleIcon size={18} /><span>{notice}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setNotice('')}><XIcon size={16} /></button></div>}
  </div>;
}
