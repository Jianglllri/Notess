// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Filter, Note, Workspace } from '../types';
import {
  createWorkspace, filterNotes, MAX_IMAGE_BYTES, MAX_WORKSPACE_BYTES,
  mergeWorkspace, newNote, pruneUnreferencedAssets, summary, validateWorkspace,
} from './workspace';

const AT = '2026-10-16T08:00:00.000Z';
const LATER = '2026-10-16T09:00:00.000Z';
function note(overrides: Partial<Note> = {}): Note {
  return { id: 'note-1', title: '笔记', content: '# 内容', folderId: null, tags: [], pinned: false, createdAt: AT, updatedAt: AT, deletedAt: null, ...overrides };
}
function asset(overrides: Partial<Asset> = {}): Asset {
  return { id: 'image-1', name: '图片.png', mime: 'image/png', size: 3, dataUrl: 'data:image/png;base64,AQID', createdAt: AT, ...overrides };
}
function workspace(overrides: Partial<Workspace> = {}): Workspace {
  return { schemaVersion: 1, id: 'workspace-1', notes: [], folders: [], assets: [], updatedAt: AT, lastBackupAt: null, ...overrides };
}
afterEach(() => vi.useRealTimers());

describe('createWorkspace / newNote', () => {
  it('生成可校验的独立初始工作区，所有文件夹引用有效', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AT));
    const first = createWorkspace();
    const second = createWorkspace();
    expect(validateWorkspace(first)).toEqual(first);
    expect(first.id).not.toBe(second.id);
    expect(first.updatedAt).toBe(AT);
    expect(first.lastBackupAt).toBeNull();
    expect(first.assets).toEqual([]);
    expect(first.notes.length).toBeGreaterThan(0);
    expect(first.notes.some(item => item.pinned)).toBe(true);
    for (const item of first.notes) {
      expect(first.folders.some(folder => folder.id === item.folderId)).toBe(true);
      expect(item.deletedAt).toBeNull();
    }
    first.notes[0].tags.push('独立');
    first.folders[0].name = '已修改';
    expect(second.notes[0].tags).not.toContain('独立');
    expect(second.folders[0].name).not.toBe('已修改');
  });

  it('新笔记使用独立 ID、当前时间和指定分类，默认未分类', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(AT));
    const first = newNote();
    const second = newNote('folder-1');
    expect(first).toMatchObject({ title: '未命名笔记', content: '', folderId: null, tags: [], pinned: false, createdAt: AT, updatedAt: AT, deletedAt: null });
    expect(second.folderId).toBe('folder-1');
    expect(first.id).not.toBe(second.id);
    expect(validateWorkspace(workspace({ notes: [first] }))).toBeDefined();
  });
});

