import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Braces, ChevronDown, ChevronUp, Loader2, Play, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

type FunctionPreviewPanelProps = {
  input: string;
  output: string;
  running: boolean;
  canRun: boolean;
  onInputChange: (value: string) => void;
  onRun: () => void;
};

export function FunctionPreviewPanel({
  input,
  output,
  running,
  canRun,
  onInputChange,
  onRun,
}: FunctionPreviewPanelProps) {
  const { t } = useTranslation('ontology');
  const [collapsed, setCollapsed] = useState(false);

  const formatInput = () => {
    try {
      const parsed = JSON.parse(input) as unknown;
      onInputChange(JSON.stringify(parsed, null, 2));
    } catch {
      toast.error(t('editor.invalidJson'));
    }
  };

  const applySample = () => {
    onInputChange(JSON.stringify({ name: 'openKMS' }, null, 2));
  };

  const outputStatus = (() => {
    if (!output.trim()) return null;
    try {
      const parsed = JSON.parse(output) as { status?: string };
      return parsed.status === 'ok' ? 'ok' : parsed.status === 'error' ? 'error' : 'neutral';
    } catch {
      return 'neutral';
    }
  })();

  return (
    <footer className={`function-editor-preview${collapsed ? ' function-editor-preview--collapsed' : ''}`}>
      <div className="function-editor-preview__header">
        <button
          type="button"
          className="function-editor-preview__toggle"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
          <span>{t('editor.livePreview')}</span>
        </button>
        <div className="function-editor-preview__tools">
          <button type="button" className="function-editor-preview__tool" onClick={formatInput}>
            <Braces size={14} aria-hidden />
            {t('editor.formatJson')}
          </button>
          <button type="button" className="function-editor-preview__tool" onClick={applySample}>
            <Sparkles size={14} aria-hidden />
            {t('editor.sampleInput')}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm function-editor-preview__run"
            onClick={onRun}
            disabled={!canRun || running}
          >
            {running ? <Loader2 size={14} className="spin" aria-hidden /> : <Play size={14} aria-hidden />}
            {running ? t('editor.running') : t('shared.run')}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="function-editor-preview__body">
          <div className="function-editor-preview__pane">
            <div className="function-editor-preview__pane-label">{t('editor.previewInput')}</div>
            <textarea
              className="function-editor-preview__io"
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              spellCheck={false}
              aria-label={t('editor.previewInput')}
            />
          </div>
          <div className="function-editor-preview__pane">
            <div className="function-editor-preview__pane-label">
              {t('editor.previewOutput')}
              {outputStatus && (
                <span className={`function-editor-preview__status function-editor-preview__status--${outputStatus}`}>
                  {outputStatus === 'ok' ? t('editor.statusOk') : outputStatus === 'error' ? t('editor.statusError') : '—'}
                </span>
              )}
            </div>
            <textarea
              className="function-editor-preview__io function-editor-preview__io--output"
              value={output}
              readOnly
              placeholder={t('editor.outputPlaceholder')}
              aria-label={t('editor.previewOutput')}
            />
          </div>
        </div>
      )}
    </footer>
  );
}
