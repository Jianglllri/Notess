import { useMemo, useState } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { CheckIcon, CopyIcon, ImageBrokenIcon } from '@phosphor-icons/react';
import { FlowView } from './FlowView';
import { parseFlow } from '../lib/flow';
import { parseMind } from '../lib/mindmap';
import { MindMapView } from './MindMapView';
import type { Asset } from '../types';

function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (node && typeof node === 'object' && 'props' in node) return plainText((node.props as { children?: ReactNode }).children);
  return '';
}

function CodeBlock({ children, ...props }: HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const child = Array.isArray(children) ? children[0] : children;
  const codeProps = child && typeof child === 'object' && 'props' in child ? child.props as { className?: string } : {};
  const language = codeProps.className?.match(/language-([\w+-]+)/)?.[1] ?? 'text';
  async function copy() {
    try {
      await navigator.clipboard.writeText(plainText(children).replace(/\n$/, ''));
      setCopied(true); setError(false);
      setTimeout(() => setCopied(false), 2000);
    } catch { setError(true); }
  }
  if (language === 'zhiye-flow') { try { return <FlowView graph={parseFlow(plainText(children))} />; } catch { /* Preserve unsupported source. */ } }
  if (language === 'markmap' || language === 'mindmap') {
    try { return <MindMapView root={parseMind(plainText(children))} />; }
    catch { /* Unsupported diagrams retain their original readable source. */ }
  }
  return <div className="code-block">
    <div className="code-heading"><span>{language}</span><button onClick={() => void copy()} aria-label="复制代码">{copied ? <CheckIcon /> : <CopyIcon />}{copied ? '已复制' : '复制'}</button></div>
    <pre {...props}>{children}</pre>
    {error && <small role="alert">无法读取剪贴板权限，请选中代码手动复制。</small>}
  </div>;
}

export function MarkdownPreview({ content, assets }: { content: string; assets: Asset[] }) {
  const assetMap = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  return <article className="markdown-body">
    {content.trim() ? <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { output: 'mathml', trust: false }], [rehypeHighlight, { detect: false, ignoreMissing: true }]]}
      urlTransform={url => url.startsWith('asset://') ? url : defaultUrlTransform(url)}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        a: ({ href, children }) => <a href={href?.startsWith('asset://') ? undefined : href} target="_blank" rel="noopener noreferrer">{children}</a>,
        img: ({ src, alt }) => {
          const asset = src?.startsWith('asset://') ? assetMap.get(src.slice(8)) : undefined;
          if (asset) return <img src={asset.dataUrl} alt={alt || asset.name} loading="lazy" />;
          return <span className="image-placeholder"><ImageBrokenIcon size={20} />{alt || '图片'}<small>{src?.startsWith('asset://') ? '本地附件不存在' : '外部图片不自动加载，请通过工具栏导入本地图片'}</small></span>;
        },
      }}
    >{content}</ReactMarkdown> : <div className="preview-empty"><span>写下你的第一个想法</span><p>左侧输入 Markdown，内容会在这里展开。</p></div>}
  </article>;
}
