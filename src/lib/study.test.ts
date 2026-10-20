import { describe, expect, it } from 'vitest';
import { questionsFromNotes, sampleQuestions } from './study';
import { newNote } from './workspace';
import { parseGithub } from './github';
describe('study questions', () => {
  it('extracts explicit questions, excludes normal sections and trashed notes', () => {
    const note = { ...newNote(), content: '## 普通笔记\n内容\n## Q: 闭包？\n答案：词法环境。\n## 问题：Promise？\n异步结果。' };
    expect(questionsFromNotes([note]).map(q => q.answer)).toEqual(['词法环境。', '异步结果。']);
    expect(questionsFromNotes([{ ...note, deletedAt: new Date().toISOString() }])).toEqual([]);
  });
  it('samples without replacement and does not mutate input', () => {
    const pool = Array.from({length: 20}, (_, i) => ({ id: String(i), source: '', prompt: '', answer: '' }));
    expect(new Set(sampleQuestions(pool, 50).map(q => q.id)).size).toBe(20);
    expect(sampleQuestions(pool, 5)).toHaveLength(5);
    expect(pool[0].id).toBe('0');
  });
  it('only accepts actual HTTPS GitHub repository URLs', () => {
    expect(parseGithub('https://github.com/a/b/blob/main/docs/a.md').rest).toEqual(['main', 'docs', 'a.md']);
    expect(() => parseGithub('https://github.com.evil.test/a/b')).toThrow();
    expect(() => parseGithub('http://github.com/a/b')).toThrow();
  });
});
it('ignores example questions inside fences and preserves code answers', () => {
  const note = { ...newNote(), content: '```md\n## Q: 示例？\n答案\n```\n## Q: 代码？\n```js\nconst a = 1;\n```' };
  const questions = questionsFromNotes([note]);
  expect(questions).toHaveLength(1);
  expect(questions[0].answer).toContain('```js');
});
it('understands the explicit question section used by Agent interview documents',()=>{
 const note={...newNote(),content:'# 第 18 题：GQA\n\n## 题目\n解释 GQA。\n\n---\n\n## 一、原理\n分组共享 KV。\n\n## 记忆要点\n省显存。'};
 const questions=questionsFromNotes([note]);expect(questions).toHaveLength(1);expect(questions[0].prompt).toBe('解释 GQA。');expect(questions[0].answer).toContain('分组共享 KV');
});
