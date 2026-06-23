import { memo, useMemo, type ReactNode } from 'react';
import type { Components } from 'react-markdown';
import ReactMarkdown from 'react-markdown';
import { Link } from 'react-router-dom';
import {
  richMarkdownPreComponent,
  richMarkdownRemarkPlugins,
  richMarkdownRehypePlugins,
} from '../markdown/richMarkdown';
import './AgentMessage.scss';

export type AgentMessageBodyProps = {
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
            <a href={h} target="_blank" rel="noopener noreferrer" className="agents-md__a" {...rest}>
              {children as ReactNode}
            </a>
          );
        }
        if (h.startsWith('/')) {
          return (
            <Link to={h} className="agents-md__a" {...rest}>
              {children as ReactNode}
            </Link>
          );
        }
        return (
          <a href={h} className="agents-md__a" {...rest}>
            {children as ReactNode}
          </a>
        );
      },
      code: ({ className, children, ...rest }) => {
        const isBlock = (className || '').includes('language-') || String(children).includes('\n');
        if (isBlock) {
          return (
            <code className={`agents-md__code agents-md__code--block ${className || ''}`} {...rest}>
              {children}
            </code>
          );
        }
        return (
          <code className="agents-md__code agents-md__code--inline" {...rest}>
            {children}
          </code>
        );
      },
      pre: richMarkdownPreComponent('agents-md__pre'),
      ul: ({ children }) => <ul className="agents-md__ul">{children}</ul>,
      ol: ({ children }) => <ol className="agents-md__ol">{children}</ol>,
      li: ({ children }) => <li className="agents-md__li">{children}</li>,
      h1: ({ children }) => <h1 className="agents-md__h1">{children}</h1>,
      h2: ({ children }) => <h2 className="agents-md__h2">{children}</h2>,
      h3: ({ children }) => <h3 className="agents-md__h3">{children}</h3>,
      p: ({ children }) => <p className="agents-md__p">{children}</p>,
      blockquote: ({ children }) => <blockquote className="agents-md__quote">{children}</blockquote>,
      table: ({ children }) => (
        <div className="agents-md__table-wrap">
          <table className="agents-md__table">{children}</table>
        </div>
      ),
      th: ({ children }) => <th className="agents-md__th">{children}</th>,
      td: ({ children }) => <td className="agents-md__td">{children}</td>,
      strong: ({ children }) => <strong className="agents-md__strong">{children}</strong>,
      em: ({ children }) => <em className="agents-md__em">{children}</em>,
    }),
    []
  );
}

/** Renders agent message text: GFM markdown for user/assistant, plain pre-wrap for intro lines. */
export const AgentMessageBody = memo(function AgentMessageBody({ text, variant }: AgentMessageBodyProps) {
  const components = useMarkdownComponents();
  if (variant === 'plain') {
    return <p className="agents-msg__text agents-msg__text--plain">{text}</p>;
  }
  return (
    <div className={`agents-md agents-md--${variant}`} data-variant={variant}>
      <ReactMarkdown
        remarkPlugins={richMarkdownRemarkPlugins}
        rehypePlugins={richMarkdownRehypePlugins}
        components={components}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});
