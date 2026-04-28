import { useMemo, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';
import './WikiAgentMessageBody.css';

type WikiAgentMessageBodyProps = {
  text: string;
  variant: 'user' | 'assistant' | 'plain';
};

function useMarkdownComponents(): Partial<Components> {
  return useMemo(
    () => ({
      a: ({ href, children, ...rest }) => {
        const h = href || '';
        if (h.startsWith('http://') || h.startsWith('https://')) {
          return (
            <a href={h} target="_blank" rel="noopener noreferrer" className="wiki-agent-md__a" {...rest}>
              {children as ReactNode}
            </a>
          );
        }
        if (h.startsWith('/')) {
          return (
            <Link to={h} className="wiki-agent-md__a" {...rest}>
              {children as ReactNode}
            </Link>
          );
        }
        return (
          <a href={h} className="wiki-agent-md__a" {...rest}>
            {children as ReactNode}
          </a>
        );
      },
      code: ({ className, children, ...rest }) => {
        const isBlock = (className || '').includes('language-') || String(children).includes('\n');
        if (isBlock) {
          return (
            <code className={`wiki-agent-md__code wiki-agent-md__code--block ${className || ''}`} {...rest}>
              {children}
            </code>
          );
        }
        return (
          <code className="wiki-agent-md__code wiki-agent-md__code--inline" {...rest}>
            {children}
          </code>
        );
      },
      pre: ({ children }) => <pre className="wiki-agent-md__pre">{children}</pre>,
      ul: ({ children }) => <ul className="wiki-agent-md__ul">{children}</ul>,
      ol: ({ children }) => <ol className="wiki-agent-md__ol">{children}</ol>,
      li: ({ children }) => <li className="wiki-agent-md__li">{children}</li>,
      h1: ({ children }) => <h1 className="wiki-agent-md__h1">{children}</h1>,
      h2: ({ children }) => <h2 className="wiki-agent-md__h2">{children}</h2>,
      h3: ({ children }) => <h3 className="wiki-agent-md__h3">{children}</h3>,
      p: ({ children }) => <p className="wiki-agent-md__p">{children}</p>,
      blockquote: ({ children }) => <blockquote className="wiki-agent-md__quote">{children}</blockquote>,
      table: ({ children }) => <div className="wiki-agent-md__table-wrap"><table className="wiki-agent-md__table">{children}</table></div>,
      th: ({ children }) => <th className="wiki-agent-md__th">{children}</th>,
      td: ({ children }) => <td className="wiki-agent-md__td">{children}</td>,
      strong: ({ children }) => <strong className="wiki-agent-md__strong">{children}</strong>,
      em: ({ children }) => <em className="wiki-agent-md__em">{children}</em>,
    }),
    []
  );
}

/**
 * Renders user/assistant text: markdown (GFM) for assistant, optional markdown for user, or plain line breaks for `plain`.
 */
export function WikiAgentMessageBody({ text, variant }: WikiAgentMessageBodyProps) {
  const components = useMarkdownComponents();
  if (variant === 'plain') {
    return <p className="wiki-space-agent-panel__msg-text wiki-space-agent-panel__msg-text--plain">{text}</p>;
  }
  return (
    <div
      className={`wiki-agent-md wiki-agent-md--${variant}`}
      data-variant={variant}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
