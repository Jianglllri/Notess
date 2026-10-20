import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownPreview } from './MarkdownPreview';

const render = (content: string) => renderToStaticMarkup(<MarkdownPreview content={content} assets={[]} />);

describe('数学公式预览', () => {
  it('渲染原笔记的行内公式及同一行双美元公式', () => {
    const html = render(String.raw`设输入 $X \in \mathbb{R}^{n \times d}$。

$$ Q = X W^Q,\quad K = X W^K,\quad V = X W^V $$`);
    expect(html.match(/<math /g)).toHaveLength(2);
    expect(html).toContain('<msup>');
    expect(html).not.toContain('<script');
  });
  it('块级公式使用可离线显示的 MathML', () => {
    expect(render('$$\n\\frac{a}{b}\n$$')).toContain('display="block"');
    expect(render('$$\n\\frac{a}{b}\n$$')).toContain('<mfrac>');
  });
  it('代码中的公式保持原样', () => {
    const html = render('`$x$`\n\n```text\n$$ y $$\n```');
    expect(html).not.toContain('<math');
    expect(html).toContain('$$ y $$');
  });
  it('错误公式不会中断整篇笔记', () => {
    const html = render('$\\unknownCommand{x}$\n\n后续正文');
    expect(html).toContain('后续正文');
    expect(html).toContain('unknownCommand');
  });
});

describe('思维导图离线预览及 HTML 导出', () => {
  it('直接输出 SVG，节点文本不会作为 HTML 执行', () => {
    const html = render('```markmap\n# 学习计划\n## <script>alert(1)</script>\n```');
    expect(html).toContain('<svg');
    expect(html).toContain('思维导图：学习计划');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('class="code-heading"');
  });
  it('无法解析的旧导图保留原文，不丢失后续内容', () => {
    const html = render('```mindmap\n- 旧格式\n```\n\n后续正文');
    expect(html).toContain('旧格式');
    expect(html).toContain('后续正文');
  });
});

it('exports flow diagrams as offline SVG with safe labels',async()=>{
 const {exampleFlow,saveFlow}=await import('../lib/flow');const graph=exampleFlow();graph.nodes[0].label='<script>bad</script>';
 const html=render(saveFlow('','',-1,graph));expect(html).toContain('<svg');expect(html).toContain('流程图画布');expect(html).not.toContain('<script>');expect(html).toContain('&lt;script&gt;');
});
