import { Check, FileText, Loader2, Sparkles, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiModelResponse } from '../../data/modelsApi';
import type {
  FAQGenerateResult,
  FAQResponse,
  KBDocumentResponse,
} from '../../data/knowledgeBasesApi';

export interface KbFaqDialogProps {
  show: boolean;
  editFaq: FAQResponse | null;
  faqDialogSource: 'manual' | 'from_qa';
  faqPolishing: boolean;
  onClose: () => void;
  faqQuestion: string;
  onFaqQuestionChange: (value: string) => void;
  faqAnswer: string;
  onFaqAnswerChange: (value: string) => void;
  onPolishFaqAnswer: () => void;
  metadataKeys: string[] | null | undefined;
  faqMetadataIsArray: Record<string, boolean>;
  faqDocMetadataValues: Record<string, string>;
  onFaqDocMetadataValuesChange: (updater: (prev: Record<string, string>) => Record<string, string>) => void;
  onSaveFaq: () => void;
}

export function KbFaqDialog({
  show,
  editFaq,
  faqDialogSource,
  faqPolishing,
  onClose,
  faqQuestion,
  onFaqQuestionChange,
  faqAnswer,
  onFaqAnswerChange,
  onPolishFaqAnswer,
  metadataKeys,
  faqMetadataIsArray,
  faqDocMetadataValues,
  onFaqDocMetadataValuesChange,
  onSaveFaq,
}: KbFaqDialogProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!show) return null;

  const faqDialogTitle = editFaq
    ? t('detail.faqDialogEdit')
    : faqDialogSource === 'from_qa'
      ? t('detail.faqDialogSaveFromQa')
      : t('detail.faqDialogAdd');

  return (
    <div
      className="kb-doc-picker-overlay"
      onClick={() => {
        if (!faqPolishing) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="faq-dialog-title"
    >
      <div className="kb-doc-picker kb-faq-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="kb-doc-picker-header">
          <h2 id="faq-dialog-title">{faqDialogTitle}</h2>
          <button
            type="button"
            className="kb-doc-picker-close"
            onClick={onClose}
            disabled={faqPolishing}
            aria-label={t('detail.closeAria')}
          >
            <X size={20} />
          </button>
        </div>
        <div className="kb-faq-dialog-form">
          {faqDialogSource === 'from_qa' ? (
            <p className="kb-faq-dialog-hint">{t('detail.faqDialogSaveFromQaHint')}</p>
          ) : null}
          <label>
            <span>{t('detail.question')}</span>
            <input
              type="text"
              placeholder={t('detail.placeholderQuestion')}
              value={faqQuestion}
              onChange={(e) => onFaqQuestionChange(e.target.value)}
              disabled={faqPolishing}
              autoFocus
            />
          </label>
          <label>
            <div className="kb-faq-answer-header">
              <span>{t('detail.answer')}</span>
              <button
                type="button"
                className="kb-faq-polish-btn"
                onClick={onPolishFaqAnswer}
                disabled={faqPolishing || !faqQuestion.trim() || !faqAnswer.trim()}
                aria-label={t('detail.faqPolishAnswerAria')}
              >
                {faqPolishing ? (
                  <Loader2 size={14} className="kb-faq-polish-btn__spin" aria-hidden />
                ) : (
                  <Sparkles size={14} aria-hidden />
                )}
                <span>{faqPolishing ? t('detail.faqPolishing') : t('detail.faqPolishAnswer')}</span>
              </button>
            </div>
            <textarea
              placeholder={t('detail.placeholderAnswer')}
              value={faqAnswer}
              onChange={(e) => onFaqAnswerChange(e.target.value)}
              disabled={faqPolishing}
              rows={8}
            />
          </label>

          {metadataKeys && metadataKeys.length > 0 && (
            <div className="kb-kv-editor">
              <span className="kb-kv-editor-label">{t('detail.metadata')}</span>
              <small className="kb-kv-editor-hint">
                {Object.values(faqMetadataIsArray).some(Boolean) ? t('detail.kvHintArray') : t('detail.kvHintSingle')}
              </small>
              {metadataKeys.map((key) => (
                <div key={key} className="kb-kv-row kb-kv-row-config">
                  <span className="kb-kv-key-label">{key}{faqMetadataIsArray[key] ? t('detail.arraySuffix') : ''}</span>
                  <input
                    type="text"
                    placeholder={faqMetadataIsArray[key] ? t('detail.placeholderValueArray', { key }) : t('detail.placeholderValueSingle', { key })}
                    value={faqDocMetadataValues[key] ?? ''}
                    onChange={(e) => onFaqDocMetadataValuesChange((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="kb-doc-picker-footer">
            <div />
            <div className="kb-doc-picker-actions">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={faqPolishing}>
                {t('detail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSaveFaq}
                disabled={faqPolishing || !faqQuestion.trim() || !faqAnswer.trim()}
              >
                {editFaq ? t('detail.update') : t('detail.create')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface KbGenerateFaqDialogProps {
  show: boolean;
  genStep: 'config' | 'review';
  onClose: () => void;
  generating: boolean;
  genSaving: boolean;
  genProgress: { current: number; total: number; documentName: string } | null;
  genModelId: string;
  onGenModelIdChange: (value: string) => void;
  llmModels: ApiModelResponse[];
  genPrompt: string;
  onGenPromptChange: (value: string) => void;
  genDocs: KBDocumentResponse[];
  genSelectedDocs: Set<string>;
  onGenSelectedDocsChange: (docs: Set<string>) => void;
  onToggleGenDoc: (docId: string) => void;
  genPreviewFaqs: FAQGenerateResult[];
  onRemoveGenPreviewFaq: (idx: number) => void;
  onGenerateFaqs: () => void;
  onGenBackToConfig: () => void;
  onSaveGeneratedFaqs: () => void;
}

export function KbGenerateFaqDialog({
  show,
  genStep,
  onClose,
  generating,
  genSaving,
  genProgress,
  genModelId,
  onGenModelIdChange,
  llmModels,
  genPrompt,
  onGenPromptChange,
  genDocs,
  genSelectedDocs,
  onGenSelectedDocsChange,
  onToggleGenDoc,
  genPreviewFaqs,
  onRemoveGenPreviewFaq,
  onGenerateFaqs,
  onGenBackToConfig,
  onSaveGeneratedFaqs,
}: KbGenerateFaqDialogProps) {
  const { t } = useTranslation('knowledgeBase');
  if (!show) return null;

  return (
    <div
      className="kb-doc-picker-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="gen-faq-title"
    >
      <div className="kb-doc-picker" onClick={(e) => e.stopPropagation()}>
        <div className="kb-doc-picker-header">
          <h2 id="gen-faq-title">{genStep === 'config' ? t('detail.genModalTitleConfig') : t('detail.genModalTitleReview')}</h2>
          <button
            type="button"
            className="kb-doc-picker-close"
            onClick={onClose}
            disabled={generating || genSaving}
            aria-label={t('detail.closeAria')}
          >
            <X size={20} />
          </button>
        </div>
        <p className="kb-doc-picker-hint">
          {genStep === 'config'
            ? generating && genProgress
              ? t('detail.genHintProgress', {
                  current: genProgress.current,
                  total: genProgress.total,
                  name: genProgress.documentName,
                })
              : t('detail.genHintConfig')
            : t('detail.genHintReview')}
        </p>
        {generating && genProgress && genProgress.total > 1 && (
          <div className="kb-gen-progress-bar">
            <div
              className="kb-gen-progress-fill"
              style={{ width: `${(genProgress.current / genProgress.total) * 100}%` }}
            />
          </div>
        )}

        {genStep === 'config' ? (
          <>
            <div className="kb-gen-model-select">
              <label>
                <span>{t('detail.llmModel')}</span>
                <select value={genModelId} onChange={(e) => onGenModelIdChange(e.target.value)}>
                  <option value="">{t('detail.selectModel')}</option>
                  {llmModels.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('detail.prompt')}</span>
                <textarea
                  placeholder={t('detail.promptPlaceholder')}
                  value={genPrompt}
                  onChange={(e) => onGenPromptChange(e.target.value)}
                  rows={4}
                />
              </label>
            </div>

            <div className="kb-gen-doc-header">
              <span className="kb-gen-doc-label">{t('detail.documents')}</span>
              <button
                type="button"
                className="kb-gen-toggle-all"
                onClick={() => {
                  if (genSelectedDocs.size === genDocs.length) onGenSelectedDocsChange(new Set());
                  else onGenSelectedDocsChange(new Set(genDocs.map((d) => d.document_id)));
                }}
              >
                {genSelectedDocs.size === genDocs.length ? t('detail.deselectAll') : t('detail.selectAll')}
              </button>
            </div>

            <div className="kb-doc-picker-list">
              {genDocs.length === 0 ? (
                <div className="kb-doc-picker-empty">
                  <p>{t('detail.genNoDocs')}</p>
                </div>
              ) : (
                genDocs.map((doc) => {
                  const selected = genSelectedDocs.has(doc.document_id);
                  return (
                    <div
                      key={doc.document_id}
                      className={`kb-doc-picker-item${selected ? ' selected' : ''}`}
                      onClick={() => onToggleGenDoc(doc.document_id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && onToggleGenDoc(doc.document_id)}
                    >
                      <div className="kb-doc-picker-item-check">
                        {selected ? (
                          <Check size={16} />
                        ) : (
                          <div className="kb-doc-picker-item-checkbox" />
                        )}
                      </div>
                      <FileText size={18} className="kb-doc-picker-item-icon" />
                      <div className="kb-doc-picker-item-info">
                        <span className="kb-doc-picker-item-name">{doc.document_name || doc.document_id}</span>
                        <span className="kb-doc-picker-item-meta">
                          {doc.document_file_type} · {doc.document_status || 'completed'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div className="kb-gen-review-list">
            {genPreviewFaqs.length === 0 ? (
              <div className="kb-doc-picker-empty">
                <p>{t('detail.genNoPreview')}</p>
              </div>
            ) : (
              genPreviewFaqs.map((faq, idx) => (
                <div key={idx} className="kb-gen-review-item">
                  <div className="kb-gen-review-content">
                    <span className="kb-gen-review-source">{faq.document_name || faq.document_id}</span>
                    <p className="kb-gen-review-q">{faq.question}</p>
                    <p className="kb-gen-review-a">{faq.answer}</p>
                  </div>
                  <button
                    type="button"
                    className="kb-gen-review-remove"
                    onClick={() => onRemoveGenPreviewFaq(idx)}
                    aria-label={t('detail.genRemoveFaqAria')}
                    title={t('detail.remove')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        <div className="kb-doc-picker-footer">
          <span className="kb-doc-picker-count">
            {genStep === 'config'
              ? (genSelectedDocs.size > 0
                  ? t('detail.genFooterSelectedDocs', { count: genSelectedDocs.size })
                  : t('detail.genFooterNoDocs'))
              : t('detail.genFooterSaveCount', { count: genPreviewFaqs.length })}
          </span>
          <div className="kb-doc-picker-actions">
            {genStep === 'config' ? (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={generating}
                >
                  {t('detail.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onGenerateFaqs}
                  disabled={!genModelId || genSelectedDocs.size === 0 || generating}
                >
                  {generating ? (
                    <>
                      <Loader2 size={18} className="kb-doc-picker-spinner" />
                      <span>{t('detail.generating')}</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>{t('detail.generate')}</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onGenBackToConfig}
                  disabled={genSaving}
                >
                  {t('detail.genModalBack')}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onSaveGeneratedFaqs}
                  disabled={genPreviewFaqs.length === 0 || genSaving}
                >
                  {genSaving ? (
                    <>
                      <Loader2 size={18} className="kb-doc-picker-spinner" />
                      <span>{t('detail.saving')}</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>{t('detail.saveFaqs', { count: genPreviewFaqs.length })}</span>
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
