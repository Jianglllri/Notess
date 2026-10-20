// @vitest-environment node
import 'fake-indexeddb/auto';
import { deleteDB, openDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../types';
import { loadWorkspace, saveWorkspace, StorageConflictError } from './storage';
import { createWorkspace } from './workspace';

const DB_NAME = 'zhiye-notes-v1';
beforeEach(async () => { await deleteDB(DB_NAME); });
afterEach(async () => { vi.restoreAllMocks(); await deleteDB(DB_NAME); });

async function seedStored(value: unknown) {
  const database = await openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore('workspace'); },
  });
  try { await database.put('workspace', value, 'main'); }
  finally { database.close(); }
}

describe('IndexedDB workspace storage', () => {
  it('尚未保存时返回 null，首次 revision 从 0 增到 1，刷新后完整加载', async () => {
    expect(await loadWorkspace()).toBeNull();
    const workspace = createWorkspace();
    expect(await saveWorkspace(workspace, 0)).toBe(1);
    expect(await loadWorkspace()).toEqual({ revision: 1, workspace });
    expect(await loadWorkspace()).toEqual({ revision: 1, workspace });
  });

  it('每次保存递增 revision，保存/读取均通过结构化克隆与调用者隔离', async () => {
    const workspace = createWorkspace();
    const originalTitle = workspace.notes[0].title;
    await saveWorkspace(workspace, 0);
    workspace.notes[0].title = '未保存的本地修改';
    const loaded = await loadWorkspace();
    expect(loaded!.workspace.notes[0].title).toBe(originalTitle);
    loaded!.workspace.notes[0].title = '下一版本';
    expect((await loadWorkspace())!.workspace.notes[0].title).toBe(originalTitle);
    expect(await saveWorkspace(loaded!.workspace, 1)).toBe(2);
    expect(await loadWorkspace()).toEqual({ revision: 2, workspace: loaded!.workspace });
    expect(await saveWorkspace(loaded!.workspace, 2)).toBe(3);
  });

  it('拒绝 stale revision，不覆盖较新内容，冲突后仍可使用正确 revision 保存', async () => {
    const first = createWorkspace();
    await saveWorkspace(first, 0);
    const staleTab = await loadWorkspace();
    const latest = structuredClone(first);
    latest.notes[0].title = '另一个标签页的新内容';
    await saveWorkspace(latest, 1);
    staleTab!.workspace.notes[0].title = '旧标签页';
    await expect(saveWorkspace(staleTab!.workspace, staleTab!.revision)).rejects.toBeInstanceOf(StorageConflictError);
    await expect(saveWorkspace(first, 0)).rejects.toBeInstanceOf(StorageConflictError);
    expect(await loadWorkspace()).toEqual({ revision: 2, workspace: latest });
    expect(await saveWorkspace(latest, 2)).toBe(3);
  });

  it('首次保存拒绝非零 revision，且不创建内容记录', async () => {
    await expect(saveWorkspace(createWorkspace(), 1)).rejects.toBeInstanceOf(StorageConflictError);
    expect(await loadWorkspace()).toBeNull();
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])('非法 expectedRevision %s 在访问 DB 前抛普通 Error 且不覆盖', async expectedRevision => {
    const workspace = createWorkspace();
    await saveWorkspace(workspace, 0);
    const open = vi.spyOn(indexedDB, 'open');
    const saving = saveWorkspace(workspace, expectedRevision);
    await expect(saving).rejects.toBeInstanceOf(Error);
    await expect(saving).rejects.toSatisfy((error: unknown) => error instanceof Error && Object.getPrototypeOf(error) === Error.prototype);
    await expect(saving).rejects.not.toBeInstanceOf(StorageConflictError);
    await expect(saving).rejects.toThrow(/本地保存版本无效/);
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
    expect(await loadWorkspace()).toEqual({ revision: 1, workspace });
  });

  it('空数据库的非法 revision 也在打开连接前拒绝，不创建数据库', async () => {
    const open = vi.spyOn(indexedDB, 'open');
    const saving = saveWorkspace(createWorkspace(), -1);
    await expect(saving).rejects.toSatisfy((error: unknown) => error instanceof Error && Object.getPrototypeOf(error) === Error.prototype);
    await expect(saving).rejects.not.toBeInstanceOf(StorageConflictError);
    expect(open).not.toHaveBeenCalled();
    expect(await indexedDB.databases()).toEqual([]);
  });

  it('并发相同 revision 保存仅一方成功，落盘内容对应胜者', async () => {
    const base = createWorkspace();
    await saveWorkspace(base, 0);
    const first = structuredClone(base);
    const second = structuredClone(base);
    first.notes[0].title = '并发 A';
    second.notes[0].title = '并发 B';
    const results = await Promise.allSettled([saveWorkspace(first, 1), saveWorkspace(second, 1)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const winner = results.findIndex(result => result.status === 'fulfilled');
    for (const result of results) {
      if (result.status === 'fulfilled') expect(result.value).toBe(2);
      else expect(result.reason).toBeInstanceOf(StorageConflictError);
    }
    expect(await loadWorkspace()).toEqual({ revision: 2, workspace: winner === 0 ? first : second });
  });

  it('加载时拒绝损坏的工作区，连接关闭后可以清库恢复', async () => {
    await seedStored({ revision: 1, workspace: { schemaVersion: 99 } });
    await expect(loadWorkspace()).rejects.toThrow(/备份格式/);
    await deleteDB(DB_NAME);
    expect(await loadWorkspace()).toBeNull();
    expect(await saveWorkspace(createWorkspace(), 0)).toBe(1);
  });

  it('保存时应拒绝无效工作区且保留上一份有效数据', async () => {
    const valid = createWorkspace();
    await saveWorkspace(valid, 0);
    const invalid: Workspace = { ...valid, notes: [{ ...valid.notes[0], folderId: 'missing' }] };
    await expect(saveWorkspace(invalid, 1)).rejects.toThrow();
    expect(await loadWorkspace()).toEqual({ revision: 1, workspace: valid });
  });

  it('最高可接受 expectedRevision 保存成功后，新 revision 仍应可以加载', async () => {
    const workspace = createWorkspace();
    await seedStored({ revision: Number.MAX_SAFE_INTEGER - 1, workspace });
    expect(await loadWorkspace()).toEqual({ revision: Number.MAX_SAFE_INTEGER - 1, workspace });
    expect(await saveWorkspace(workspace, Number.MAX_SAFE_INTEGER - 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(await loadWorkspace()).toEqual({ revision: Number.MAX_SAFE_INTEGER, workspace });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('加载应拒绝损坏的存储 revision %s', async revision => {
    await seedStored({ revision, workspace: createWorkspace() });
    await expect(loadWorkspace()).rejects.toThrow();
  });
});

it('编辑正文后保存，重开仍保留正文和 GitHub 更新关联', async () => {
  const workspace = createWorkspace();
  workspace.notes[0].github = { url: 'https://github.com/Jianglllri/Notess', branch: 'main', path: 'notes/test.md', sha: 'a'.repeat(40), format: 'md', syncedAt: new Date().toISOString() };
  await saveWorkspace(workspace, 0);
  const reopened = await loadWorkspace();
  reopened!.workspace.notes[0].content = '编辑后的正文';
  await saveWorkspace(reopened!.workspace, reopened!.revision);
  const saved = await loadWorkspace();
  expect(saved!.workspace.notes[0].content).toBe('编辑后的正文');
  expect(saved!.workspace.notes[0].github).toEqual(workspace.notes[0].github);
});
