import { insideFolder, folderLabel } from './folders';
import { z } from 'zod';
import type { Filter, Note, NoteSort, Workspace } from '../types';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 60 * 1024 * 1024;
export const MAX_WORKSPACE_BYTES = 50 * 1024 * 1024;
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const date = z.iso.datetime();
const noteSchema = z.object({
  syncMode:z.enum(['reference','full']).optional(),
  visibility:z.enum(['public','private']).optional(),
  publications:z.array(z.object({url:z.string().url().max(500),branch:z.string().min(1).max(250),path:z.string().min(1).max(1000)}).strict()).max(100).optional(),
  folderPath: z.array(z.string().min(1).max(60)).max(200).optional(),
  source: z.object({commit:z.string().regex(/^[a-f0-9]{40,64}$/).optional(),url:z.string().url().max(500).refine(v=>new URL(v).origin === "https://github.com"),branch:z.string().min(1).max(250),path:z.string().min(1).max(1000),sha:z.string().regex(/^[a-f0-9]{40,64}$/),baseContent:z.string().max(1_000_000),missing:z.boolean().optional()}).strict().optional(),
  importFolderKey: z.string().max(2000).optional(),
  sourceUrl: z.string().url().max(2000).optional(),
  github: z.object({
    transport:z.enum(['file','manifest']).optional(),
    baseSnapshot: z.string().max(1_010_000).optional(),
    baseContent: z.string().max(1_000_000).optional(),
    url: z.string().url().max(500).refine(value => { try { return new URL(value).origin === 'https://github.com'; } catch { return false; } }),
    branch: z.string().min(1).max(250), path: z.string().min(1).max(1000),
    sha: z.string().regex(/^[a-f0-9]{40,64}$/), format: z.enum(['md', 'html']), syncedAt: date,
  }).strict().optional(),
  id, title: z.string().max(200), content: z.string().max(1_000_000),
  folderId: id.nullable(), tags: z.array(z.string().min(1).max(40)).max(30),
  pinned: z.boolean(), createdAt: date, updatedAt: date, deletedAt: date.nullable(),
}).strict();
const folderSchema = z.object({ parentId: id.nullable().optional(), sourceKey: z.string().max(2000).optional(), id, name: z.string().min(1).max(60), createdAt: date }).strict();
const assetSchema = z.object({
  id, name: z.string().max(200), mime: z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp']),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES),
  dataUrl: z.string().max(12_000_000).regex(/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+={0,2}$/),
  createdAt: date,
}).strict();
export const workspaceSchema = z.object({
  ignoredSources: z.array(z.string().max(3000)).max(10000).optional(),
  schemaVersion: z.literal(1), id,
  notes: z.array(noteSchema).max(1000), folders: z.array(folderSchema).max(200),
  assets: z.array(assetSchema).max(500), updatedAt: date, lastBackupAt: date.nullable(),
}).strict().superRefine((workspace, ctx) => {
  for (const key of ['notes', 'folders', 'assets'] as const) {
    if (new Set(workspace[key].map(item => item.id)).size !== workspace[key].length) {
      ctx.addIssue({ code: 'custom', message: `${key} 包含重复 ID` });
    }
  }
  const folders = new Set(workspace.folders.map(folder => folder.id));
  if (workspace.notes.some(note => note.folderId !== null && !folders.has(note.folderId))) {
    ctx.addIssue({ code: 'custom', message: '笔记引用了不存在的文件夹' });
  }
  for (const folder of workspace.folders) {
    if (folder.parentId && (!folders.has(folder.parentId) || insideFolder(workspace.folders, folder.parentId, folder.id))) ctx.addIssue({code:'custom',message:'文件夹父级无效或存在循环'});
  }
  for (const asset of workspace.assets) {
    const [header, body] = asset.dataUrl.split(',');
    const bytes = Math.floor(body.length * 3 / 4) - (body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0);
    if (body.length % 4 !== 0 || header !== `data:${asset.mime};base64` || bytes !== asset.size) {
      ctx.addIssue({ code: 'custom', message: '图片格式或大小不匹配' });
    }
  }
});

