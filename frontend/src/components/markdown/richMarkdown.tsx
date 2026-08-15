/**
 * Shared Markdown stack: GFM, math (KaTeX + mhchem), raw HTML, Mermaid fenced blocks.
 * All agent / wiki / document / article markdown surfaces should use this module
 * so AI-generated math and chemistry delimiters render consistently.
 */
import { Children, isValidElement, useEffect, useId, useMemo, useRef, type ComponentProps, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import type { PluggableList } from 'unified';
import 'katex/dist/katex.min.css';
// Registers \ce / \pu for chemistry (KaTeX mhchem).
import 'katex/dist/contrib/mhchem.mjs';
import { preprocessRichMarkdown } from './normalizeMarkdownMath';
import './richMarkdown.scss';

export { preprocessRichMarkdown, normalizeMarkdownMath } from './normalizeMarkdownMath';

export const richMarkdownRemarkPlugins: PluggableList = [remarkGfm, remarkMath];

/** KaTeX: soft failure so one bad formula does not blank the whole message. */
export const richMarkdownRehypePlugins: PluggableList = [
  rehypeRaw,
  [
    rehypeKatex,
    {
      throwOnError: false,
      strict: 'ignore',
    },
  ],
];

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

    let cancelled = false;
    const renderId = `mm-${baseId}-${Math.random().toString(36).slice(2, 10)}`;

    void (async () => {
      const mermaid = (await import('mermaid')).default;
      if (cancelled) return;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: mermaidTheme(),
      });
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

type RichMarkdownProps = {
  children: string;
  components?: Components;
  className?: string;
  /** Extra preprocess before math normalization (e.g. wiki wikilinks). */
  preprocess?: (source: string) => string;
  urlTransform?: ComponentProps<typeof ReactMarkdown>['urlTransform'];
};

/**
 * Canonical markdown renderer for the SPA: GFM + KaTeX (mhchem) + raw HTML + Mermaid.
 * Normalizes common AI math delimiters (`\[ \]`, `\( \)`, `[ \text{…} ]`) before parse.
 */
export function RichMarkdown({ children, components, className, preprocess, urlTransform }: RichMarkdownProps) {
  const source = useMemo(() => {
    const stepped = preprocess ? preprocess(children) : children;
    return preprocessRichMarkdown(stepped);
  }, [children, preprocess]);

  const md = (
    <ReactMarkdown
      remarkPlugins={richMarkdownRemarkPlugins}
      rehypePlugins={richMarkdownRehypePlugins}
      components={components}
      urlTransform={urlTransform}
    >
      {source}
    </ReactMarkdown>
  );

  if (className) return <div className={className}>{md}</div>;
  return md;
}