describe('validateWorkspace', () => {
  it('接受空库和字段边界，返回深拷贝而非输入对象', () => {
    const input = workspace({ notes: [note({ id: 'a'.repeat(100), title: '题'.repeat(200), content: '字'.repeat(1_000_000), tags: Array.from({ length: 30 }, () => '签'.repeat(40)) })] });
    const result = validateWorkspace(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.notes[0]).not.toBe(input.notes[0]);
    expect(validateWorkspace(workspace())).toEqual(workspace());
  });

  it.each([
    ['null', null], ['数组', []], ['未知版本', { ...workspace(), schemaVersion: 2 }],
    ['多余根字段', { ...workspace(), unexpected: true }],
    ['无效时间', workspace({ updatedAt: 'yesterday' })],
    ['无效备份时间', workspace({ lastBackupAt: 'bad' })],
    ['空 ID', workspace({ id: '' })], ['路径 ID', workspace({ id: '../evil' })],
    ['过长 ID', workspace({ id: 'x'.repeat(101) })],
    ['非 ASCII ID', workspace({ id: '笔记库' })],
    ['非法笔记 ID', workspace({ notes: [note({ id: 'a/b' })] })],
    ['非法文件夹 ID', workspace({ folders: [{ id: '../folder', name: '分类', createdAt: AT }] })],
    ['非法附件 ID', workspace({ assets: [asset({ id: '../image' })] })],
    ['超长标题', workspace({ notes: [note({ title: 'x'.repeat(201) })] })],
    ['超长正文', workspace({ notes: [note({ content: 'x'.repeat(1_000_001) })] })],
    ['空标签', workspace({ notes: [note({ tags: [''] })] })],
    ['过长标签', workspace({ notes: [note({ tags: ['x'.repeat(41)] })] })],
    ['过多标签', workspace({ notes: [note({ tags: Array(31).fill('标签') })] })],
    ['非法布尔值', { ...workspace(), notes: [{ ...note(), pinned: 'true' }] }],
    ['非法删除时间', workspace({ notes: [note({ deletedAt: 'invalid' })] })],
    ['多余笔记字段', { ...workspace(), notes: [{ ...note(), script: 'evil' }] }],
    ['空文件夹名', workspace({ folders: [{ id: 'f', name: '', createdAt: AT }] })],
    ['过长文件夹名', workspace({ folders: [{ id: 'f', name: 'x'.repeat(61), createdAt: AT }] })],
    ['不存在的分类', workspace({ notes: [note({ folderId: 'missing' })] })],
  ])('拒绝%s', (_label, input) => {
    expect(() => validateWorkspace(input)).toThrow();
  });

  it.each(['notes', 'folders', 'assets'] as const)('拒绝 %s 重复 ID', key => {
    const input = workspace({ notes: [note()], folders: [{ id: 'f', name: '分类', createdAt: AT }], assets: [asset()] });
    if (key === 'notes') input.notes.push({ ...input.notes[0] });
    if (key === 'folders') input.folders.push({ ...input.folders[0] });
    if (key === 'assets') input.assets.push({ ...input.assets[0] });
    expect(() => validateWorkspace(input)).toThrow(/备份格式/);
  });

  it.each([['notes', 1000], ['folders', 200], ['assets', 500]] as const)('限制 %s 数量为 %i', (key, maximum) => {
    const input = workspace();
    if (key === 'notes') input.notes = Array.from({ length: maximum }, (_, i) => note({ id: `n-${i}` }));
    if (key === 'folders') input.folders = Array.from({ length: maximum }, (_, i) => ({ id: `f-${i}`, name: `分类${i}`, createdAt: AT }));
    if (key === 'assets') input.assets = Array.from({ length: maximum }, (_, i) => asset({ id: `a-${i}` }));
    expect(() => validateWorkspace(input)).not.toThrow();
    if (key === 'notes') input.notes.push(note({ id: 'extra' }));
    if (key === 'folders') input.folders.push({ id: 'extra', name: '额外', createdAt: AT });
    if (key === 'assets') input.assets.push(asset({ id: 'extra' }));
    expect(() => validateWorkspace(input)).toThrow();
  });

  it.each([
    ['SVG', { mime: 'image/svg+xml', dataUrl: 'data:image/svg+xml;base64,AQID' }],
    ['脚本 URL', { dataUrl: 'javascript:alert(1)' }],
    ['远程 URL', { dataUrl: 'https://example.com/a.png' }],
    ['非 base64', { dataUrl: 'data:image/png,hello' }],
    ['非法 base64 字符', { dataUrl: 'data:image/png;base64,!!!!' }],
    ['MIME 不匹配', { mime: 'image/jpeg' }],
    ['大小不匹配', { size: 2 }], ['零字节', { size: 0 }],
    ['负大小', { size: -1 }], ['非整数', { size: 1.5 }],
    ['超过 8MB', { size: MAX_IMAGE_BYTES + 1 }],
  ] satisfies [string, Partial<Asset>][])('拒绝恶意或无效附件：%s', (_label, overrides) => {
    expect(() => validateWorkspace(workspace({ assets: [asset(overrides)] }))).toThrow();
  });

  it.each([['AQ==', 1], ['AQI=', 2], ['AQID', 3]] as const)('接受正确 base64 填充 %s', (body, size) => {
    expect(() => validateWorkspace(workspace({ assets: [asset({ dataUrl: `data:image/png;base64,${body}`, size })] }))).not.toThrow();
  });

  it('接受恰好 8MB 的图片，拒绝多一个字节的图片', () => {
    const body = 'AAAA'.repeat(Math.floor(MAX_IMAGE_BYTES / 3)) + 'AAA=';
    expect(() => validateWorkspace(workspace({ assets: [asset({ dataUrl: `data:image/png;base64,${body}`, size: MAX_IMAGE_BYTES })] }))).not.toThrow();
    const larger = 'AAAA'.repeat((MAX_IMAGE_BYTES + 1) / 3);
    expect(() => validateWorkspace(workspace({ assets: [asset({ dataUrl: `data:image/png;base64,${larger}`, size: MAX_IMAGE_BYTES + 1 })] }))).toThrow();
  });

  it('按 UTF-8 序列化字节数执行 50MB 上限（不是字符数）', () => {
    const input = workspace({ notes: Array.from({ length: 18 }, (_, i) => note({ id: `n-${i}`, content: '汉'.repeat(1_000_000) })) });
    expect(JSON.stringify(input).length).toBeLessThan(MAX_WORKSPACE_BYTES);
    expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeGreaterThan(MAX_WORKSPACE_BYTES);
    expect(() => validateWorkspace(input)).toThrow(/50 MB/);
  });

  it('工作区恰好 50MB 可校验，再增加一个 ASCII 字节被拒绝', () => {
    const input = workspace({ notes: Array.from({ length: 53 }, (_, i) => note({ id: `n-${i}`, content: '' })) });
    let remaining = MAX_WORKSPACE_BYTES - new TextEncoder().encode(JSON.stringify(input)).byteLength;
    for (const item of input.notes) {
      const length = Math.min(remaining, 1_000_000);
      item.content = 'x'.repeat(length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBe(MAX_WORKSPACE_BYTES);
    expect(() => validateWorkspace(input)).not.toThrow();
    input.notes[input.notes.length - 1].content += 'x';
    expect(() => validateWorkspace(input)).toThrow(/50 MB/);
  });

  it('拒绝非规范 base64 填充，即使推算长度与声明大小一致', () => {
    expect(() => validateWorkspace(workspace({ assets: [asset({ dataUrl: 'data:image/png;base64,A===', size: 1 })] }))).toThrow();
  });
});

describe('filterNotes', () => {
  const input = workspace({
    folders: [{ id: 'f', name: '分类', createdAt: AT }],
    notes: [
      note({ id: 'old', title: 'HELLO 世界', folderId: 'f', tags: ['JavaScript'] }),
      note({ id: 'new', content: 'Unique Body', updatedAt: LATER }),
      note({ id: 'pin', pinned: true, folderId: 'f', tags: ['JavaScript'] }),
      note({ id: 'deleted', pinned: true, folderId: 'f', tags: ['JavaScript'], deletedAt: LATER }),
    ],
  });
  it.each([
    [{ kind: 'all' }, ['pin', 'new', 'old']],
    [{ kind: 'pinned' }, ['pin']], [{ kind: 'trash' }, ['deleted']],
    [{ kind: 'unfiled' }, ['new']], [{ kind: 'folder', id: 'f' }, ['pin', 'old']],
    [{ kind: 'tag', id: 'JavaScript' }, ['pin', 'old']],
    [{ kind: 'tag', id: 'javascript' }, []], [{ kind: 'folder', id: 'missing' }, []],
  ] satisfies [Filter, string[]][])('分类 %j 排除/保留回收站并先置顶后按更新时间排序', (filter, ids) => {
    const before = structuredClone(input);
    expect(filterNotes(input, filter, '').map(item => item.id)).toEqual(ids);
    expect(input).toEqual(before);
  });
  it.each([['  hello  ', ['old']], ['世界', ['old']], ['unique body', ['new']], ['javascript', ['pin', 'old']], ['   ', ['pin', 'new', 'old']], ['missing', []]])('标题/正文/标签查询 %s', (query, ids) => {
    expect(filterNotes(input, { kind: 'all' }, query).map(item => item.id)).toEqual(ids);
  });
  it('搜索与分类取交集，回收站也支持查询', () => {
    expect(filterNotes(input, { kind: 'pinned' }, 'hello')).toEqual([]);
    expect(filterNotes(input, { kind: 'trash' }, 'javascript').map(item => item.id)).toEqual(['deleted']);
  });
});

describe('pruneUnreferencedAssets', () => {
  it('保留存活、回收站及共享引用，仅删除未引用资产且不修改输入', () => {
    const input = workspace({
      notes: [
        note({ id: 'active', content: '![存活](asset://active-image) ![共享](asset://shared-image) ![重复](asset://shared-image)', tags: ['保留'], pinned: true }),
        note({ id: 'trash', content: '![回收站](asset://trash-image) ![共享](asset://shared-image)', deletedAt: LATER }),
      ],
      folders: [{ id: 'folder', name: '分类', createdAt: AT }],
      assets: ['orphan-image', 'trash-image', 'shared-image', 'active-image'].map(id => asset({ id })),
      lastBackupAt: AT,
    });
    const before = structuredClone(input);
    const result = pruneUnreferencedAssets(input);
    expect(result).toEqual({ ...before, assets: before.assets.filter(item => item.id !== 'orphan-image') });
    expect(result.assets.map(item => item.id)).toEqual(['trash-image', 'shared-image', 'active-image']);
    expect(result).not.toBe(input);
    expect(result.assets).not.toBe(input.assets);
    expect(input).toEqual(before);
    expect(validateWorkspace(result)).toEqual(result);
    expect(pruneUnreferencedAssets(result)).toEqual(result);
  });

  it.each(['image-1', 'image-10', 'image-100', 'image-1_extra', 'image-1-extra'])('相似 ID 只保留完整引用 %s，不误保留前缀资产', referencedId => {
    const input = workspace({
      notes: [note({ content: `![图](asset://${referencedId})` })],
      assets: ['image-1', 'image-10', 'image-100', 'image-1_extra', 'image-1-extra'].map(id => asset({ id })),
    });
    const before = structuredClone(input);
    expect(pruneUnreferencedAssets(input).assets).toEqual([before.assets.find(item => item.id === referencedId)]);
    expect(input).toEqual(before);
  });

  it('永久删除最后一篇引用笔记后清理资产，仍有回收站引用时不得清理', () => {
    const input = workspace({
      notes: [note({ id: 'active', content: 'asset://image-1' }), note({ id: 'trash', content: 'asset://image-1', deletedAt: LATER })],
      assets: [asset()],
    });
    const trashOnly = { ...input, notes: input.notes.filter(item => item.id === 'trash') };
    expect(pruneUnreferencedAssets(trashOnly).assets).toEqual(input.assets);
    const permanentlyDeleted = { ...trashOnly, notes: [] };
    expect(pruneUnreferencedAssets(permanentlyDeleted).assets).toEqual([]);
    expect(input.assets).toEqual([asset()]);
    expect(trashOnly.notes).toHaveLength(1);
  });

  it('标题和标签不算正文引用，未知引用不创建资产或改写正文', () => {
    const input = workspace({
      notes: [note({ title: 'asset://title-image', tags: ['asset://tag-image'], content: '![缺失](asset://missing) ![已有](asset://image-1)' })],
      assets: [asset({ id: 'title-image' }), asset({ id: 'tag-image' }), asset()],
    });
    const before = structuredClone(input);
    const result = pruneUnreferencedAssets(input);
    expect(result.assets).toEqual([asset()]);
    expect(result.notes).toEqual(before.notes);
    expect(input).toEqual(before);
  });

  it('空库和无正文引用时安全清理全部孤立资产', () => {
    expect(pruneUnreferencedAssets(workspace())).toEqual(workspace());
    const input = workspace({ notes: [note({ content: '# 无图片\nhttps://example.com/image.png' })], assets: [asset()] });
    const before = structuredClone(input);
    expect(pruneUnreferencedAssets(input)).toEqual({ ...before, assets: [] });
    expect(input).toEqual(before);
  });
});

describe('mergeWorkspace', () => {
  it('保留当前库及导入笔记信息，按分类名合并，重映射冲突 ID 与所有附件引用', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(LATER));
    const current = workspace({
      folders: [{ id: 'f', name: '共享分类', createdAt: AT }],
      notes: [note({ title: '同名', folderId: 'f', content: '![原图](asset://image-1)' })],
      assets: [asset()], lastBackupAt: AT,
    });
    const incoming = workspace({ id: 'other',
      folders: [{ id: 'f', name: '共享分类', createdAt: AT }, { id: 'new-f', name: '新分类', createdAt: AT }],
      assets: [asset({ name: '导入.png', dataUrl: 'data:image/png;base64,BAUG' })],
      notes: [
        note({ title: '同名', folderId: 'f', pinned: true, tags: ['保留'], deletedAt: AT, content: '![图](asset://image-1) ![重复](asset://image-1) asset://missing' }),
        note({ id: 'other-note', title: '不同名', folderId: 'new-f' }),
        note({ id: 'unfiled', folderId: null }),
      ],
    });
    const originals = structuredClone({ current, incoming });
    const result = mergeWorkspace(current, incoming);
    expect({ current, incoming }).toEqual(originals);
    expect(validateWorkspace(result)).toEqual(result);
    expect(result).toMatchObject({ id: current.id, schemaVersion: 1, lastBackupAt: AT, updatedAt: LATER });
    expect(result.notes[0]).toEqual(current.notes[0]);
    expect(result.assets[0]).toEqual(current.assets[0]);
    expect(result.folders[0]).toEqual(current.folders[0]);
    expect(result.folders).toHaveLength(2);
    const importedAsset = result.assets[1];
    expect(importedAsset).toEqual({ ...incoming.assets[0], id: importedAsset.id });
    expect(importedAsset.id).not.toBe('image-1');
    expect(result.notes[1]).toEqual({ ...incoming.notes[0], id: result.notes[1].id, title: '同名（导入）', updatedAt: LATER, content: `![图](asset://${importedAsset.id}) ![重复](asset://${importedAsset.id}) asset://missing` });
    expect(result.notes[2].folderId).toBe(result.folders[1].id);
    expect(result.notes[2].title).toBe('不同名');
    expect(result.notes[3].folderId).toBeNull();
    expect(new Set(result.notes.map(item => item.id)).size).toBe(4);
    expect(result.notes.slice(1).every(item => !incoming.notes.some(original => original.id === item.id))).toBe(true);
  });

  it('空导入不丢失当前库，连续重复导入保留全部笔记而不覆盖', () => {
    const current = workspace({ notes: [note()] });
    expect(mergeWorkspace(current, workspace()).notes).toEqual(current.notes);
    const once = mergeWorkspace(current, current);
    const twice = mergeWorkspace(once, current);
    expect(twice.notes).toHaveLength(3);
    expect(twice.notes[0]).toEqual(current.notes[0]);
    expect(new Set(twice.notes.map(item => item.id)).size).toBe(3);
  });

  it('超长同名标题追加导入标记仍有效，附件 ID 前缀相似时逐个准确映射', () => {
    const title = '题'.repeat(200);
    const current = workspace({ notes: [note({ title })] });
    const incoming = workspace({
      notes: [note({ title, content: 'asset://image-1 asset://image-10 asset://image-100' })],
      assets: [asset(), asset({ id: 'image-10', dataUrl: 'data:image/png;base64,BAUG' })],
    });
    const result = mergeWorkspace(current, incoming);
    expect(result.notes[1].title).toBe(`${title.slice(0, 190)}（导入）`);
    expect(result.notes[1].content).toBe(`asset://${result.assets[0].id} asset://${result.assets[1].id} asset://image-100`);
    expect(validateWorkspace(result)).toEqual(result);
  });

  it('合并超过数量上限时拒绝且不修改输入', () => {
    const current = workspace({ notes: Array.from({ length: 1000 }, (_, i) => note({ id: `n-${i}` })) });
    const before = structuredClone(current);
    expect(() => mergeWorkspace(current, workspace({ notes: [note()] }))).toThrow();
    expect(current).toEqual(before);
  });

  it('无效的导入文件夹引用不得变成未分类或写入当前库', () => {
    const current = workspace();
    expect(() => mergeWorkspace(current, workspace({ notes: [note({ folderId: 'missing' })] }))).toThrow();
    expect(current.notes).toEqual([]);
  });

  it.each([
    ['无效笔记 ID', workspace({ notes: [note({ id: '../bad' })] })],
    ['重复笔记 ID', workspace({ notes: [note(), note()] })],
    ['无效附件 ID', workspace({ assets: [asset({ id: '../bad' })] })],
    ['重复附件 ID', workspace({ assets: [asset(), asset()] })],
    ['无效文件夹 ID', workspace({ folders: [{ id: '../bad', name: '分类', createdAt: AT }] })],
  ])('重映射前应拒绝%s', (_label, incoming) => {
    expect(() => mergeWorkspace(workspace(), incoming)).toThrow();
  });
});

describe('summary', () => {
  it('摘要去除 Markdown 装饰并保留链接文本和图片/代码提示', () => {
    expect(summary('# 标题\n**粗体** [链接](https://example.com) ![图](asset://a)\n```js\nevil()\n```')).toBe('标题 粗体 链接 图片 代码片段');
  });
  it('空白使用占位符，长文本最多 100 字符', () => {
    expect(summary(' \n ')).toBe('还没有内容，写下第一个想法…');
    expect(summary('x'.repeat(101))).toBe('x'.repeat(100));
  });
});
