import { useCloudMode } from '../hooks/useCloudMode';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { fetchAppRelease, isNewerVersion } from '../lib/appUpdates';
import { cloudEnabled, getRepositories } from '../lib/repositories';
import type { AppRelease } from '../lib/appUpdates';
import { version } from '../../package.json';

export function AppUpdates() {
  const cloud=useCloudMode();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [message, setMessage] = useState('');
  const checking = useRef(false), lastCheck = useRef(0), announced = useRef('');
  const check = useCallback(async (manual: boolean) => {
    if (manual) setOpen(true);
    if (checking.current || (!manual && Date.now() - lastCheck.current < 6 * 60 * 60 * 1000)) return;
    checking.current = true; lastCheck.current = Date.now(); setBusy(true); setMessage('正在检查 GitHub 上的正式版本…');
    try {
      const next = await fetchAppRelease();if(!manual&&!cloudEnabled())return; setRelease(next);
      if (next && isNewerVersion(next.version, version)) {
        setMessage(`发现新版 ${next.version}`);
        if (manual || announced.current !== next.version) { announced.current = next.version; setOpen(true); }
      } else setMessage(next ? '当前已是最新版本。' : '暂时没有已发布的正式版本。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '检查失败，请稍后重试。'); }
    finally { checking.current = false; setBusy(false); }
  }, []);
  useEffect(() => {
    if (!window.zhiye || !cloud) return;
    void check(false);
    const focus = () => { void check(false); };
    const timer = window.setInterval(focus, 6 * 60 * 60 * 1000);
    window.addEventListener('focus', focus);
    return () => { clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [check,cloud]);
  const newer = release && isNewerVersion(release.version, version);
  return <>
    <button className="text-button app-update-check" onClick={() => void check(true)}>软件更新 · v{version}{newer ? ' · 有新版' : ''}</button>
    <Modal open={open} title={newer ? `发现新版 v${release.version}` : '软件更新'} description={`当前版本 v${version} · Apple 芯片 Mac`} onClose={() => setOpen(false)}>
      <p role="status">{message}</p>
      {newer && <><p>下载完成后退出应用，使用安装包覆盖安装。笔记保留在本机，建议更新前导出一份 ZIP 备份。</p><div className="modal-actions">{release.dmg && <a className="primary-button" href={release.dmg} target="_blank" rel="noopener noreferrer">下载 DMG</a>}{release.pkg && <a className="secondary-button" href={release.pkg} target="_blank" rel="noopener noreferrer">下载 PKG</a>}</div>{release.notes && <details><summary>更新说明</summary><pre className="app-release-notes">{release.notes}</pre></details>}</>}
      <p className="backup-footnote">云端模式下桌面版启动时自动检查，每 6 小时再检查；仅本地模式只在手动点击时联网。发现新版会提示；下载和安装由你确认操作，不会自动退出或覆盖软件。</p>
      <div className="modal-actions"><a className="text-button" href={release?.url || `${getRepositories().system}/releases/latest`} target="_blank" rel="noopener noreferrer">打开发布页面</a><button className="secondary-button" disabled={busy} onClick={() => void check(true)}>{busy ? '正在检查…' : '重新检查'}</button><button className="primary-button" onClick={() => setOpen(false)}>{newer ? '稍后再说' : '关闭'}</button></div>
    </Modal>
  </>;
}
