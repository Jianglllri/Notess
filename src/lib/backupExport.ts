import {encodeNote} from './github';
import JSZip from 'jszip';
import type {Workspace} from '../types';
import {validateWorkspace} from './workspace';
export async function exportBackupInWorker(workspace: Workspace): Promise<{ blob: Blob; at: string }> {
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
    zip.file(`notes/${note.id}.md`, encodeNote({title:note.title,content,tags:note.tags,visibility:note.visibility}));
  }
  for (const asset of snapshot.assets) {
    const ext = asset.mime === 'image/jpeg' ? 'jpg' : asset.mime.split('/')[1];
    zip.file(`assets/${asset.id}.${ext}`, asset.dataUrl.split(',')[1], { base64: true });
  }
  return { blob: await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } }), at };
}

