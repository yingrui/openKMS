import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
} from '../data/glossariesApi';
import './GlossaryDetail.css';

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
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
            <button type="button" onClick={() => removeTag(i)} aria-label="Remove">
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
      toast.error(e instanceof Error ? e.message : 'Failed to load glossary');
    } finally {
      setLoading(false);
    }
  }, [glossaryId]);

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

  const openEditTerm = (t: GlossaryTermResponse) => {
    setEditTerm(t);
    setTermPrimaryEn(t.primary_en || '');
    setTermPrimaryCn(t.primary_cn || '');
    setTermDefinition(t.definition || '');
    setTermSynonymsEn(t.synonyms_en || []);
    setTermSynonymsCn(t.synonyms_cn || []);
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
      toast.error('At least one of Primary EN or Primary CN is required');
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
        toast.success('Term updated');
      } else {
        await createGlossaryTerm(glossaryId, payload);
        toast.success('Term added');
      }
      closeTermForm();
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to save term');
    } finally {
      setTermSaving(false);
    }
  };

  const handleAiSuggestion = async () => {
    const en = termPrimaryEn.trim();
    const cn = termPrimaryCn.trim();
    if (!en && !cn) {
      toast.error('Enter primary term (EN or CN) first');
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
      toast.success('AI suggestion applied. Edit if needed, then Add.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'AI suggestion failed');
    } finally {
      setTermSuggesting(false);
    }
  };

  const handleDeleteTerm = async (termId: string) => {
    if (!glossaryId) return;
    if (!confirm('Delete this term?')) return;
    try {
      await deleteGlossaryTerm(glossaryId, termId);
      toast.success('Term deleted');
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to delete term');
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
      toast.success('Glossary exported');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const handleImport = async () => {
    if (!glossaryId || !importFile) {
      toast.error('Select a JSON file to import');
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
        toast.error('No valid terms found in file');
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
      toast.success(`Imported ${validTerms.length} terms`);
      setShowImport(false);
      setImportFile(null);
      loadTerms();
      loadGlossary();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  if (loading || !glossary) {
    return (
      <div className="glossary-detail">
        <p className="glossary-detail-loading">Loading...</p>
      </div>
    );
  }

  return (
    <div className="glossary-detail">
      <div className="glossary-detail-header">
        <Link to="/glossaries" className="glossary-back">
          <ArrowLeft size={18} />
          <span>Glossaries</span>
        </Link>
        <div className="glossary-detail-title-row">
          <h1>{glossary.name}</h1>
          <div className="glossary-detail-actions">
            <button type="button" className="btn btn-secondary" onClick={handleExport} title="Export">
              <Download size={18} />
              <span>Export</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)} title="Import">
              <Upload size={18} />
              <span>Import</span>
            </button>
            <button type="button" className="btn btn-primary" onClick={openAddTerm}>
              <Plus size={18} />
              <span>Add Term</span>
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
          placeholder="Search terms (EN, CN, definition, or synonyms)..."
          className="glossary-search-input"
        />
      </div>

      <div className="glossary-terms-table-wrapper">
        <table className="glossary-terms-table">
                <thead>
                  <tr>
                    <th>Primary CN</th>
                    <th>Primary EN</th>
                    <th>Definition</th>
                    <th>Synonyms CN</th>
                    <th>Synonyms EN</th>
                    <th className="glossary-terms-actions-col" />
                  </tr>
                </thead>
          <tbody>
            {termsLoading && terms.length === 0 ? (
              <tr>
                <td colSpan={6} className="glossary-terms-empty">
                  <span className="glossary-terms-loading">
                    <Loader2 size={18} className="glossary-terms-spinner" />
                    {search ? 'Searching...' : 'Loading terms...'}
                  </span>
                </td>
              </tr>
            ) : terms.length === 0 ? (
              <tr>
                <td colSpan={6} className="glossary-terms-empty">
                  {search ? 'No matching terms' : 'No terms yet. Add one to get started.'}
                </td>
              </tr>
            ) : (
              terms.map((t) => (
                <tr key={t.id}>
                  <td>{t.primary_cn || '—'}</td>
                  <td>{t.primary_en || '—'}</td>
                  <td className="glossary-term-definition">{t.definition || '—'}</td>
                  <td>{t.synonyms_cn?.length ? t.synonyms_cn.join(', ') : '—'}</td>
                  <td>{t.synonyms_en?.length ? t.synonyms_en.join(', ') : '—'}</td>
                  <td className="glossary-terms-actions-col">
                    <button
                      type="button"
                      title="Edit"
                      aria-label="Edit"
                      onClick={() => openEditTerm(t)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete"
                      onClick={() => handleDeleteTerm(t.id)}
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
              <h2>{editTerm ? 'Edit Term' : 'Add Term'}</h2>
              <button type="button" className="glossary-dialog-close" onClick={closeTermForm}>
                <X size={20} />
              </button>
            </div>
            <div className="glossary-dialog-body">
              <label>
                <span>Primary (CN)</span>
                <input
                  type="text"
                  value={termPrimaryCn}
                  onChange={(e) => setTermPrimaryCn(e.target.value)}
                  placeholder="e.g. 机器学习"
                />
              </label>
              <label>
                <span>Primary (EN)</span>
                <input
                  type="text"
                  value={termPrimaryEn}
                  onChange={(e) => setTermPrimaryEn(e.target.value)}
                  placeholder="e.g. Machine Learning"
                />
              </label>
              <label>
                <span>Definition</span>
                <textarea
                  rows={2}
                  value={termDefinition}
                  onChange={(e) => setTermDefinition(e.target.value)}
                  placeholder="Optional definition of the term"
                />
              </label>
              <label>
                <span>Synonyms (CN)</span>
                <TagInput
                  tags={termSynonymsCn}
                  onChange={setTermSynonymsCn}
                  placeholder="Add synonym, press Enter"
                />
              </label>
              <label>
                <span>Synonyms (EN)</span>
                <TagInput
                  tags={termSynonymsEn}
                  onChange={setTermSynonymsEn}
                  placeholder="Add synonym, press Enter"
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={closeTermForm}>
                Cancel
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
                  <span>{termSuggesting ? 'Suggesting...' : 'AI Suggestion'}</span>
                </button>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={(!termPrimaryEn.trim() && !termPrimaryCn.trim()) || termSaving}
                onClick={handleSaveTerm}
              >
                {termSaving ? 'Saving...' : editTerm ? 'Save' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="glossary-dialog-overlay" onClick={() => !importing && setShowImport(false)}>
          <div className="glossary-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="glossary-dialog-header">
              <h2>Import Terms</h2>
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
                <span>Import mode</span>
                <select value={importMode} onChange={(e) => setImportMode(e.target.value as 'append' | 'replace')}>
                  <option value="append">Append (add to existing)</option>
                  <option value="replace">Replace (delete existing, then add)</option>
                </select>
              </label>
              <label>
                <span>JSON file</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <div className="glossary-dialog-footer">
              <button type="button" className="btn btn-secondary" onClick={() => !importing && setShowImport(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!importFile || importing}
                onClick={handleImport}
              >
                {importing ? 'Importing...' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
