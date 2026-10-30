import {decodeNote} from './github';
// @vitest-environment node
import JSZip from 'jszip';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Workspace } from '../types';
import { exportBackup, importBackup } from './backup';
import { createWorkspace, MAX_BACKUP_BYTES, MAX_WORKSPACE_BYTES, validateWorkspace } from './workspace';

const AT = '2026-10-16T08:00:00.000Z';
const EXPORTED_AT = '2026-10-16T09:00:00.000Z';
function fixture(): Workspace {
  const workspace = createWorkspace();
  workspace.lastBackupAt = AT;
  workspace.assets = [
    { id: 'png', name: '中文.png', mime: 'image/png', size: 3, dataUrl: 'data:image/png;base64,AQID', createdAt: AT },
    { id: 'jpeg', name: '图片.jpeg', mime: 'image/jpeg', size: 2, dataUrl: 'data:image/jpeg;base64,AQI=', createdAt: AT },
    { id: 'gif', name: '图片.gif', mime: 'image/gif', size: 1, dataUrl: 'data:image/gif;base64,AQ==', createdAt: AT },
    { id: 'webp', name: '图片.webp', mime: 'image/webp', size: 3, dataUrl: 'data:image/webp;base64,BAUG', createdAt: AT },
  ];
  workspace.notes[0].content += '\n![中文图片](asset://png)\nemoji 🌱';
  workspace.notes[1].deletedAt = AT;
  return workspace;
}
async function zipFile(zip: JSZip, name = 'backup.zip'): Promise<File> {
  const bytes = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
  return new File([bytes], name, { type: 'application/zip' });
}
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('backup roundtrip (native Node File / Blob)', () => {
  it('真实导出 ZIP 再导入，完整保留中文、Markdown、分类、标签、回收站及附件', async () => {
    const workspace = fixture();
    const before = structuredClone(workspace);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(EXPORTED_AT));
    const { blob, at } = await exportBackup(workspace);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(0);
    expect(at).toBe(EXPORTED_AT);
    expect(workspace).toEqual(before);
    const imported = await importBackup(new File([blob], '枝叶备份.ZIP', { type: 'application/zip' }));
    expect(imported).toEqual({ ...before, lastBackupAt: at });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(JSON.parse(await zip.file('workspace.json')!.async('string'))).toEqual(imported);
    expect(imported.notes).toEqual(before.notes);
    expect(imported.assets).toEqual(before.assets);
    expect(imported.notes[0].content).toContain('![中文图片](asset://png)');
    expect(decodeNote(await zip.file(`notes/${workspace.notes[0].id}.md`)!.async('string'),'fallback').content).toBe(
      workspace.notes[0].content.replace('![中文图片](asset://png)', '![中文图片](../assets/png.png)'),
    );
    for (const note of workspace.notes.slice(1)) {
      expect(decodeNote(await zip.file(`notes/${note.id}.md`)!.async('string'),'fallback').content).toBe(note.content);
    }
    for (const [id, extension, bytes] of [
      ['png', 'png', [1, 2, 3]], ['jpeg', 'jpg', [1, 2]],
      ['gif', 'gif', [1]], ['webp', 'webp', [4, 5, 6]],
    ] as const) {
      expect(Array.from(await zip.file(`assets/${id}.${extension}`)!.async('uint8array'))).toEqual(bytes);
    }
  });

  it('导出 Markdown 的四种图片相对路径可定位 ZIP 附件，JSON 和恢复内容保留原始 asset 引用', async () => {
    const workspace = fixture();
    workspace.assets.push({ ...workspace.assets[0], id: 'png-extra', name: '前缀相似.png', dataUrl: 'data:image/png;base64,BwgJ' });
    const original = [
      '# 图片路径',
      '![PNG](asset://png)', '![JPEG](asset://jpeg)',
      '![GIF](asset://gif)', '![WEBP](asset://webp)',
      '![重复](asset://png)', '![相似ID](asset://png-extra)', '![未知](asset://png-extra-missing)',
      '![远程](https://example.com/image.png)',
    ].join('\n');
    workspace.notes[0].content = original;
    const before = structuredClone(workspace);
    const { blob, at } = await exportBackup(workspace);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const markdown = await zip.file(`notes/${workspace.notes[0].id}.md`)!.async('string');
    expect(decodeNote(markdown,'fallback').content).toBe([
      '# 图片路径',
      '![PNG](../assets/png.png)', '![JPEG](../assets/jpeg.jpg)',
      '![GIF](../assets/gif.gif)', '![WEBP](../assets/webp.webp)',
      '![重复](../assets/png.png)', '![相似ID](../assets/png-extra.png)', '![未知](asset://png-extra-missing)',
      '![远程](https://example.com/image.png)',
    ].join('\n'));
    const paths = Array.from(markdown.matchAll(/!\[[^\]]*\]\((\.\.\/assets\/[^)]+)\)/g), match => match[1]);
    expect(paths).toHaveLength(6);
    for (const path of paths) {
      const entryPath = new URL(path, 'https://backup.invalid/notes/note.md').pathname.slice(1);
      expect(zip.file(entryPath)).not.toBeNull();
      const assetId = entryPath.slice('assets/'.length).replace(/\.[^.]+$/, '');
      const originalAsset = before.assets.find(asset => asset.id === assetId)!;
      expect(Array.from(await zip.file(entryPath)!.async('uint8array'))).toEqual(
        Array.from(atob(originalAsset.dataUrl.split(',')[1]), char => char.charCodeAt(0)),
      );
    }
    const snapshot = JSON.parse(await zip.file('workspace.json')!.async('string'));
    expect(snapshot).toEqual({ ...before, lastBackupAt: at });
    expect(snapshot.notes[0].content).toBe(original);
    const restored = await importBackup(new File([blob], 'portable.zip'));
    expect(restored).toEqual({ ...before, lastBackupAt: at });
    expect(restored.notes[0].content).toBe(original);
    expect(workspace).toEqual(before);
  });

  it('回收站内笔记也导出可用图片相对路径，恢复时保留删除时间及原始引用', async () => {
    const workspace = fixture();
    workspace.notes[1].content = '![删除笔记的图片](asset://jpeg)';
    const before = structuredClone(workspace);
    const { blob, at } = await exportBackup(workspace);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(decodeNote(await zip.file(`notes/${workspace.notes[1].id}.md`)!.async('string'),'fallback').content).toBe('![删除笔记的图片](../assets/jpeg.jpg)');
    expect(Array.from(await zip.file('assets/jpeg.jpg')!.async('uint8array'))).toEqual([1, 2]);
    const restored = await importBackup(new File([blob], 'trash.zip'));
    expect(restored).toEqual({ ...before, lastBackupAt: at });
    expect(restored.notes[1].deletedAt).toBe(AT);
    expect(restored.notes[1].content).toBe(before.notes[1].content);
    expect(workspace).toEqual(before);
  });

  it('连续导出/导入保持内容不丢失，只有备份时间更新', async () => {
    const workspace = fixture();
    const first = await exportBackup(workspace);
    const imported = await importBackup(new File([first.blob], 'first.zip'));
    const second = await exportBackup(imported);
    expect(await importBackup(new File([second.blob], 'second.zip'))).toEqual({ ...workspace, lastBackupAt: second.at });
  });

  it('JSON（扩展名大小写不敏感）可直接导入且不改写备份时间', async () => {
    const workspace = fixture();
    expect(await importBackup(new File([JSON.stringify(workspace)], 'workspace.JSON', { type: 'application/json' }))).toEqual(workspace);
  });

  it('ZIP 内 workspace.json 为权威数据，独立 Markdown 附件文件不覆盖 JSON 内容', async () => {
    const workspace = fixture();
    const zip = new JSZip().file('workspace.json', JSON.stringify(workspace));
    zip.file(`notes/${workspace.notes[0].id}.md`, '不可覆盖 JSON');
    zip.file('assets/png.png', new Uint8Array([9]));
    expect(await importBackup(await zipFile(zip))).toEqual(workspace);
  });

  it('导出拒绝无效工作区而不修改输入', async () => {
    const workspace = fixture();
    workspace.notes[0].folderId = 'missing';
    const before = structuredClone(workspace);
    await expect(exportBackup(workspace)).rejects.toThrow(/备份格式/);
    expect(workspace).toEqual(before);
  });
});

