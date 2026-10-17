import { useRef } from 'react';
import { highlightSql } from './sqlHighlight';
import './SqlEditor.scss';

export interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  /** For the accessible name; the visible label is the caller's `<FormField>`. */
  ariaLabel: string;
}

/**
 * A textarea with syntax highlighting, at zero dependencies.
 *
 * A query is worth colouring; a 200 kB editor is not, and neither is a contenteditable. The textarea
 * stays the input (selection, IME, undo and mobile keyboards all keep working) and a `<pre>` behind it
 * paints the colours — the two must therefore render identical text and wrap identically, which is
 * what the `join(tokens) === value` test protects.
 */
export function SqlEditor({ value, onChange, rows = 9, ariaLabel }: SqlEditorProps) {
  const preRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const syncScroll = () => {
    const pre = preRef.current;
    const input = inputRef.current;
    if (pre && input) {
      pre.scrollTop = input.scrollTop;
      pre.scrollLeft = input.scrollLeft;
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Tab') return;
    // Tab must indent here: a rule is code, and Tab is how code gets indented.
    event.preventDefault();
    const input = event.currentTarget;
    const { selectionStart, selectionEnd } = input;
    const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
    onChange(next);
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = selectionStart + 2;
    });
  };

  return (
    <div className="sql-editor">
      <pre className="sql-editor__highlight" ref={preRef} aria-hidden>
        {highlightSql(value).map((token, index) => (
          <span key={index} className={`sql-editor__${token.kind}`}>
            {token.text}
          </span>
        ))}
        {'\n'}
      </pre>
      <textarea
        ref={inputRef}
        className="sql-editor__input ds-control ds-control--mono"
        rows={rows}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
      />
    </div>
  );
}
