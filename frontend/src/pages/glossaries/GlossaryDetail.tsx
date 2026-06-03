import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Search as SearchIcon,
  Plus,
  Pencil,
  Trash2,
  X,
  Download,
  Upload,
  Sparkles,
  Loader2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchGlossary,
  fetchGlossaryTerms,
  createGlossaryTerm,
  updateGlossaryTerm,
  deleteGlossaryTerm,
  exportGlossary,
  importGlossary,
  suggestGlossaryTerm,
  type GlossaryResponse,
  type GlossaryTermResponse,
} from '../../data/glossariesApi';
import './GlossaryDetail.scss';

function TagInput({
  tags,
  onChange,
  placeholder,
  removeAriaLabel,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  removeAriaLabel?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const v = input.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
      setInput('');
    }
  };

  const removeTag = (idx: number) => {
    onChange(tags.filter((_, i) => i !== idx));
  };

  return (
    <div className="tag-input">
      <div className="tag-list">
        {tags.map((t, i) => (
          <span key={`${t}-${i}`} className="tag">
            {t}
            <button type="button" onClick={() => removeTag(i)} aria-label={removeAriaLabel}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
          onBlur={addTag}
          placeholder={placeholder}
          className="tag-input-field"
        />
      </div>
    </div>
  );
}

export function GlossaryDetail() {
  const { t } = useTranslation('explore');
  const { id: glossaryId } = useParams<{ id: string }>();
  const [glossary, setGlossary] = useState<GlossaryResponse | null>(null);
  const [terms, setTerms] = useState<GlossaryTermResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [termsLoading, setTermsLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [showTermForm, setShowTermForm] = useState(false);
  const [editTerm, setEditTerm] = useState<GlossaryTermResponse | null>(null);
  const [termPrimaryEn, setTermPrimaryEn] = useState('');
  const [termPrimaryCn, setTermPrimaryCn] = useState('');
  const [termDefinition, setTermDefinition] = useState('');
  const [termSynonymsEn, setTermSynonymsEn] = useState<string[]>([]);
  const [termSynonymsCn, setTermSynonymsCn] = useState<string[]>([]);
  const [termSaving, setTermSaving] = useState(false);
  const [termSuggesting, setTermSuggesting] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const loadGlossary = useCallback(async () => {
    if (!glossaryId) return;
    try {
      const data = await fetchGlossary(glossaryId);
      setGlossary(data);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastLoadFailed'));
    } finally {
      setLoading(false);
    }
  }, [glossaryId, t]);

  const loadTerms = useCallback(
    async (searchQuery?: string) => {
      if (!glossaryId) return;
      setTermsLoading(true);
      try {
        const data = await fetchGlossaryTerms(glossaryId, {
          search: (searchQuery ?? search).trim() || undefined,
        });
        setTerms(data.items);
      } catch {
        /* noop */
      } finally {
        setTermsLoading(false);
      }
    },
    [glossaryId, search]
  );

  useEffect(() => {
    loadGlossary();
  }, [loadGlossary]);

  // Load terms: immediately when glossary opens or switches, debounced (300ms) when search changes
  const prevGlossaryIdRef = useRef<string | null>(null);
  const prevSearchRef = useRef<string | null>(null);
  useEffect(() => {
    if (!glossaryId) return;
    const glossaryChanged = prevGlossaryIdRef.current !== glossaryId;
    prevGlossaryIdRef.current = glossaryId;
    const isSearchChange = prevSearchRef.current !== null && !glossaryChanged;
    prevSearchRef.current = search;
    const delay = isSearchChange ? 300 : 0;
    const t = setTimeout(() => loadTerms(search), delay);
    return () => clearTimeout(t);
  }, [glossaryId, search, loadTerms]);

  const openAddTerm = () => {
    setEditTerm(null);
    setTermPrimaryEn('');
    setTermPrimaryCn('');
    setTermDefinition('');
    setTermSynonymsEn([]);
    setTermSynonymsCn([]);
    setShowTermForm(true);
  };

  const openEditTerm = (term: GlossaryTermResponse) => {
    setEditTerm(term);
    setTermPrimaryEn(term.primary_en || '');
    setTermPrimaryCn(term.primary_cn || '');
    setTermDefinition(term.definition || '');
    setTermSynonymsEn(term.synonyms_en || []);
    setTermSynonymsCn(term.synonyms_cn || []);
    setShowTermForm(true);
  };

  const closeTermForm = () => {
    setShowTermForm(false);
    setEditTerm(null);
    setTermPrimaryEn('');
    setTermPrimaryCn('');
    setTermDefinition('');
    setTermSynonymsEn([]);
    setTermSynonymsCn([]);
  };

  const handleSaveTerm = async () => {
    if (!glossaryId || (!termPrimaryEn.trim() && !termPrimaryCn.trim())) {
      toast.error(t('glossary.detail.toastPrimaryRequired'));
      return;
    }
    setTermSaving(true);
    try {
      const payload = {
        primary_en: termPrimaryEn.trim() || undefined,
        primary_cn: termPrimaryCn.trim() || undefined,
        definition: termDefinition.trim() || undefined,
        synonyms_en: termSynonymsEn,
        synonyms_cn: termSynonymsCn,
      };
      if (editTerm) {
        await updateGlossaryTerm(glossaryId, editTerm.id, payload);
        toast.success(t('glossary.detail.toastTermUpdated'));
      } else {
        await createGlossaryTerm(glossaryId, payload);
        toast.success(t('glossary.detail.toastTermAdded'));
      }
      closeTermForm();
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastSaveTermFailed'));
    } finally {
      setTermSaving(false);
    }
  };

  const handleAiSuggestion = async () => {
    const en = termPrimaryEn.trim();
    const cn = termPrimaryCn.trim();
    if (!en && !cn) {
      toast.error(t('glossary.detail.toastEnterPrimaryFirst'));
      return;
    }
    if (!glossaryId) return;
    setTermSuggesting(true);
    try {
      const res = await suggestGlossaryTerm(glossaryId, {
        primary_en: en || undefined,
        primary_cn: cn || undefined,
      });
      setTermPrimaryEn(res.primary_en || '');
      setTermPrimaryCn(res.primary_cn || '');
      setTermDefinition(res.definition || '');
      setTermSynonymsEn(res.synonyms_en || []);
      setTermSynonymsCn(res.synonyms_cn || []);
      toast.success(t('glossary.detail.toastAiApplied'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastAiFailed'));
    } finally {
      setTermSuggesting(false);
    }
  };

  const handleDeleteTerm = async (termId: string) => {
    if (!glossaryId) return;
    if (!confirm(t('glossary.detail.deleteTermConfirm'))) return;
    try {
      await deleteGlossaryTerm(glossaryId, termId);
      toast.success(t('glossary.detail.toastTermDeleted'));
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastDeleteTermFailed'));
    }
  };

  const handleExport = async () => {
    if (!glossaryId) return;
    try {
      const data = await exportGlossary(glossaryId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glossary-${glossary?.name || glossaryId}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('glossary.detail.toastExported'));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastExportFailed'));
    }
  };

  const handleImport = async () => {
    if (!glossaryId || !importFile) {
      toast.error(t('glossary.detail.toastSelectFile'));
      return;
    }
    setImporting(true);
    try {
      const text = await importFile.text();
      const parsed = JSON.parse(text);
      const termsList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.terms) ? parsed.terms : []);
      const validTerms = termsList.filter(
        (t: unknown) =>
          t &&
          typeof t === 'object' &&
          (typeof (t as { primary_en?: string }).primary_en === 'string' ||
            typeof (t as { primary_cn?: string }).primary_cn === 'string')
      );
      if (validTerms.length === 0) {
        toast.error(t('glossary.detail.toastNoValidTerms'));
        return;
      }
      await importGlossary(glossaryId, {
        terms: validTerms.map((t: { primary_en?: string; primary_cn?: string; definition?: string; description?: string; synonyms_en?: string[]; synonyms_cn?: string[] }) => ({
          primary_en: t.primary_en || null,
          primary_cn: t.primary_cn || null,
          definition: (t.definition ?? t.description) || null,
          synonyms_en: t.synonyms_en || [],
          synonyms_cn: t.synonyms_cn || [],
        })),
        mode: importMode,
      });
      toast.success(t('glossary.detail.toastImported', { count: validTerms.length }));
      setShowImport(false);
      setImportFile(null);
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t('glossary.detail.toastImportFailed'));
    } finally {
      setImporting(false);
    }
  };

  if (loading || !glossary) {
    return (
      <div className="glossary-detail">
        <p className="glossary-detail-loading">{t('glossary.detail.loading')}</p>
      </div>
    );
  }

  return (
    <div className="glossary-detail">
      <div className="glossary-detail-header">
        <Link to="/glossaries" className="glossary-back">
          <ArrowLeft size={18} />
          <span>{t('glossary.detail.backToGlossaries')}</span>
        </Link>
        <div className="glossary-detail-title-row">
          <h1>{glossary.name}</h1>
          <div className="glossary-detail-actions">
            <button type="button" className="btn btn-secondary" onClick={handleExport} title={t('glossary.detail.export')}>
              <Download size={18} />
              <span>{t('glossary.detail.export')}</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)} title={t('glossary.detail.import')}>
              <Upload size={18} />
              <span>{t('glossary.detail.import')}</span>
            </button>
            <Link
              to={`/glossaries/${glossaryId}/settings?tab=sharing`}
              className="btn btn-secondary"
              title={t('glossary.detail.sharingSettings')}
            >
              <Users size={18} />
              <span>{t('glossary.detail.sharingSettings')}</span>
            </Link>
            <button type="button" className="btn btn-primary" onClick={openAddTerm}>
              <Plus size={18} />
              <span>{t('glossary.detail.addTerm')}</span>
            </button>
          </div>
        </div>
        {glossary.description && (
          <p className="glossary-detail-desc">{glossary.description}</p>
        )}
      </div>

      <div className="glossary-search-bar">
        <SearchIcon size={18} className="glossary-search-icon" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('glossary.detail.searchPlaceholder')}
          className="glossary-search-input"
        />
      </div>

      <div className="glossary-terms-table-wrapper">
        <table className="glossary-terms-table">
                <thead>
                  <tr>
                    <th>{t('glossary.detail.colPrimaryCn')}</th>
                    <th>{t('glossary.detail.colPrimaryEn')}</th>
                    <th>{t('glossary.detail.colDefinition')}</th>
                    <th>{t('glossary.detail.colSynonymsCn')}</th>
                    <th>{t('glossary.detail.colSynonymsEn')}</th>
                    <th className="glossary-terms-actions-col" />
                  </tr>
                </thead>
          <tbody>
            {termsLoading && terms.length === 0 ? (
              <tr>
                <td colSpan={6} className="glossary-terms-empty">
                  <span className="glossary-terms-loading">
                    <Loader2 size={18} className="glossary-terms-spinner" />
                    {search ? t('glossary.detail.loadingSearching') : t('glossary.detail.loadingTerms')}
                  </span>
                </td>
              </tr>
            ) : terms.length === 0 ? (
              <tr>
                <td colSpan={6} className="glossary-terms-empty">
                  {search ? t('glossary.detail.emptyNoMatch') : t('glossary.detail.emptyNoTerms')}
                </td>
              </tr>
            ) : (
              terms.map((term) => (
                <tr key={term.id}>
                  <td>{term.primary_cn || t('glossary.detail.dash')}</td>
                  <td>{term.primary_en || t('glossary.detail.dash')}</td>
                  <td className="glossary-term-definition">{term.definition || t('glossary.detail.dash')}</td>
                  <td>{term.synonyms_cn?.length ? term.synonyms_cn.join(', ') : t('glossary.detail.dash')}</td>
                  <td>{term.synonyms_en?.length ? term.synonyms_en.join(', ') : t('glossary.detail.dash')}</td>
                  <td className="glossary-terms-actions-col">
                    <button
                      type="button"
                      title={t('glossary.detail.editTitle')}
                      aria-label={t('glossary.detail.editTitle')}
                      onClick={() => openEditTerm(term)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title={t('glossary.detail.deleteTitle')}
                      aria-label={t('glossary.detail.deleteTitle')}
                      onClick={() => handleDeleteTerm(term.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showTermForm && (
        <div className="glossary-dialog-overlay" onClick={closeTermForm}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>{editTerm ? t('glossary.detail.dialogEditTerm') : t('glossary.detail.dialogAddTerm')}</h2>
              <button type="button" className="glossary-dialog-close" onClick={closeTermForm}>
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>{t('glossary.detail.primaryCn')}</span>
                <input
                  type="text"
                  value={termPrimaryCn}
                  onChange={(e) => setTermPrimaryCn(e.target.value)}
                  placeholder={t('glossary.detail.primaryCnPlaceholder')}
                />
              </label>
              <label>
                <span>{t('glossary.detail.primaryEn')}</span>
                <input
                  type="text"
                  value={termPrimaryEn}
                  onChange={(e) => setTermPrimaryEn(e.target.value)}
                  placeholder={t('glossary.detail.primaryEnPlaceholder')}
                />
              </label>
              <label>
                <span>{t('glossary.detail.definitionLabel')}</span>
                <textarea
                  rows={2}
                  value={termDefinition}
                  onChange={(e) => setTermDefinition(e.target.value)}
                  placeholder={t('glossary.detail.definitionPlaceholder')}
                />
              </label>
              <label>
                <span>{t('glossary.detail.synonymsCn')}</span>
                <TagInput
                  tags={termSynonymsCn}
                  onChange={setTermSynonymsCn}
                  placeholder={t('glossary.detail.synonymPlaceholder')}
                  removeAriaLabel={t('glossary.detail.removeTagAria')}
                />
              </label>
              <label>
                <span>{t('glossary.detail.synonymsEn')}</span>
                <TagInput
                  tags={termSynonymsEn}
                  onChange={setTermSynonymsEn}
                  placeholder={t('glossary.detail.synonymPlaceholder')}
                  removeAriaLabel={t('glossary.detail.removeTagAria')}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeTermForm}>
                {t('glossary.detail.cancel')}
              </button>
              {(termPrimaryEn.trim() || termPrimaryCn.trim()) && (
                <button
                  type="button"
                  className="btn btn-secondary glossary-ai-suggestion-btn"
                  onClick={handleAiSuggestion}
                  disabled={termSuggesting}
                >
                  {termSuggesting ? (
                    <Loader2 size={18} className="glossary-ai-spinner" />
                  ) : (
                    <Sparkles size={18} />
                  )}
                  <span>{termSuggesting ? t('glossary.detail.aiSuggesting') : t('glossary.detail.aiSuggestion')}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={(!termPrimaryEn.trim() && !termPrimaryCn.trim()) || termSaving}
                onClick={handleSaveTerm}
              >
                {termSaving ? t('glossary.detail.saving') : editTerm ? t('glossary.detail.save') : t('glossary.detail.add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="glossary-dialog-overlay" onClick={() => !importing && setShowImport(false)}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>{t('glossary.detail.importTermsTitle')}</h2>
              <button
                type="button"
                className="glossary-dialog-close"
                onClick={() => !importing && setShowImport(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>{t('glossary.detail.importMode')}</span>
                <select value={importMode} onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}>
                  <option value="append">{t('glossary.detail.importAppend')}</option>
                  <option value="replace">{t('glossary.detail.importReplace')}</option>
                </select>
              </label>
              <label>
                <span>{t('glossary.detail.jsonFile')}</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={() => !importing && setShowImport(false)}>
                {t('glossary.detail.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!importFile || importing}
                onClick={handleImport}
              >
                {importing ? t('glossary.detail.importing') : t('glossary.detail.importVerb')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
