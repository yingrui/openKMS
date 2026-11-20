import CodeMirror from "@uiw/react-codemirror";
import { python } from "@codemirror/lang-python";
import { githubDark, githubLight } from "@uiw/codemirror-theme-github";
import { useDocumentTheme } from "../../hooks/useDocumentTheme";
import "./pythonCodeEditor.scss";

type PythonCodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
};

/** Python editing with line numbers and highlighting, shared by the editors that accept scripts. */
export function PythonCodeEditor({
  value,
  onChange,
  ariaLabel,
}: PythonCodeEditorProps) {
  const theme = useDocumentTheme();

  return (
    <CodeMirror
      className="python-code-editor"
      value={value}
      height="100%"
      theme={theme === "dark" ? githubDark : githubLight}
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
