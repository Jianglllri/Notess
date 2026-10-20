import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { Workspace } from '../types';
import { validateWorkspace } from './workspace';

export interface StoredWorkspace { revision: number; workspace: Workspace }
interface NotesDB extends DBSchema {
  workspace: { key: string; value: StoredWorkspace };
}
export class StorageConflictError extends Error {
  constructor() { super('笔记库已被另一个标签页修改。请先导出当前内容，再重新载入。'); }
}
function validateRevision(revision: number) {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision > Number.MAX_SAFE_INTEGER) {
    throw new Error('本地保存版本无效，请保留浏览器数据并通过备份恢复。');
  }
}
const db = () => openDB<NotesDB>('zhiye-notes-v1', 1, {
  upgrade(database) { database.createObjectStore('workspace'); },
  blocked() { /* The caller receives a visible saving/loading state until the connection opens. */ },
});

export async function loadWorkspace(): Promise<StoredWorkspace | null> {
  const database = await db();
  try {
    const stored = await database.get('workspace', 'main');
    if (!stored) return null;
    validateRevision(stored.revision);
    return { revision: stored.revision, workspace: validateWorkspace(stored.workspace) };
  } finally { database.close(); }
}

export async function saveWorkspace(workspace: Workspace, expectedRevision: number): Promise<number> {
  const snapshot = validateWorkspace(workspace);
  validateRevision(expectedRevision);
  if (expectedRevision === Number.MAX_SAFE_INTEGER) throw new Error('本地保存版本无效：已达到上限，请导出备份后恢复到新的笔记库。');
  const database = await db();
  try {
    const tx = database.transaction('workspace', 'readwrite');
    const stored = await tx.store.get('main');
    if ((stored?.revision ?? 0) !== expectedRevision) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new StorageConflictError();
    }
    const revision = expectedRevision + 1;
    await tx.store.put({ workspace: snapshot, revision }, 'main');
    await tx.done;
    return revision;
  } finally { database.close(); }
}
