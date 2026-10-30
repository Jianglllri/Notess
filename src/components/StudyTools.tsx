import {ImportLibrary} from './ImportLibrary';
import {configureImport} from '../lib/importPolicy';
import { useCloudMode } from '../hooks/useCloudMode';
import { useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Modal } from './Modal';
import { MarkdownPreview } from './MarkdownPreview';
import type { Note, Workspace } from '../types';
import { mergeRemote } from '../lib/sync';
import { downloadBlob } from '../lib/backup';
import { importGithub, DEFAULT_REPO, parseGithub } from '../lib/github';
import { getRepositories, getSessionToken, noteDestination } from '../lib/repositories';
import { importCloudRepository, publishCloudNote, markCloudPublished } from '../lib/cloudSync';
import { questionsFromNotes, sampleQuestions } from '../lib/study';
import type { Question } from '../lib/study';

function noteHtml(note: Note, workspace: Workspace) {
  const title = note.title.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{max-width:900px;margin:60px auto;padding:0 24px;font:17px/1.85 system-ui;color:#26352e}h1,h2,h3{line-height:1.4}img{max-width:100%}pre{overflow:auto;background:#f3f5f4;padding:20px}blockquote{border-left:3px solid #4b8065;padding-left:20px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px}button{display:none}a{color:#28704b}</style></head><body><h1>${title}</h1>${renderToStaticMarkup(<MarkdownPreview content={note.content} assets={workspace.assets} />)}</body></html>`;
}
export function StudyTools({ workspace, selected, update }: { workspace: Workspace; selected: Note | null; update: (fn: (w: Workspace) => Workspace) => boolean }) {
  const cloud=useCloudMode();
  const [mode, setMode] = useState<'github' | 'exam' | null>(null);
  const [importPolicy,setImportPolicy]=useState<'reference'|'full'>('reference');
  const [importUrl, setImportUrl] = useState('https://vscode.dev/github/RiddleGo/agent-interview-300?vscode-lang=zh-cn');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [count, setCount] = useState(5); const [scope, setScope] = useState('all'); const [exam, setExam] = useState<Question[]>([]);
  const [index, setIndex] = useState(0); const [answer, setAnswer] = useState(''); const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0); const [done, setDone] = useState(false);
  const pool = useMemo(()=>mode==='exam'?questionsFromNotes(scope === 'current' ? (selected ? [selected] : []) : workspace.notes):[],[mode,scope,selected,workspace.notes]);
  function openGithub() { setMessage(''); setMode('github'); }
  async function run(action: () => Promise<void>) { setBusy(true); setMessage(''); try { await action(); } catch (e) { setMessage(e instanceof Error ? e.message : '操作失败'); } finally { setBusy(false); } }
  function close() { if (!busy) { setMode(null); setToken(''); setMessage(''); } }
  async function quickPublish() {
    if (!selected || selected.deletedAt) return;
    if (!window.zhiye && !token && !getSessionToken()) { openGithub(); return; }
    await run(async () => {
      const github = await publishCloudNote(selected, token);
      if (!update(w => markCloudPublished(w, selected.id, github))) throw new Error('远端已提交，本地关联保存失败，请先查看远端版本。');
      setMessage(`已保存到 ${noteDestination(selected).visibility} 笔记仓库。`);
    });
  }

  function start() { setExam(sampleQuestions(pool, count)); setIndex(0); setAnswer(''); setSubmitted(false); setScore(0); setDone(false); }
  function grade(correct: boolean) { if (correct) setScore(v => v + 1); if (index + 1 === exam.length) setDone(true); else { setIndex(v => v + 1); setAnswer(''); setSubmitted(false); } }
  return <><details className="study-toolbar"><summary>工具 ···</summary><div className="study-menu" onClick={event=>{const menu=event.currentTarget.parentElement;if(menu instanceof HTMLDetailsElement)menu.open=false;}}><button onClick={openGithub}>导入文档</button>{selected && cloud && <button disabled={busy || !!selected.deletedAt} onClick={() => void quickPublish()}>同步当前笔记</button>}<button onClick={() => { setMode('exam'); setExam([]); }}>随机考试</button>{selected && <button onClick={() => selected && downloadBlob(new Blob([noteHtml(selected, workspace)], { type: 'text/html;charset=utf-8' }), `${selected.title.replace(/[\\/:*?"<>|]/g, '_') || 'note'}.html`)}>导出 HTML</button>}</div></details><ImportLibrary workspace={workspace} update={update} reimport={url=>{setImportUrl(url);openGithub();}}/>{message && mode !== 'github' && <p className="sync-feedback" role="status">{message}</p>}
    <Modal open={mode === 'github'} title="连接 GitHub 笔记库" description="按文档的 public / private 设置同步到对应仓库。桌面版可使用本机 GitHub 登录；此处 Token 仅本窗口有效。" onClose={close}>
      <div className="study-form"><label>导入来源（支持 GitHub / vscode.dev）<input value={importUrl} onChange={e => setImportUrl(e.target.value)} /></label><label>GitHub Token（公开仓库导入可不填）<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
      <label>外部资料同步方式<select value={importPolicy} disabled={busy} onChange={e=>setImportPolicy(e.target.value as 'reference'|'full')}><option value="reference">来源清单：云端存链接，本地下载正文</option><option value="full">完整同步：正文也上传到笔记仓库</option></select></label><p>清单方式新项目归入“来源清单”文件夹；完整同步不自动跟随来源更新。自己的笔记仓库恢复时沿用云端设置。正文有个人修改时会保留全文。</p><button disabled={busy || !importUrl} className="secondary-button" onClick={() => void run(async () => {
        const config=getRepositories(), parsed=parseGithub(importUrl), repo=`https://github.com/${parsed.owner}/${parsed.repo}`;
        const visibility=repo.toLowerCase()===config.private.toLowerCase()?'private':repo.toLowerCase()===config.public.toLowerCase()?'public':undefined;
        const progress=(done:number,total:number)=>setMessage(`正在导入 ${done}/${total} 篇…`);
        const docs = visibility ? await importCloudRepository(repo,visibility==='private'?config.privateBranch:config.publicBranch,visibility,workspace.notes,token,progress) : await importGithub(importUrl,token,progress);

        let stats = '';
        if (!update(w => { const merged = mergeRemote(w, docs, visibility ? repo : DEFAULT_REPO); stats = `新增 ${merged.added} 篇，更新 ${merged.updated} 篇，冲突 ${merged.conflicts} 篇。重复导入不会重复添加。`; return visibility ? merged.workspace : configureImport(w,merged.workspace,docs,importPolicy); })) throw new Error('本地保存失败。');
        setMessage(stats);
      })}>{busy ? '处理中…' : '导入并按目录整理'}</button>
      <hr /><strong>当前笔记：{selected?.title || '未选择'}</strong>
      {selected && <p>同步到 {noteDestination(selected).visibility}：{noteDestination(selected).url || '尚未配置仓库'}。可在“管理来源清单”切换清单／完整方式，个人修改保存全文。仓库可在边栏“备份与同步”中配置。</p>}
      <p>远端发生冲突时会停止上传，请刷新笔记库核对。HTML 可从工具菜单导出到本地。</p>
      <button className="primary-button" disabled={!cloud || busy || !selected || !!selected.deletedAt || (!token && !getSessionToken() && !window.zhiye)} onClick={() => void quickPublish()}>同步当前笔记到 GitHub</button>{message && <p role="status">{message}</p>}</div>
    </Modal>
    <Modal open={mode === 'exam'} title="笔记考试" description="先独立作答，提交后查看笔记中的参考答案，再自行评定掌握程度。" onClose={close}>
      {!exam.length ? <div className="study-form"><p>在笔记中用以下格式维护题库；普通段落不会自动变成题目。</p><pre>{'## Q: 什么是闭包？\n答案：函数及其引用的词法环境。'}</pre><label>抽题范围<select value={scope} onChange={e => setScope(e.target.value)}><option value="all">全部笔记</option><option value="current">当前笔记</option></select></label><label>题数<input type="number" min="1" max="100" value={count} onChange={e => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /></label><p>发现 {pool.length} 道题，本次抽取 {Math.min(count, pool.length)} 道，不重复。</p><button className="primary-button" disabled={!pool.length} onClick={start}>开始考试</button></div> : done ? <div><h3>考试完成</h3><p>共 {exam.length} 题，自评掌握 {score} 题，需复习 {exam.length - score} 题。</p><button className="primary-button" onClick={() => setExam([])}>重新抽题</button></div> : <div className="study-form"><small>第 {index + 1} / {exam.length} 题 · 来源：{exam[index].source}</small><h3>{exam[index].prompt}</h3><label>你的答案<textarea rows={5} value={answer} disabled={submitted} onChange={e => setAnswer(e.target.value)} /></label>{!submitted ? <button className="primary-button" disabled={!answer.trim()} onClick={() => setSubmitted(true)}>提交并查看答案</button> : <><h4>参考答案</h4><MarkdownPreview content={exam[index].answer} assets={workspace.assets} /><div className="modal-actions"><button className="secondary-button" onClick={() => grade(false)}>还需复习</button><button className="primary-button" onClick={() => grade(true)}>已掌握，下一题</button></div></>}</div>}
    </Modal>
  </>;
}
