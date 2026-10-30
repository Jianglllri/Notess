import {decodeNote} from './github';
import {readLimited} from './backup';
export {markdownTitle} from './markdownTitle';
import JSZip from 'jszip';
import { MAX_WORKSPACE_BYTES, validateWorkspace, MAX_BACKUP_BYTES } from './workspace';

export function parseArxivId(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('请输入 arXiv 链接或编号。');
  const match = trimmed.match(/(\d{4}\.\d{4,5}(?:v\d+)?|\d{7})/);
  if (!match) throw new Error('无法识别 arXiv 编号，请粘贴 arxiv.org 链接或编号（如 2103.00000）。');
  return match[1].replace(/v\d+$/, '');
}

export interface ArxivMeta { id: string; title: string; authors: string[]; year: string; summary: string; }

export async function fetchArxivPaper(id: string): Promise<ArxivMeta> {
  const response = await fetch(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20000), redirect: 'follow' });
  if (!response.ok) throw new Error('无法访问 arXiv，请检查网络或编号。');
  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const entry = doc.querySelector('entry');
  if (!entry) throw new Error('没有找到这篇论文，请检查编号。');
  const title = (entry.querySelector('title')?.textContent || '未命名论文').trim().replace(/\s+/g, ' ');
  const authors = Array.from(entry.querySelectorAll('author name')).map(node => (node.textContent || '').trim()).filter(Boolean);
  const published = entry.querySelector('published')?.textContent || '';
  const year = published.slice(0, 4) || new Date().getFullYear().toString();
  const summary = (entry.querySelector('summary')?.textContent || '').trim().replace(/\s+/g, ' ');
  const idText = entry.querySelector('id')?.textContent || '';
  const arxivId = idText.split('/abs/').pop()?.split('/').pop() || id;
  return { id: arxivId, title, authors, year, summary };
}

export function paperNoteTemplate(meta: ArxivMeta): { title: string; content: string } {
  const authors = meta.authors.length ? meta.authors.join('、') : '未知作者';
  const content = [
    `# ${meta.title}`,
    '',
    `> ${authors} · ${meta.year} · arXiv:${meta.id}`,
    '',
    '## 摘要',
    meta.summary || '（无摘要）',
    '',
    '## 核心问题',
    '（待补充）',
    '',
    '## 方法与实验',
    '（待补充）',
    '',
    '## 关键结论',
    '（待补充）',
    '',
    '## 我的笔记 / 疑问',
    '（待补充）',
    '',
  ].join('\n');
  return { title: meta.title.slice(0, 200), content };
}

export interface ImportedZipItem { title: string; content: string; path: string[]; tags?:string[]; visibility?:'public'|'private'; }

export async function importMarkdownZip(file: File): Promise<{kind:'notes';items:ImportedZipItem[]}|{kind:'backup';workspace:import('../types').Workspace}> {
  if (file.size > MAX_BACKUP_BYTES) throw new Error('ZIP 文件超过 60 MB，无法导入。');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  if (Object.keys(zip.files).length > 3000) throw new Error('ZIP 文件条目过多。');
  const backup = zip.file('workspace.json');
  if (backup) return {kind:'backup',workspace:validateWorkspace(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readLimited(backup,MAX_WORKSPACE_BYTES))))};
  let total = 0;
  const names = Object.keys(zip.files).filter(name => /\.(md|markdown|txt)$/i.test(name) && !zip.files[name].dir && !name.split('/').some(part => part === '__MACOSX' || part === '.DS_Store'));
  if (!names.length) throw new Error('ZIP 里没有找到 Markdown 或文本文件。');
  if (names.length > 1000) throw new Error('ZIP 内文件过多（超过 1000 个）。');
  const results: ImportedZipItem[] = [];
  for (const name of names) {
    const bytes = await readLimited(zip.files[name],Math.min(1_000_000,20_000_000-total),'ZIP 展开内容超过单篇 1 MB 或总计 20 MB，已停止导入。');
    total += bytes.length;
    const text = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    if (new TextEncoder().encode(text).length > 1_000_000) throw new Error(`文件「${name}」超过 1 MB，请拆分成多个文件后再导入。`);
    const segments = name.split('/');
    const fileName = segments.pop() || '';
    const path = segments.filter(segment => segment && segment !== '__MACOSX' && segment !== '.DS_Store').map(segment => segment.slice(0, 60));
    const base = fileName.replace(/\.[^.]+$/, '').trim().slice(0, 200) || '未命名笔记';
    const decoded = decodeNote(text, base);
    results.push({ title:decoded.title, content:decoded.content, tags:decoded.tags, visibility:decoded.visibility, path });
  }
  return {kind:'notes',items:results};
}
