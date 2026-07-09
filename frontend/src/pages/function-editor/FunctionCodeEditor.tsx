import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { githubDark, githubLight } from '@uiw/codemirror-theme-github';
import { useDocumentTheme } from './useDocumentTheme';

type FunctionCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
};

export function FunctionCodeEditor({ value, onChange, ariaLabel }: FunctionCodeEditorProps) {
  const theme = useDocumentTheme();

  return (
    <CodeMirror
      className="function-editor-code-mirror"
      value={value}
      height="100%"
      theme={theme === 'dark' ? githubDark : githubLight}
      extensions={[python()]}
      onChange={onChange}
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: true,
        bracketMatching: true,
        indentOnInput: true,
        tabSize: 4,
      }}
      aria-label={ariaLabel}
    />
  );
}
