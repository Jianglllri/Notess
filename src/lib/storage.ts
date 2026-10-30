import { openDB } from 'idb';
import type { DBSchema } from 'idb';
import type { Workspace } from '../types';
import { validateWorkspace } from './workspace';

export interface StoredWorkspace { revision: number; workspace: Workspace }
interface NotesDB extends DBSchema {
  workspace: { key: string; value: StoredWorkspace };
}
export class StorageConflictError extends Error {
  constructor() { super('笔记库已被另一个窗口修改。当前修改仍保留，请先导出备份，再重新载入。'); }
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

async function loadLegacyWorkspace(): Promise<StoredWorkspace | null> {
  const database = await db();
  try {
    const stored = await database.get('workspace', 'main');
    if (!stored) return null;
    validateRevision(stored.revision);
    return { revision: stored.revision, workspace: validateWorkspace(stored.workspace) };
  } finally { database.close(); }
}

export async function saveWorkspace(workspace: Workspace, expectedRevision: number): Promise<number> {
  return savePreparedWorkspace(validateWorkspace(workspace),expectedRevision);
}

/** Internal: callers must validate imports/structural edits before queuing. */
export async function savePreparedWorkspace(snapshot:Workspace,expectedRevision:number):Promise<number> {
  validateRevision(expectedRevision);
  if (expectedRevision === Number.MAX_SAFE_INTEGER) throw new Error('本地保存版本无效：已达到上限，请导出备份后恢复到新的笔记库。');
  if (sharedStorageEnabled()) return (await localRequest('workspace',{workspace:snapshot,expectedRevision}) as {revision:number}).revision;
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


export function sharedStorageEnabled():boolean {
  return typeof window!=='undefined' && (!!window.zhiye?.localWorkspace || ['127.0.0.1','localhost'].includes(window.location.hostname) && ['5173','4173','5174'].includes(window.location.port));
}
async function localRequest(operation:string,input?:unknown):Promise<unknown> {
  let result:{status:number;data:unknown};
  if(window.zhiye?.localWorkspace) result=await window.zhiye.localWorkspace(operation,input);
  else {
    const response=await fetch('/__local/'+operation,{method:input===undefined?'GET':'POST',headers:{'x-zhiye-local':'1','Content-Type':'application/json'},...(input===undefined?{}:{body:JSON.stringify(input)}),signal:AbortSignal.timeout(30000)});
    result={status:response.status,data:await response.json()};
  }
  if(result.status===409)throw new StorageConflictError();
  if(result.status!==200)throw Error((result.data as {error?:string})?.error || '本机共享笔记库暂时不可用');
  return result.data;
}
function checked(value:unknown):StoredWorkspace|null {
  if(value===null)return null;
  const stored=value as StoredWorkspace;validateRevision(stored.revision);
  return {revision:stored.revision,workspace:validateWorkspace(stored.workspace)};
}
let initialLoad:Promise<StoredWorkspace|null>|undefined;
export async function loadWorkspace():Promise<StoredWorkspace|null> {
  if(!sharedStorageEnabled())return loadLegacyWorkspace();
  // Keep the old browser database intact as a recovery source. Migration receipts live on disk.
  if(!initialLoad)initialLoad=(async()=>{
    let clientId=localStorage.getItem('zhiye-local-client');
    if(!clientId){clientId=crypto.randomUUID();localStorage.setItem('zhiye-local-client',clientId);}
    const legacy=await loadLegacyWorkspace();
    return checked(await localRequest('migrate',{clientId,workspace:legacy?.workspace || null}));
  })().catch(error=>{initialLoad=undefined;throw error;});
  await initialLoad;
  return checked(await localRequest('workspace'));
}
export async function loadSharedUpdate(revision:number):Promise<StoredWorkspace|null> {
  if(!sharedStorageEnabled())return null;
  const latest=await localRequest('revision') as {revision:number};
  if(latest.revision===revision)return null;
  return checked(await localRequest('workspace'));
}
