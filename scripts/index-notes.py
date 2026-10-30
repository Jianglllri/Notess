#!/usr/bin/env python3
"""Regenerate the reading guide without modifying source notes or their paths."""
from pathlib import Path
from urllib.parse import quote
import re
ROOT = Path(__file__).resolve().parent.parent / 'imports' / 'agent-interview-300'
TARGET = ROOT / '学习导航.md'

def title(path):
    content = path.read_text()
    match = re.search(r'^#\s+(.+)$', content, re.M)
    return (match[1] if match else path.stem).strip()

def link(path):
    return f"[{title(path).replace('[', '').replace(']', '')}]({quote(path.relative_to(ROOT).as_posix())})"

def generate():
    groups = sorted(p for p in ROOT.iterdir() if p.is_dir() and any(p.rglob('*.md')))
    files = [p for p in ROOT.rglob('*.md') if p != TARGET]
    lines = ['# Agent 面试笔记 · 学习导航', '', '> 本页由 `scripts/index-notes.py` 生成。保留原始笔记正文、来源与文件路径；新增笔记后重新运行脚本即可更新索引。', '', '## 建议学习顺序', '', '1. **基础准备**：LLM 基础 → 提示工程，先掌握模型机制与提示设计。', '2. **Agent 架构**：核心概念 → 单 Agent → 多 Agent，理解工具调用、规划与协作。', '3. **工程落地**：RAG → 开发框架 → 系统集成 → 性能优化。', '4. **可靠性与应用**：安全 → 治理与伦理 → 技术趋势 → 行业应用。', '5. **面试复习**：结合真题，自述答案，再回到对应专题查漏补缺。', '', f'## 资料总览（{len(files)} 篇）', '', '### 总览与来源', '']
    lines += ['- ' + link(p) for p in sorted(ROOT.glob('*.md')) if p != TARGET]
    for group in groups:
        docs = sorted(group.rglob('*.md'))
        lines += ['', f'## {group.name}（{len(docs)} 篇）', '']
        lines += ['- ' + link(p) for p in docs]
    return '\n'.join(lines) + '\n'

if __name__ == '__main__':
    TARGET.write_text(generate())
    print(f'Updated {TARGET.relative_to(ROOT.parent.parent)}')
