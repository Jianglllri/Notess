/** Read document titles without mistaking fenced examples or comments for headings. */
export function markdownTitle(raw: string): string | null {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const front = text.match(/^---\n([\s\S]*?)\n(?:---|\.\.\.)\s*(?:\n|$)/);
  if (front) {
    const value = front[1].match(/^title:\s*(.+)$/m)?.[1].trim();
    text = text.slice(front[0].length);
    if (value && !['|', '>'].includes(value)) return value.replace(/^(['"])(.*)\1$/, '$2').slice(0, 200);
  }
  text = text.replace(/<!--[\s\S]*?(?:-->|$)/g, '');
  let fence = ''; let length = 0; let previous = ''; let secondary: string | null = null;
  const clean = (s: string) => s.replace(/\s+#+\s*$/, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').trim().slice(0, 200);
  for (const line of text.split('\n')) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) { fence = marker[1][0]; length = marker[1].length; }
      else if (marker[1][0] === fence && marker[1].length >= length && /^\s*$/.test(line.slice(marker[0].length))) fence = '';
      previous = ''; continue;
    }
    if (fence) continue;
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      const title = clean(heading[2]);
      if (title && heading[1].length === 1) return title;
      secondary ||= title || null;
    } else if (previous.trim() && /^ {0,3}=+\s*$/.test(line)) return clean(previous) || null;
    previous = line;
  }
  return secondary;
}
export function titleFromMarkdown(raw: string, filename: string): string {
  return markdownTitle(raw) || filename.split(/[\\/]/).pop()!.replace(/\.[^.]+$/, '').trim().slice(0, 200) || '未命名笔记';
}
