import type { Note } from '../types';
export interface Question { id: string; source: string; prompt: string; answer: string }
export function questionsFromNotes(notes: Note[]): Question[] {
  return notes.filter(n => !n.deletedAt).flatMap(note => {
    const questions: Question[] = [];
    let active: { prompt: string; line: number; body: string[] } | null = null;
    let fence = ''; let fenceLength = 0;
    function flush() {
      if (!active) return;
      const answer = active.body.join('\n').trim().replace(/^(?:A|答案)[:：]\s*/, '');
      if (answer) questions.push({ id: `${note.id}-${active.line}`, source: note.title, prompt: active.prompt, answer });
      active = null;
    }
    note.content.split('\n').forEach((line, index) => {
      const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
      if (marker) {
        if (!fence) { fence = marker[1][0]; fenceLength = marker[1].length; }
        else if (marker[1][0] === fence && marker[1].length >= fenceLength && line.trim() === marker[1]) fence = '';
        active?.body.push(line); return;
      }
      if (!fence && /^#{1,6}\s+/.test(line)) {
        flush();
        const question = line.match(/^#{1,6}\s+(?:Q[:：]|问题[:：])\s*(.+)/);
        if (question) active = { prompt: question[1], line: index, body: [] };
      } else active?.body.push(line);
    });
    flush();
    if (!questions.length && /^# 第\s*\d+\s*题[：:]/m.test(note.content)) {
      const match = note.content.match(/^## 题目\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
      if (match) {
        const prompt = match[1].replace(/^---\s*$/gm, '').trim();
        const answer = note.content.slice(match.index! + match[0].length).replace(/\n\*上一篇：[\s\S]*$/, '').trim();
        if (prompt && answer) questions.push({id: `${note.id}-interview`, source:note.title, prompt, answer});
      }
    }
    return questions;
  });
}
export function sampleQuestions(questions: Question[], count: number): Question[] {
  const result = [...questions];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result.slice(0, Math.max(0, Math.floor(count)));
}
