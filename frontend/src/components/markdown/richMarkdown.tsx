/**
 * Shared Markdown stack: GFM, math (KaTeX), raw HTML (same as documents), Mermaid fenced blocks.
 */
import { Children, isValidElement, useEffect, useId, useRef, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import mermaid from 'mermaid';
import 'katex/dist/katex.min.css';
import './richMarkdown.scss';

export const richMarkdownRemarkPlugins = [remarkGfm, remarkMath];
export const richMarkdownRehypePlugins = [rehypeRaw, rehypeKatex];

function mermaidTheme(): 'default' | 'dark' {
  if (typeof document === 'undefined') return 'default';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'default';
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mermaidSourceFromPreChildren(children: ReactNode): string | null {
  const parts = Children.toArray(children);
  if (parts.length !== 1) return null;
  const el = parts[0];
  if (!isValidElement(el)) return null;
  const props = el.props as { className?: string; children?: ReactNode };
  const cls = props.className || '';
  if (!/\blanguage-mermaid\b/.test(cls)) return null;
  return String(props.children ?? '').replace(/\n$/, '');
}

export function MermaidBlock({ code }: { code: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const baseId = useId().replace(/:/g, '');

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: mermaidTheme(),
    });

    let cancelled = false;
    const renderId = `mm-${baseId}-${Math.random().toString(36).slice(2, 10)}`;

    void (async () => {
      try {
        const { svg, bindFunctions } = await mermaid.render(renderId, code, host);
        if (cancelled) return;
        host.innerHTML = svg;
        bindFunctions?.(host);
      } catch {
        if (!cancelled) {
          host.innerHTML = `<pre class="openkms-mermaid-error">${escapeHtml(code)}</pre>`;
        }
      }
    })();

    return () => {
      cancelled = true;
      host.textContent = '';
    };
  }, [code, baseId]);

  return <div className="openkms-mermaid" ref={hostRef} />;
}

/** Use as `components.pre` so ```mermaid blocks render as diagrams instead of raw code. */
export function richMarkdownPreComponent(preClassName?: string): NonNullable<Components['pre']> {
  return function RichMarkdownPre({ children }) {
    const src = mermaidSourceFromPreChildren(children);
    if (src !== null) {
      return <MermaidBlock code={src} />;
    }
    return <pre className={preClassName}>{children}</pre>;
  };
}