describe('invalid backup input', () => {
  it('ZIP 缺失 workspace.json 时给出明确错误', async () => {
    const zip = new JSZip().file('notes/one.md', '# 只有笔记');
    await expect(importBackup(await zipFile(zip))).rejects.toThrow(/找不到 workspace\.json/);
  });

  it('仅有嵌套 workspace.json 也不能作为根目录备份导入', async () => {
    const zip = new JSZip().file('nested/workspace.json', JSON.stringify(createWorkspace()));
    await expect(importBackup(await zipFile(zip))).rejects.toThrow(/找不到 workspace\.json/);
  });

  it.each(['', '{', '{"schemaVersion":', 'not JSON', '{"x":1,}'])('JSON 格式错误 %j', async content => {
    await expect(importBackup(new File([content], 'backup.json'))).rejects.toBeInstanceOf(SyntaxError);
  });

  it('ZIP workspace.json 格式错误', async () => {
    await expect(importBackup(await zipFile(new JSZip().file('workspace.json', '{ broken')))).rejects.toBeInstanceOf(SyntaxError);
  });

  it.each([null, [], { schemaVersion: 2 }, { ...createWorkspace(), id: '../evil' }])('格式合法但结构无效的 JSON %j 被拒绝', async value => {
    await expect(importBackup(new File([JSON.stringify(value)], 'backup.json'))).rejects.toThrow(/备份格式/);
    await expect(importBackup(await zipFile(new JSZip().file('workspace.json', JSON.stringify(value))))).rejects.toThrow(/备份格式/);
  });

  it('无效 ZIP、空文件和截断 ZIP 均拒绝', async () => {
    await expect(importBackup(new File([], 'empty.zip'))).rejects.toThrow();
    await expect(importBackup(new File(['not a zip'], 'broken.zip'))).rejects.toThrow();
    const valid = await zipFile(new JSZip().file('workspace.json', JSON.stringify(createWorkspace())));
    await expect(importBackup(new File([valid.slice(0, valid.size - 12)], 'truncated.zip'))).rejects.toThrow();
  });

  it('ZIP workspace.json 非法 UTF-8 被拒绝', async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d]);
    await expect(importBackup(await zipFile(new JSZip().file('workspace.json', bytes)))).rejects.toThrow();
  });

  it('JSON 与 ZIP 都拒绝恶意附件', async () => {
    const workspace = fixture();
    workspace.assets[0].dataUrl = 'javascript:alert(1)';
    const json = JSON.stringify(workspace);
    await expect(importBackup(new File([json], 'evil.json'))).rejects.toThrow();
    await expect(importBackup(await zipFile(new JSZip().file('workspace.json', json)))).rejects.toThrow();
  });
});

