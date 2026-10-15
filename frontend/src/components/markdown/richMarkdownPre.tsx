/**
 * `components.pre` factory for the shared markdown stack: renders ```mermaid fences as
 * diagrams via `MermaidBlock`, everything else as a plain `<pre>`.
 * Lives apart from `richMarkdown.tsx` so that module only exports components (HMR).
 */
import { Children, isValidElement, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import { MermaidBlock } from './richMarkdown';

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