export function validateWorkspace(value: unknown): Workspace {
  const result = workspaceSchema.safeParse(value);
  if (!result.success) throw new Error('备份格式不正确、版本不支持，或存在无效的笔记和附件。');
  if (new TextEncoder().encode(JSON.stringify(result.data)).byteLength > MAX_WORKSPACE_BYTES) {
    throw new Error('笔记库超过 50 MB，请减小附件体积后重试。');
  }
  return result.data;
}

export function newNote(folderId: string | null = null): Note {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: '未命名笔记', content: '', folderId, tags: [], pinned: false, createdAt: now, updatedAt: now, deletedAt: null };
}

export function createWorkspace(): Workspace {
  const now = new Date().toISOString();
  const base = (id: string, title: string, content: string, folderId: string | null, tags: string[], pinned = false): Note => ({
    id, title, content, folderId, tags, pinned, createdAt: now, updatedAt: now, deletedAt: null,
  });
  return {
    schemaVersion: 1, id: crypto.randomUUID(), updatedAt: now, lastBackupAt: null, assets: [],
    folders: [{ id: 'learning', name: '学习笔记', createdAt: now }, { id: 'snippets', name: '代码片段', createdAt: now }, { id: 'ideas', name: '灵感收集', createdAt: now }],
    notes: [
      base('welcome', '让想法，在这里生长', '# 从一个想法开始\n\n这里是你的个人笔记空间。把零散的想法、学习记录和代码片段，慢慢整理成自己的知识。\n\n> 不必一次写得完美。先记下来，再连接起来。\n\n## 三种写作方式\n\n- **编辑**：专注写 Markdown。\n- **双栏**：边写边看，实时预览。\n- **阅读**：把笔记当作一篇文章。\n\n## 让知识可带走\n\n笔记自动保存在当前浏览器。点击左下角的「导出备份」，可以带走整个笔记库，包含 Markdown 和图片。\n\n- [x] 创建第一篇笔记\n- [ ] 试着粘贴一段代码\n- [ ] 下载一份本地备份\n\n## 一段小代码\n\n```typescript\nconst ideas = ["记录", "整理", "连接"];\n\nfunction grow(idea: string) {\n  return `${idea}，让知识慢慢生长。`;\n}\n\nideas.forEach(idea => console.log(grow(idea)));\n```\n\n---\n\n**提醒**：清除浏览器数据可能删除本地笔记。使用正文上方的 GitHub 按钮导入文档或发布笔记；使用随机考试复习问答。思维导图尚未接入。', 'learning', ['开始使用'], true),
      base('markdown', 'Markdown 速查手册', '# Markdown 速查\n\n## 常用格式\n\n| 写法 | 效果 |\n| --- | --- |\n| `**文字**` | **加粗** |\n| `*文字*` | *斜体* |\n| `~~文字~~` | ~~删除线~~ |\n| `` `code` `` | 行内代码 |\n\n## 列表与链接\n\n1. 先写清楚问题\n2. 再记录解决方法\n3. 最后整理可复用的知识\n\n[Markdown 指南](https://www.markdownguide.org/basic-syntax/)\n\n> 工具栏可以快速插入标题、列表、待办、代码和图片。', 'learning', ['Markdown']),
      base('code', '一个实用的防抖函数', '# 防抖函数\n\n连续触发事件时，只执行最后一次。适用于搜索框、输入联想等场景。\n\n```javascript\nfunction debounce(fn, delay = 300) {\n  let timer;\n  return (...args) => {\n    clearTimeout(timer);\n    timer = setTimeout(() => fn(...args), delay);\n  };\n}\n\nconst search = debounce(query => {\n  console.log("Search:", query);\n});\n```\n\n## 使用时注意\n\n- 在组件卸载时清理计时器。\n- 如果需要保留调用上下文，可使用 `fn.apply`。', 'snippets', ['JavaScript', '代码']),
      base('idea', '留给下一个灵感', '# 还没成形的想法\n\n今天有什么值得记住？\n\n- 一本想读的书\n- 一个需要验证的猜想\n- 一段突然想通的思路\n\n不用急着分类，让它先留在这里。', 'ideas', ['灵感']),
    ],
  };
}