describe('backup size and entry limits', () => {
  it('超过 60MB 在读取或解压前拒绝', async () => {
    const file = new File([new Uint8Array(MAX_BACKUP_BYTES + 1)], 'large.zip');
    const read = vi.spyOn(file, 'arrayBuffer');
    await expect(importBackup(file)).rejects.toThrow(/超过 60 MB/);
    expect(read).not.toHaveBeenCalled();
  });

  it('JSON 超过 50MB 在读取前拒绝', async () => {
    const file = new File([new Uint8Array(MAX_WORKSPACE_BYTES + 1)], 'large.json');
    const read = vi.spyOn(file, 'text');
    await expect(importBackup(file)).rejects.toThrow(/JSON 文件超过 50 MB/);
    expect(read).not.toHaveBeenCalled();
  });

  it('JSON 恰好 50MB 可读取合法 JSON（末尾空白不计入工作区大小）', async () => {
    const workspace = createWorkspace();
    const json = JSON.stringify(workspace);
    const padding = ' '.repeat(MAX_WORKSPACE_BYTES - new TextEncoder().encode(json).byteLength);
    const file = new File([json, padding], 'boundary.json');
    expect(file.size).toBe(MAX_WORKSPACE_BYTES);
    expect(await importBackup(file)).toEqual(workspace);
  }, 30_000);

  it('恰好 3000 个 ZIP 条目可导入，3001 个被拒绝', async () => {
    const workspace = createWorkspace();
    const zip = new JSZip().file('workspace.json', JSON.stringify(workspace));
    for (let i = 0; i < 2999; i++) zip.file(`extra-${i}`, '');
    expect(await importBackup(await zipFile(zip))).toEqual(workspace);
    zip.file('one-too-many', '');
    await expect(importBackup(await zipFile(zip))).rejects.toThrow(/条目过多/);
  }, 30_000);

  it('接近 50MB 的合法工作区导出后仍应无损导入，不因 JSON 美化膨胀而被拒绝', async () => {
    const workspace = fixture();
    workspace.assets = [];
    workspace.folders = [];
    workspace.notes = Array.from({ length: 53 }, (_, index) => ({
      ...workspace.notes[0], id: `large-${index}`, title: '正文', content: '', folderId: null, tags: [],
    }));
    let remaining = MAX_WORKSPACE_BYTES - 1024 - new TextEncoder().encode(JSON.stringify(workspace)).byteLength;
    for (const note of workspace.notes) {
      const length = Math.min(remaining, 1_000_000);
      note.content = 'x'.repeat(length);
      remaining -= length;
    }
    expect(remaining).toBe(0);
    expect(() => validateWorkspace(workspace)).not.toThrow();
    const before = structuredClone(workspace);
    const { blob, at } = await exportBackup(workspace);
    expect(workspace).toEqual(before);
    expect(new TextEncoder().encode(JSON.stringify({ ...before, lastBackupAt: at })).byteLength).toBeLessThan(MAX_WORKSPACE_BYTES);
    expect(blob.size).toBeLessThan(MAX_BACKUP_BYTES);
    await expect(importBackup(new File([blob], 'large-roundtrip.zip'))).resolves.toEqual({ ...before, lastBackupAt: at });
  }, 30_000);

  it('高压缩率 ZIP 的 workspace.json 展开超过 50MB 时停止读取', async () => {
    const zip = new JSZip().file('workspace.json', ' '.repeat(MAX_WORKSPACE_BYTES + 1));
    const file = await zipFile(zip);
    expect(file.size).toBeLessThan(MAX_BACKUP_BYTES);
    await expect(importBackup(file)).rejects.toThrow(/展开后超过 50 MB/);
  }, 30_000);
});
