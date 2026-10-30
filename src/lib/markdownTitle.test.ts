import {expect,it} from 'vitest';
import {markdownTitle,titleFromMarkdown} from './markdownTitle';
import {decodeNote,encodeNote} from './github';
import {questionsFromNotes} from './study';
it('ignores fenced examples, comments and indented code, prefers document H1',()=>{
 expect(markdownTitle('```python\n# wrong\n```\n<!--\n# hidden\n-->\n    # code\n## subsection\n# **考试题库** ###')).toBe('考试题库');
 expect(markdownTitle('~~~\n# no\n~~~\n# title')).toBe('title');
 expect(markdownTitle('```\n# no')).toBeNull();
});
it('supports BOM, CRLF, front matter, setext and basename fallback',()=>{
 expect(markdownTitle('\uFEFF---\r\ntitle: "阶段考试"\r\n---\r\n# other')).toBe('阶段考试');
 expect(markdownTitle('文档名称\n====')).toBe('文档名称');
 expect(titleFromMarkdown('text','folder/file.md')).toBe('file');
 expect(markdownTitle('## 第一道题')).toBe('第一道题');
});
it('explicit exported titles survive UUID filenames and different body headings',()=>{
 const encoded=encodeNote({title:'我的考试',content:'# 原始标题',tags:['学习']});
 expect(decodeNote('\uFEFF'+encoded.replace(/\n/g,'\r\n'),'uuid.md')).toMatchObject({title:'我的考试',content:'# 原始标题',tags:['学习']});
});
it('imports self-contained documents with UUID filenames without losing titles or exam questions',()=>{
 const documents=[
  {title:'学习路线与使用说明',content:'# 学习路线与使用说明\n\n[每周任务](../每周任务/W01.md)'},
  {title:'W01 评测闭环',content:'# W01 评测闭环\n\n```python\n# 示例注释，不是标题\n```'},
  {title:'D01 明确任务与成功标准',content:'# D01 明确任务与成功标准\n\n## 今日目标\n定义可检查的成功标准。'},
  {title:'实验与每周复盘模板',content:'# 实验与每周复盘模板\n\n## 结果\n未执行时不要填入实测结果。'},
  {title:'W01 阶段考试题',content:'# W01 阶段考试题\n\n## Q: 动作合法是否等于任务成功？\n答案：不等于，还需要验证任务目标与约束。\n\n## 问题：未执行的任务如何统计？\n答案：保留在固定分母中，并记录未执行状态。'},
 ];
 const notes=documents.map((document,index)=>{
  const decoded=decodeNote(document.content,`${crypto.randomUUID()}.md`);
  expect(decoded.title).toBe(document.title);
  expect(decoded.content).toBe(document.content);
  return {id:`fixture-${index}`,title:decoded.title,content:decoded.content,folderId:null,tags:[],pinned:false,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z',deletedAt:null};
 });
 expect(questionsFromNotes(notes).map(({source,prompt,answer})=>({source,prompt,answer}))).toEqual([
  {source:'W01 阶段考试题',prompt:'动作合法是否等于任务成功？',answer:'不等于，还需要验证任务目标与约束。'},
  {source:'W01 阶段考试题',prompt:'未执行的任务如何统计？',answer:'保留在固定分母中，并记录未执行状态。'},
 ]);
});