export type NoteSorter = (a: Note, b: Note) => number;
export const noteSorters: Record<NoteSort, NoteSorter> = {
  updated: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  created: (a, b) => b.createdAt.localeCompare(a.createdAt),
  titleAsc: (a, b) => (a.title || '未命名笔记').localeCompare(b.title || '未命名笔记', 'zh-Hans-CN', { sensitivity: 'base' }),
  titleDesc: (a, b) => (b.title || '未命名笔记').localeCompare(a.title || '未命名笔记', 'zh-Hans-CN', { sensitivity: 'base' }),
};

export function sortNotes(notes: Note[], sort: NoteSort): Note[] {
  const rest = noteSorters[sort] ?? noteSorters.updated;
  return [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || rest(a, b));
}

export function filterNotes(workspace: Workspace, filter: Filter, query: string, sort: NoteSort = 'updated'): Note[] {
const needle = query.trim().toLocaleLowerCase();
return sortNotes(workspace.notes.filter(note => {
if (filter.kind === 'trash' ? !note.deletedAt : !!note.deletedAt) return false;
if (filter.kind === 'pinned' && !note.pinned) return false;
if (filter.kind === 'unfiled' && note.folderId !== null) return false;
if (filter.kind === 'folder' && !insideFolder(workspace.folders, note.folderId, filter.id)) return false;
if (filter.kind === 'tag' && !note.tags.includes(filter.id)) return false;
return !needle || `${note.title}\n${note.content}\n${note.tags.join(' ')}`.toLocaleLowerCase().includes(needle);
}), sort);
}

export function summary(content: string): string {
  return content.replace(/```[\s\S]*?```/g, ' [代码片段] ').replace(/!\[[^\]]*\]\([^)]*\)/g, ' [图片] ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[#>*_`~|[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100) || '还没有内容，写下第一个想法…';
}

export function pruneUnreferencedAssets(workspace: Workspace): Workspace {
  const referenced = new Set(workspace.notes.flatMap(note => Array.from(note.content.matchAll(/asset:\/\/([a-zA-Z0-9_-]+)/g), match => match[1])));
  return { ...workspace, assets: workspace.assets.filter(asset => referenced.has(asset.id)) };
}

export function mergeWorkspace(current: Workspace, incoming: Workspace): Workspace {
  current = validateWorkspace(current);
  incoming = validateWorkspace(incoming);
  const now = new Date().toISOString();
  const folderIds = new Map<string, string>();
  const folders = [...current.folders];
  for (const folder of [...incoming.folders].sort((a,b)=>folderLabel(incoming.folders,a.id).split(' / ').length-folderLabel(incoming.folders,b.id).split(' / ').length)) {
    const parentId = folder.parentId ? folderIds.get(folder.parentId)! : null;
    const existing = folders.find(item => item.name === folder.name && (item.parentId || null) === parentId);
    const target = existing?.id ?? crypto.randomUUID();
    folderIds.set(folder.id, target);
    if (!existing) folders.push({ ...folder, id: target, parentId });
  }
  const assetIds = new Map(incoming.assets.map(asset => [asset.id, crypto.randomUUID()]));
  const notes = incoming.notes.map(note => ({
    ...note, id: crypto.randomUUID(), folderId: note.folderId ? folderIds.get(note.folderId)! : null,
    title: current.notes.some(item => item.title === note.title) ? `${note.title.slice(0, 190)}（导入）` : note.title,
    content: note.content.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (match, id: string) => assetIds.has(id) ? `asset://${assetIds.get(id)}` : match),
    updatedAt: now,
  }));
  return validateWorkspace({ ...current, ignoredSources: [...new Set([...(current.ignoredSources || []), ...(incoming.ignoredSources || [])])], folders, notes: [...current.notes, ...notes], assets: [...current.assets, ...incoming.assets.map(asset => ({ ...asset, id: assetIds.get(asset.id)! }))], updatedAt: now });
}

const summaries=new WeakMap<Note,string>();
export function noteSummary(note:Note){let value=summaries.get(note);if(value===undefined){value=summary(note.content);summaries.set(note,value);}return value;}
