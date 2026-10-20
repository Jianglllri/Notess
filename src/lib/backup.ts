import JSZip from 'jszip';
import type { JSZipObject } from 'jszip';
import type { Workspace } from '../types';
import { MAX_BACKUP_BYTES, MAX_WORKSPACE_BYTES, validateWorkspace } from './workspace';

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

export async function exportBackup(workspace: Workspace): Promise<{ blob: Blob; at: string }> {
  const at = new Date().toISOString();
  const snapshot = validateWorkspace({ ...workspace, lastBackupAt: at });
  const zip = new JSZip();
  zip.file('workspace.json', JSON.stringify(snapshot));
  for (const note of snapshot.notes) {
    const content = note.content.replace(/asset:\/\/([a-zA-Z0-9_-]+)/g, (match, id: string) => {
      const asset = snapshot.assets.find(item => item.id === id);
      if (!asset) return match;
      const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime.split('/')[1];
      return `../assets/${id}.${ext}`;
    });
    zip.file(`notes/${note.id}.md`, content);
  }
  for (const asset of snapshot.assets) {
    const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime.split('/')[1];
    zip.file(`assets/${asset.id}.${ext}`, asset.dataUrl.split(',')[1], { base64: true });
  }
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), at };
}

function readLimited(entry: JSZipObject, limit: number): Promise<Uint8Array> {
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
        reject(new Error('备份展开后超过 50 MB，已停止读取。'));
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

export function exportNote(title: string, content: string) {
  const name = Array.from(title, char => char.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(char) ? '-' : char).join('').slice(0, 100) || '未命名笔记';
  downloadBlob(new Blob([content], { type: 'text/markdown;charset=utf-8' }), `${name}.md`);
}
