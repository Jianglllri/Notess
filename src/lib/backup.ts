import {encodeNote} from './github';
import {exportBackupInWorker} from './backupExport';
import JSZip from 'jszip';
import type { JSZipObject } from 'jszip';
import type { Workspace } from '../types';
import { MAX_BACKUP_BYTES, MAX_WORKSPACE_BYTES, validateWorkspace } from './workspace';
import { insideFolder } from './folders';

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exportBackup(workspace:Workspace):Promise<{blob:Blob;at:string}> {
  if(typeof Worker==='undefined')return exportBackupInWorker(workspace);
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('./backup.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage=event=>{worker.terminate();if(event.data.error)reject(Error(event.data.error));else resolve(event.data);};
    worker.onerror=()=>{worker.terminate();reject(Error('备份生成失败，请重试或导出原始 JSON。'));};
    worker.postMessage(workspace);
  });
}

export function readLimited(entry: JSZipObject, limit: number, message = '备份展开后超过 50 MB，已停止读取。'): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    let length = 0;
    let stopped = false;
    const chunks: Uint8Array[] = [];
    // JSZip documents this streaming API, but 3.10.2 omits it from JSZipObject's declaration.
    const stream = (entry as JSZipObject & {
      internalStream(type: 'uint8array'): JSZip.JSZipStreamHelper<Uint8Array>;
    }).internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      if (stopped) return;
      length += chunk.length;
      if (length > limit) {
        stopped = true;
        stream.pause();
        reject(new Error(message));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      if (stopped) return;
      const result = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
      resolve(result);
    });
    stream.resume();
  });
}

export async function importBackup(file: File): Promise<Workspace> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('备份文件超过 60 MB，无法导入。');
  if (file.name.toLowerCase().endsWith('.json')) {
    if (file.size > MAX_WORKSPACE_BYTES) throw new Error('JSON 文件超过 50 MB。');
    return validateWorkspace(JSON.parse(await file.text()));
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (Object.keys(zip.files).length > 3000) throw new Error('备份文件条目过多。');
  const entry = zip.file('workspace.json');
  if (!entry) throw new Error('找不到 workspace.json。请选择从枝叶笔记导出的 ZIP 或 JSON 备份。');
  const bytes = await readLimited(entry, MAX_WORKSPACE_BYTES);
  return validateWorkspace(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
}

export async function exportFolderZip(workspace: Workspace, folderId: string): Promise<Blob> {
  const root = workspace.folders.find(folder => folder.id === folderId);
  if (!root) throw new Error('文件夹不存在。');
  const included = new Set(workspace.folders.filter(folder => insideFolder(workspace.folders, folder.id, folderId)).map(folder => folder.id));
  included.add(folderId);
  const notes = workspace.notes.filter(note => !note.deletedAt && note.folderId && included.has(note.folderId));
  if (!notes.length) throw new Error('这个文件夹（含子文件夹）里没有笔记，无法导出。');
  const sanitize = (value: string) => Array.from(value, char => char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '-' : char).join('').trim().slice(0, 100) || '未命名';
  const relOf = (noteFolderId: string | null): string[] => {
    const parts: string[] = [];
    const seen = new Set<string>();
    let cursor = noteFolderId;
    while (cursor && cursor !== folderId && !seen.has(cursor)) {
      seen.add(cursor);
      const folder = workspace.folders.find(item => item.id === cursor);
      if (!folder) break;
      parts.unshift(folder.name);
      cursor = folder.parentId || null;
    }
    return parts;
  };
  const zip = new JSZip();
  const used = new Set<string>();
  for (const note of notes) {
    const dirs = [root.name, ...relOf(note.folderId)].map(sanitize);
    const dir = dirs.join('/');
    const base = sanitize(note.title);
    let fileName = `${dir}/${base}.md`; let count = 0;
    while (used.has(fileName)) fileName = `${dir}/${base}（${++count}）.md`;
    used.add(fileName);
    zip.file(fileName, encodeNote({title:note.title,content:note.content,tags:note.tags,visibility:note.visibility}));
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function exportNote(title: string, content: string) {
  const name = Array.from(title, char => char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '-' : char).join('').slice(0, 100) || '未命名笔记';
  downloadBlob(new Blob([encodeNote({title,content,tags:[]})], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
}
