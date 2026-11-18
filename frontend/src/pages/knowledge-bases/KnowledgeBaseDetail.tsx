import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  HelpCircle,
  Search as SearchIcon,
  Send,
  Layers,
  Plus,
  Trash2,
  Sparkles,
  MessageSquare,
  Pencil,
  Loader2,
  Filter,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { fetchDocumentById } from '../../data/documentsApi';
import { fetchChannelById } from '../../data/channelsApi';
import { normalizeExtractionSchemaToFields } from '../../data/channelUtils';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import {
  KbChunkDialog,
  KbDocPickerDialog,
  KbFaqDialog,
  KbGenerateFaqDialog,
  KbWikiSpacePickerDialog,
} from './KnowledgeBaseDetail.dialogs';
import { KbAgentSettings } from './KbAgentSettings';
import { TAB_ICONS, TAB_ORDER } from './KnowledgeBaseDetail.types';
import { useKnowledgeBaseDetail } from './useKnowledgeBaseDetail';
import { DocumentsTab } from './detail/tabs/DocumentsTab';
import { WikiSpacesTab } from './detail/tabs/WikiSpacesTab';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import { PanelToolbar } from '../../styles/design-system';
import {
  KbRetrievalProvenancePanel,
} from '../workforce/chat';
import './KnowledgeBaseDetail.scss';
import '../workforce/chat/KbQaChat.scss';

export function KnowledgeBaseDetail() {
  const {
    loadKb,
    kbId,   channels, t, kb,  activeTab, setActiveTab, loading, docs, docTotal, docPage, setDocPage, docPageSize, setDocPageSize,
      genDocs,  showDocPicker,  pickerSearch,
     pickerResults,  pickerLoading, pickerSelected, 
    pickerSelectedChannel,  pickerChannelExpanded, 
      pickerPage, setPickerPage, pickerPageSize,
    pickerTotal,  pickerAdding,  kbWikiSpaces,
    kbSemanticModels, kbOntologyGroups, allSemanticModels, allOntologyGroups, scopeBusyId,
    showWikiSpacePicker,  wikiSpacePickerItems, 
    wikiSpacePickerLoading,  wikiSpaceBusyId,  faqs,
    faqTotal, faqPage, setFaqPage, faqPageSize, setFaqPageSize, showFaqDialog, setShowFaqDialog,
    faqDialogSource, setFaqDialogSource, faqPolishing,  editFaq, setEditFaq,
    faqQuestion, setFaqQuestion, faqAnswer, setFaqAnswer, setFaqLabelsValues, faqDocMetadataValues,
    setFaqDocMetadataValues, setFaqLabelAllowMultiple, faqMetadataIsArray, setFaqMetadataIsArray,
    showGenerateModal,  genSelectedDocs, setGenSelectedDocs, genModelId,
    setGenModelId, genPrompt, setGenPrompt, generating,  genProgress, 
    genStep,  genPreviewFaqs,  genSaving,  chunks,
    chunkTotal, chunkPage, setChunkPage, chunkPageSize, setChunkPageSize, editChunk, 
    showChunkDialog,  chunkContent, setChunkContent, 
    chunkDocMetadataValues, setChunkDocMetadataValues,  chunkMetadataIsArray,
     chunkSaving,  chunkDialogReadOnly, 
    searchQuery, setSearchQuery, searchType, setSearchType, searchResults, 
    searching,  hasSearched,  searchOptionsExpanded, setSearchOptionsExpanded,
    searchLabelFilters, searchMetadataFilters, setSearchMetadataFilters, searchTopK, setSearchTopK,
    searchForceDense, setSearchForceDense, searchRetrievalDiff,  settingsEmbeddingModelId, setSettingsEmbeddingModelId, settingsFaqPrompt, setSettingsFaqPrompt,
    settingsChunkStrategy, setSettingsChunkStrategy, settingsChunkSize, setSettingsChunkSize,
    settingsChunkOverlap, setSettingsChunkOverlap, settingsMetadataKeys, setSettingsMetadataKeys,
    embeddingModels, llmModels, settingsSaving,  settingsSubTab, setSettingsSubTab,
    indexJobSubmitting,  settingsSubTabs,   
        enqueueIndexJob, 
    alreadyAddedIds,
    openDocPicker, closeDocPicker,  handlePickerSearch, handlePickerChannelSelect,
    handlePickerChannelToggle, handleAddSelectedDocuments, handleRemoveDocument, togglePickerDoc,
    pickerTotalPages, openWikiSpacePicker, closeWikiSpacePicker, handleAddWikiSpaceToKb, handleRemoveWikiSpaceFromKb,
    handleAddSemanticModelToKb, handleRemoveSemanticModelFromKb,
    handleAddOntologyGroupToKb, handleRemoveOntologyGroupFromKb,
    handleIndexWikiSpace, closeFaqDialog, handlePolishFaqAnswer, handleSaveFaq,
    handleDeleteFaq, openGenerateModal, closeGenerateModal, handleGenerateFaqs, handleSaveGeneratedFaqs,
    handleGenBackToConfig, openChunkEdit, openChunkViewFromId, openChunkEditFromId, closeChunkDialog,
    handleSaveChunk, handleSearch, handleSaveSettings,
     objToConfigValues, pickerCanPrev, pickerCanNext, toggleGenDoc, removeGenPreviewFaq,
  } = useKnowledgeBaseDetail();
  if (loading) return <div className="kb-detail"><p>{t('detail.loading')}</p></div>;
  if (!kb) return <div className="kb-detail"><p>{t('detail.notFound')}</p></div>;

  const faqDialog = (
    <KbFaqDialog
      show={showFaqDialog}
      editFaq={editFaq}
      faqDialogSource={faqDialogSource}
      faqPolishing={faqPolishing}
      onClose={closeFaqDialog}
      faqQuestion={faqQuestion}
      onFaqQuestionChange={setFaqQuestion}
      faqAnswer={faqAnswer}
      onFaqAnswerChange={setFaqAnswer}
      onPolishFaqAnswer={() => void handlePolishFaqAnswer()}
      metadataKeys={kb.metadata_keys}
      faqMetadataIsArray={faqMetadataIsArray}
      faqDocMetadataValues={faqDocMetadataValues}
      onFaqDocMetadataValuesChange={setFaqDocMetadataValues}
      onSaveFaq={handleSaveFaq}
    />
  );

  return (
    <ContentCommentsShell resourceType="knowledge_base" resourceId={kb.id}>
    <div className="kb-detail">
      <Link to="/knowledge-bases" className="kb-detail-back" aria-label={t('detail.backToList')}>
        <ArrowLeft size={18} />
        <span className="ds-compact-label">{t('detail.backToList')}</span>
      </Link>

      <header className="kb-detail-header kb-detail-header--split">
        <div className="kb-detail-header-text">
          <h1>{kb.name}</h1>
          <p className="kb-detail-desc">{kb.description || t('detail.noDescription')}</p>
          <div className="kb-detail-stats">
            <span>{t('detail.statDocs', { count: kb.document_count })}</span>
            <span>{t('detail.statWikiSpaces', { count: kb.wiki_space_count ?? 0 })}</span>
            <span>{t('detail.statFaqs', { count: kb.faq_count })}</span>
            <span>{t('detail.statChunks', { count: kb.chunk_count })}</span>
          </div>
        </div>
        <div className="kb-detail-header-actions">
          {kb.embedding_model_id ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm kb-detail-header-index-btn"
              onClick={() => void enqueueIndexJob()}
              disabled={indexJobSubmitting}
              title={t('detail.indexJobHeaderTitle')}
              aria-label={t('detail.indexJobHeader')}
            >
              {indexJobSubmitting ? (
                <Loader2 size={18} className="kb-spinner-inline" aria-hidden />
              ) : (
                <RefreshCw size={18} aria-hidden />
              )}
              <span className="ds-compact-label">{t('detail.indexJobHeader')}</span>
            </button>
          ) : null}
        {kb.qa_available && kb.default_agent_id ? (
          /* The conversation is a workforce screen; this is only the way in from the corpus it answers about. */
          <Link
            className="btn btn-primary btn-sm kb-detail-header-qa-btn"
            to={`/workforce/${kb.default_agent_id}/chat?kb=${encodeURIComponent(kb.id)}`}
            aria-label={t('detail.qaOpenChat')}
          >
            <MessageSquare size={18} aria-hidden />
            <span className="ds-compact-label">{t('detail.qaOpenChat')}</span>
          </Link>
        ) : null}
        </div>
      </header>

      <div className="kb-detail-tabs">
        {TAB_ORDER.map((tabId) => {
          const Icon = TAB_ICONS[tabId];
          const label = t(`detail.tabs.${tabId}`);
          return (
            <button
              key={tabId}
              type="button"
              className={`kb-tab ${activeTab === tabId ? 'active' : ''}`}
              onClick={() => setActiveTab(tabId)}
              aria-label={label}
            >
              <Icon size={18} aria-hidden />
              <span className="ds-compact-label">{label}</span>
            </button>
          );
        })}
      </div>

      <div className="kb-detail-content">
        {/* ===== DOCUMENTS TAB ===== */}
        {activeTab === 'documents' && (
          <DocumentsTab
            t={t}
            docs={docs}
            docTotal={docTotal}
            docPage={docPage}
            docPageSize={docPageSize}
            onPageChange={setDocPage}
            onPageSizeChange={setDocPageSize}
            onAdd={openDocPicker}
            onRemove={handleRemoveDocument}
          />
        )}

        {/* ===== WIKI SPACES TAB ===== */}
        {activeTab === 'wiki_spaces' && (
          <WikiSpacesTab
            t={t}
            spaces={kbWikiSpaces}
            hasEmbeddingModel={Boolean(kb.embedding_model_id)}
            busyId={wikiSpaceBusyId}
            onAdd={() => void openWikiSpacePicker()}
            onIndex={(id) => void handleIndexWikiSpace(id)}
            onRemove={(id) => void handleRemoveWikiSpaceFromKb(id)}
          />
        )}

        {/* ===== DATA SCOPE TAB ===== */}
        {activeTab === 'data_scope' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.dataScopeTitle')}</span>}
            />
            <p className="kb-section-desc">{t('detail.dataScopeHint')}</p>
            <div className="kb-agent-scope-panel">
              <div className="kb-agent-scope-block">
                <div className="kb-agent-scope-heading">{t('detail.agentScopeSemanticModels')}</div>
                <div className="kb-agent-scope-add">
                  <select
                    className="ds-control"
                    aria-label={t('detail.agentScopeAddSemanticModel')}
                    defaultValue=""
                    disabled={!!scopeBusyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      e.target.value = '';
                      if (id) void handleAddSemanticModelToKb(id);
                    }}
                  >
                    <option value="">{t('detail.agentScopeAddSemanticModel')}</option>
                    {allSemanticModels
                      .filter((m) => !kbSemanticModels.some((k) => k.semantic_model_id === m.id))
                      .map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                  </select>
                </div>
                {kbSemanticModels.length === 0 ? (
                  <p className="kb-empty-text">{t('detail.agentScopeEmptySemanticModels')}</p>
                ) : (
                  <ul className="kb-agent-scope-list">
                    {kbSemanticModels.map((m) => (
                      <li key={m.id} className="kb-agent-scope-item">
                        <div className="kb-agent-scope-item-main">
                          <span className="kb-agent-scope-item-name">{m.name}</span>
                          {m.metric_names.length > 0 ? (
                            <span className="kb-agent-scope-item-meta">
                              {t('detail.agentScopeMetricCount', { count: m.metric_names.length })}
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={scopeBusyId === m.semantic_model_id}
                          onClick={() => void handleRemoveSemanticModelFromKb(m.semantic_model_id)}
                        >
                          {t('detail.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="kb-agent-scope-block">
                <div className="kb-agent-scope-heading">{t('detail.agentScopeOntologyGroups')}</div>
                <div className="kb-agent-scope-add">
                  <select
                    className="ds-control"
                    aria-label={t('detail.agentScopeAddOntologyGroup')}
                    defaultValue=""
                    disabled={!!scopeBusyId}
                    onChange={(e) => {
                      const id = e.target.value;
                      e.target.value = '';
                      if (id) void handleAddOntologyGroupToKb(id);
                    }}
                  >
                    <option value="">{t('detail.agentScopeAddOntologyGroup')}</option>
                    {allOntologyGroups
                      .filter((g) => !kbOntologyGroups.some((k) => k.ontology_group_id === g.id))
                      .map((g) => (
                        <option key={g.id} value={g.id}>{g.display_name}</option>
                      ))}
                  </select>
                </div>
                {kbOntologyGroups.length === 0 ? (
                  <p className="kb-empty-text">{t('detail.agentScopeEmptyOntologyGroups')}</p>
                ) : (
                  <ul className="kb-agent-scope-list">
                    {kbOntologyGroups.map((g) => (
                      <li key={g.id} className="kb-agent-scope-item">
                        <div className="kb-agent-scope-item-main">
                          <span className="kb-agent-scope-item-name">{g.display_name}</span>
                          <span className="kb-agent-scope-item-meta">
                            {t('detail.agentScopeObjectTypeCount', { count: g.object_type_count })}
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={scopeBusyId === g.ontology_group_id}
                          onClick={() => void handleRemoveOntologyGroupFromKb(g.ontology_group_id)}
                        >
                          {t('detail.remove')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {/* ===== FAQS TAB ===== */}
        {activeTab === 'faqs' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.faqsTitle', { count: faqTotal })}</span>}
              actions={
                <div className="kb-section-header-btns">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void openGenerateModal()}
                    aria-label={t('detail.generateFaq')}
                  >
                    <Sparkles size={16} aria-hidden />
                    <span className="ds-compact-label">{t('detail.generateFaq')}</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    aria-label={t('detail.addFaq')}
                    onClick={() => {
                    setEditFaq(null);
                    setFaqDialogSource('manual');
                    setFaqQuestion('');
                    setFaqAnswer('');
                    setFaqLabelsValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                    setFaqDocMetadataValues(objToConfigValues({}, kb?.metadata_keys ?? undefined));
                    setFaqLabelAllowMultiple({});
                    setFaqMetadataIsArray({});
                    setShowFaqDialog(true);
                  }}
                  >
                    <Plus size={16} aria-hidden />
                    <span className="ds-compact-label">{t('detail.addFaq')}</span>
                  </button>
                </div>
              }
            />

            {faqTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyFaqs')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th className="kb-table-question-col">{t('detail.colQuestion')}</th>
                      <th>{t('detail.colAnswer')}</th>
                      <th className="kb-table-source-col">{t('detail.colSource')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {faqs.map((faq) => (
                      <tr key={faq.id}>
                        <td className="kb-table-question-col">
                          <div className="kb-table-name">
                            <HelpCircle size={18} />
                            <span>{faq.question}</span>
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{faq.answer}</td>
                        <td className="kb-table-source-col">
                          <span
                            className="kb-table-source"
                            title={faq.document_name || faq.document_id || undefined}
                          >
                            {faq.document_name || faq.document_id || t('detail.dash')}
                          </span>
                        </td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={async () => {
                              setEditFaq(faq);
                              setFaqDialogSource('manual');
                              setFaqQuestion(faq.question);
                              setFaqAnswer(faq.answer);
                              const metaValues = objToConfigValues(faq.doc_metadata, kb?.metadata_keys ?? undefined);
                              setFaqLabelsValues(metaValues);
                              setFaqDocMetadataValues(metaValues);
                              const metadataIsArray: Record<string, boolean> = {};
                              if (faq.document_id && kb?.metadata_keys?.length) {
                                try {
                                  const doc = await fetchDocumentById(faq.document_id);
                                  const channel = await fetchChannelById(doc.channel_id);
                                  const metaFields = normalizeExtractionSchemaToFields(channel.extraction_schema ?? null);
                                  const metaMap = new Map(metaFields.map((f) => [f.key, f.type === 'array']));
                                  const lcMap = new Map(
                                    (channel.label_config ?? []).map((lc: { key: string; type?: string }) => [lc.key, lc.type === 'list[object_type]'])
                                  );
                                  for (const k of kb.metadata_keys) {
                                    metadataIsArray[k] = metaMap.get(k) ?? lcMap.get(k) ?? false;
                                  }
                                } catch {
                                  /* default to false */
                                }
                              }
                              setFaqLabelAllowMultiple({});
                              setFaqMetadataIsArray(metadataIsArray);
                              setShowFaqDialog(true);
                            }}>
                              <Pencil size={16} />
                            </button>
                            <button type="button" title={t('detail.remove')} aria-label={t('detail.remove')} onClick={() => handleDeleteFaq(faq.id)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {faqTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {t('detail.paginationRange', {
                        start: faqTotal === 0 ? 0 : faqPage * faqPageSize + 1,
                        end: Math.min((faqPage + 1) * faqPageSize, faqTotal),
                        total: faqTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
                      <select
                        value={faqPageSize}
                        onChange={(e) => {
                          setFaqPageSize(Number(e.target.value));
                          setFaqPage(0);
                        }}
                        className="ds-control"
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(faqTotal / faqPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(0)}
                        disabled={faqPage === 0}
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.max(0, p - 1))}
                        disabled={faqPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: faqPage + 1,
                          total: Math.ceil(faqTotal / faqPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage((p) => Math.min(Math.ceil(faqTotal / faqPageSize) - 1, p + 1))}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setFaqPage(Math.ceil(faqTotal / faqPageSize) - 1)}
                        disabled={faqPage >= Math.ceil(faqTotal / faqPageSize) - 1}
                        title={t('detail.lastPage')}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== CHUNKS TAB ===== */}
        {activeTab === 'chunks' && (
          <section className="kb-section">
            <PanelToolbar
              className="kb-section-header"
              leading={<span>{t('detail.chunksTitle', { count: chunkTotal })}</span>}
            />
            {chunkTotal === 0 ? (
              <p className="kb-empty-text">{t('detail.emptyChunks')}</p>
            ) : (
              <>
              <div className="ds-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>{t('detail.chunkSource')}</th>
                      <th>{t('detail.colExcerpt')}</th>
                      <th>{t('detail.colTokens')}</th>
                      <th>{t('detail.colEmbedded')}</th>
                      <th className="kb-table-actions">{t('detail.actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chunks.map((chunk) => (
                      <tr key={chunk.id}>
                        <td>
                          <div className="kb-table-name">
                            <Layers size={18} />
                            {chunk.document_id ? (
                              <Link to={`/documents/view/${chunk.document_id}`}>{chunk.document_name || chunk.document_id}</Link>
                            ) : chunk.wiki_page_id && chunk.wiki_space_id ? (
                              <Link to={`/wikis/${chunk.wiki_space_id}/pages/${chunk.wiki_page_id}`}>
                                {chunk.document_name || chunk.wiki_page_id}
                              </Link>
                            ) : (
                              <span>{chunk.document_name || chunk.document_id || chunk.wiki_page_id || t('detail.dash')}</span>
                            )}
                          </div>
                        </td>
                        <td className="kb-table-excerpt">{chunk.content.slice(0, 150)}...</td>
                        <td>{chunk.token_count ?? t('detail.dash')}</td>
                        <td>{chunk.has_embedding ? t('detail.yes') : t('detail.no')}</td>
                        <td className="kb-table-actions">
                          <div className="kb-table-btns">
                            <button type="button" title={t('detail.edit')} aria-label={t('detail.edit')} onClick={() => openChunkEdit(chunk)}>
                              <Pencil size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {chunkTotal > 0 && (
                <div className="kb-pagination">
                  <div className="kb-pagination-info">
                    <span>
                      {t('detail.paginationRange', {
                        start: chunkTotal === 0 ? 0 : chunkPage * chunkPageSize + 1,
                        end: Math.min((chunkPage + 1) * chunkPageSize, chunkTotal),
                        total: chunkTotal,
                      })}
                    </span>
                    <label>
                      <span>{t('detail.pageSize')}</span>
                      <select
                        value={chunkPageSize}
                        onChange={(e) => {
                          setChunkPageSize(Number(e.target.value));
                          setChunkPage(0);
                        }}
                        className="ds-control"
                      >
                        {[25, 50, 100, 200].map((n) => (
                          <option key={n} value={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {Math.ceil(chunkTotal / chunkPageSize) > 1 && (
                    <div className="kb-pagination-btns">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(0)}
                        disabled={chunkPage === 0}
                        title={t('detail.firstPage')}
                      >
                        «
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.max(0, p - 1))}
                        disabled={chunkPage === 0}
                      >
                        {t('detail.previous')}
                      </button>
                      <span className="kb-pagination-nums">
                        {t('detail.pageOf', {
                          current: chunkPage + 1,
                          total: Math.ceil(chunkTotal / chunkPageSize) || 1,
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage((p) => Math.min(Math.ceil(chunkTotal / chunkPageSize) - 1, p + 1))}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                      >
                        {t('detail.next')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setChunkPage(Math.ceil(chunkTotal / chunkPageSize) - 1)}
                        disabled={chunkPage >= Math.ceil(chunkTotal / chunkPageSize) - 1}
                        title={t('detail.lastPage')}
                      >
                        »
                      </button>
                    </div>
                  )}
                </div>
              )}
              </>
            )}
          </section>
        )}

        {/* ===== SEARCH TAB ===== */}
        {activeTab === 'search' && (
          <section className="kb-section kb-search-section">
            <h2>{t('detail.searchTitle')}</h2>
            <p className="kb-section-desc">
              {t('detail.searchDesc')}
            </p>
            <div className="kb-search-type-tabs">
              {(['all', 'chunks', 'faqs'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  className={`kb-search-type-tab${searchType === type ? ' active' : ''}`}
                  onClick={() => setSearchType(type)}
                  aria-pressed={searchType === type}
                >
                  {type === 'all' ? t('detail.searchTypeAll') : type === 'chunks' ? t('detail.searchTypeChunks') : t('detail.searchTypeFaqs')}
                </button>
              ))}
            </div>
            <form className="kb-search-form" onSubmit={handleSearch}>
              <SearchIcon size={20} />
              <input
                type="search"
                aria-label={t('detail.searchAria')}
                placeholder={t('detail.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="kb-search-input"
              />
              <button
                type="submit"
                className="kb-search-submit"
                disabled={searching}
                aria-label={searching ? t('detail.searching') : t('detail.search')}
              >
                <Send size={18} aria-hidden />
                <span className="ds-compact-label">{searching ? t('detail.searching') : t('detail.search')}</span>
              </button>
            </form>

            <div className="kb-search-options-wrap">
              <button
                type="button"
                className="kb-search-options-toggle"
                onClick={() => setSearchOptionsExpanded((o) => !o)}
                aria-expanded={searchOptionsExpanded}
              >
                {searchOptionsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <Filter size={16} aria-hidden />
                <span>{t('detail.searchOptionsToggle')}</span>
                {(Object.values(searchLabelFilters).some(Boolean) ||
                  Object.values(searchMetadataFilters).some(Boolean) ||
                  searchForceDense ||
                  searchTopK !== 10) && (
                  <span className="kb-search-options-badge">{t('detail.filtersActive')}</span>
                )}
              </button>
              {searchOptionsExpanded ? (
                <div className="kb-search-options-panel">
                  <div className="kb-search-options-block">
                    <div className="kb-search-options-block-title">{t('detail.searchOptionsRankingTitle')}</div>
                    <div className="kb-search-options-row">
                      <label className="kb-search-advanced-field">
                        <span>{t('detail.searchTopKLabel')}</span>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={searchTopK}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setSearchTopK(Number.isFinite(n) ? Math.min(50, Math.max(1, Math.trunc(n))) : 10);
                          }}
                          className="ds-control"
                        />
                      </label>
                      <label className="kb-search-advanced-checkbox">
                        <input
                          type="checkbox"
                          checked={searchForceDense}
                          onChange={(e) => setSearchForceDense(e.target.checked)}
                        />
                        <span>{t('detail.searchForceDense')}</span>
                      </label>
                    </div>
                    <p className="kb-search-advanced-hint">{t('detail.searchAdvancedHint')}</p>
                  </div>

                  {kb?.metadata_keys?.length ? (
                    <>
                      <hr className="kb-search-options-sep" />
                      <div className="kb-search-options-block">
                        <div className="kb-search-options-block-title">{t('detail.metadataLabel')}</div>
                        <p className="kb-search-filters-hint">{t('detail.filtersHint')}</p>
                        <div className="kb-search-filters-group">
                          {kb.metadata_keys.map((key) => (
                            <div key={key} className="kb-search-filter-row">
                              <label htmlFor={`search-meta-${key}`}>{key}</label>
                              <input
                                id={`search-meta-${key}`}
                                type="text"
                                placeholder={t('detail.placeholderMetaExample')}
                                value={searchMetadataFilters[key] ?? ''}
                                onChange={(e) => setSearchMetadataFilters((prev) => ({ ...prev, [key]: e.target.value }))}
                                className="ds-control"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <hr className="kb-search-options-sep" />
                      <p className="kb-search-options-empty-hint">{t('detail.metadataKeysEmptyHint')}</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {hasSearched && searchResults.length > 0 && (
              <div className="kb-search-results-panel">
                <h3>{t('detail.resultsTitle', { count: searchResults.length })}</h3>
                {searchRetrievalDiff &&
                (searchRetrievalDiff.added.length > 0 ||
                  searchRetrievalDiff.removed.length > 0 ||
                  searchRetrievalDiff.moved.length > 0) ? (
                  <div className="kb-search-diff-panel" role="region" aria-label={t('detail.searchDiffAria')}>
                    <h4 className="kb-search-diff-title">{t('detail.searchDiffTitle')}</h4>
                    {searchRetrievalDiff.added.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffAdded')}</strong> {searchRetrievalDiff.added.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.removed.length > 0 ? (
                      <p className="kb-search-diff-line">
                        <strong>{t('detail.searchDiffRemoved')}</strong> {searchRetrievalDiff.removed.length}
                      </p>
                    ) : null}
                    {searchRetrievalDiff.moved.length > 0 ? (
                      <ul className="kb-search-diff-moves">
                        {searchRetrievalDiff.moved.slice(0, 20).map((m) => (
                          <li key={m.id}>
                            {t('detail.searchDiffMoved', {
                              id: m.id.length > 24 ? `${m.id.slice(0, 20)}…` : m.id,
                              from: m.from + 1,
                              to: m.to + 1,
                            })}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
                <ul className="kb-search-results-list">
                  {searchResults.map((r) => (
                    <li key={r.id} className="kb-search-result-item">
                      <span className="kb-search-result-source">
                        [{r.source_type}]
                        {r.source_type === 'chunk' && r.wiki_page_id && r.wiki_space_id && (
                          <span className="kb-search-result-kind"> {t('detail.searchHitWiki')} </span>
                        )}{' '}
                        {r.wiki_page_id && r.wiki_space_id ? (
                          <Link to={`/wikis/${r.wiki_space_id}/pages/${r.wiki_page_id}`}>
                            {r.source_name || r.wiki_page_id}
                          </Link>
                        ) : r.document_id ? (
                          <Link to={`/documents/view/${r.document_id}`}>{r.source_name || r.document_id}</Link>
                        ) : (
                          <span>{r.source_name || r.document_id || t('detail.faqSourceFallback')}</span>
                        )}
                      </span>
                      <p className="kb-search-result-excerpt">{r.content.slice(0, 300)}</p>
                      <span className="kb-search-result-score">{t('detail.matchPercent', { pct: (r.score * 100).toFixed(0) })}</span>
                      <KbRetrievalProvenancePanel s={r} t={t} />
                      {r.source_type === 'chunk' ? (
                        <div className="kb-search-result-chunk-actions">
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkViewFromId(r.id)}>
                            {t('detail.chunkView')}
                          </button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void openChunkEditFromId(r.id)}>
                            {t('detail.chunkEdit')}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasSearched && searchResults.length === 0 && (
              <p className="kb-empty-text">{t('detail.noSearchResults')}</p>
            )}

            {!hasSearched && (
              <div className="kb-search-empty">
                <SearchIcon size={48} strokeWidth={1} />
                <p>{t('detail.searchEmptyPrompt')}</p>
              </div>
            )}
          </section>
        )}

        {/* ===== SETTINGS TAB ===== */}
        {activeTab === 'settings' && (
          <section className="kb-section">
            <h2 id="kb-settings-heading" className="kb-settings-page-title">
              {t('detail.settingsTitle')}
            </h2>

            <div className="kb-settings-subtabs" role="tablist" aria-label={t('detail.settingsTitle')}>
              {settingsSubTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={settingsSubTab === tab.id}
                  className={`kb-settings-subtab ${settingsSubTab === tab.id ? 'active' : ''}`}
                  onClick={() => setSettingsSubTab(tab.id)}
                >
                  <tab.icon size={16} aria-hidden />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="kb-settings-subtab-panel" role="tabpanel">
              {settingsSubTab === 'sharing' && kbId ? (
                <ResourceSharePanel
                  resourceType={RESOURCE_TYPES.knowledgeBase}
                  resourceId={kbId}
                  title={t('detail.sharingTitle')}
                />
              ) : null}

              {settingsSubTab === 'agent' && kb ? (
                <KbAgentSettings kb={kb} onSaved={loadKb} />
              ) : null}

              {settingsSubTab === 'general' ? (
                <>
            <div className="kb-settings-header-row">
              <p className="kb-settings-general-lead">{t('detail.settingsGeneralLead')}</p>
              <button
                type="button"
                className="btn btn-primary kb-settings-header-save"
                disabled={settingsSaving}
                onClick={handleSaveSettings}
              >
                {settingsSaving ? t('detail.savingSettings') : t('detail.saveSettings')}
              </button>
            </div>

            <div className="kb-settings-form">
              <div className="kb-settings-layout">
                <div className="kb-settings-col">
                  <label>
                    <span>{t('detail.embeddingModel')}</span>
                    <select value={settingsEmbeddingModelId} onChange={(e) => setSettingsEmbeddingModelId(e.target.value)} className="ds-control">
                      <option value="">{t('detail.modelNone')}</option>
                      {embeddingModels.map((m) => (
                        <option key={m.id} value={m.id}>{m.name} ({m.model_name})</option>
                      ))}
                    </select>
                    <small>{t('detail.embeddingHelp')}</small>
                  </label>

                  <fieldset className="kb-settings-fieldset">
                    <legend>{t('detail.chunkingFieldset')}</legend>
                    <label>
                      <span>{t('detail.strategy')}</span>
                      <select value={settingsChunkStrategy} onChange={(e) => setSettingsChunkStrategy(e.target.value)} className="ds-control">
                        <option value="fixed_size">{t('detail.strategyFixedSize')}</option>
                        <option value="markdown_header">{t('detail.strategyMarkdownHeader')}</option>
                        <option value="paragraph">{t('detail.strategyParagraph')}</option>
                      </select>
                    </label>
                    <label>
                      <span>{t('detail.chunkSize')}</span>
                      <input
                        type="number"
                        min={100}
                        max={10000}
                        value={settingsChunkSize}
                        onChange={(e) => setSettingsChunkSize(Number(e.target.value))}
                        className="ds-control"
                      />
                    </label>
                    <label>
                      <span>{t('detail.chunkOverlap')}</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={settingsChunkOverlap}
                        onChange={(e) => setSettingsChunkOverlap(Number(e.target.value))}
                        className="ds-control"
                      />
                    </label>
                  </fieldset>
                </div>

                <div className="kb-settings-col kb-settings-col-text">
                  <label>
                    <span>{t('detail.faqGenPrompt')}</span>
                    <textarea
                      className="ds-control"
                      placeholder={t('detail.faqGenPromptPlaceholder')}
                      value={settingsFaqPrompt}
                      onChange={(e) => setSettingsFaqPrompt(e.target.value)}
                      rows={6}
                    />
                    <small>{t('detail.faqGenPromptHelp')}</small>
                  </label>

                  <label>
                    <span>{t('detail.metadataKeys')}</span>
                    <input
                      type="text"
                      placeholder={t('detail.metadataKeysPlaceholder')}
                      value={settingsMetadataKeys}
                      onChange={(e) => setSettingsMetadataKeys(e.target.value)}
                      className="ds-control"
                    />
                    <small>{t('detail.metadataKeysHelp')}</small>
                  </label>
                </div>
              </div>

              <fieldset className="kb-settings-fieldset kb-settings-index-fieldset">
                <legend>{t('detail.indexJobTitle')}</legend>
                <div className="kb-settings-index-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={indexJobSubmitting || !kb?.embedding_model_id}
                    onClick={() => void enqueueIndexJob()}
                  >
                    {indexJobSubmitting ? (
                      <>
                        <Loader2 size={14} className="kb-spinner-inline" />
                        {t('detail.indexJobButtonRunning')}
                      </>
                    ) : (
                      t('detail.indexJobButton')
                    )}
                  </button>
                  <Link to="/job-runs" className="kb-settings-index-jobs-link">
                    {t('detail.indexJobViewJobs')}
                  </Link>
                </div>
                <small className="kb-settings-index-help">{t('detail.indexJobHelp')}</small>
                {!kb?.embedding_model_id ? (
                  <small className="kb-settings-index-warn">{t('detail.indexJobRequiresEmbedding')}</small>
                ) : null}
              </fieldset>
            </div>
                </>
              ) : null}
            </div>
          </section>
        )}
      </div>

      <KbGenerateFaqDialog
        show={showGenerateModal}
        genStep={genStep}
        onClose={closeGenerateModal}
        generating={generating}
        genSaving={genSaving}
        genProgress={genProgress}
        genModelId={genModelId}
        onGenModelIdChange={setGenModelId}
        llmModels={llmModels}
        genPrompt={genPrompt}
        onGenPromptChange={setGenPrompt}
        genDocs={genDocs}
        genSelectedDocs={genSelectedDocs}
        onGenSelectedDocsChange={setGenSelectedDocs}
        onToggleGenDoc={toggleGenDoc}
        genPreviewFaqs={genPreviewFaqs}
        onRemoveGenPreviewFaq={removeGenPreviewFaq}
        onGenerateFaqs={() => void handleGenerateFaqs()}
        onGenBackToConfig={handleGenBackToConfig}
        onSaveGeneratedFaqs={() => void handleSaveGeneratedFaqs()}
      />

      <KbDocPickerDialog
        show={showDocPicker}
        onClose={closeDocPicker}
        pickerAdding={pickerAdding}
        channels={channels}
        pickerSelectedChannel={pickerSelectedChannel}
        pickerChannelExpanded={pickerChannelExpanded}
        onPickerChannelSelect={handlePickerChannelSelect}
        onPickerChannelToggle={handlePickerChannelToggle}
        pickerSearch={pickerSearch}
        onPickerSearch={handlePickerSearch}
        pickerLoading={pickerLoading}
        pickerResults={pickerResults}
        alreadyAddedIds={alreadyAddedIds}
        pickerSelected={pickerSelected}
        onTogglePickerDoc={togglePickerDoc}
        pickerTotal={pickerTotal}
        pickerPage={pickerPage}
        pickerPageSize={pickerPageSize}
        onPickerPageChange={setPickerPage}
        pickerCanPrev={pickerCanPrev}
        pickerCanNext={pickerCanNext}
        pickerTotalPages={pickerTotalPages}
        onAddSelectedDocuments={() => void handleAddSelectedDocuments()}
      />

      <KbWikiSpacePickerDialog
        show={showWikiSpacePicker}
        onClose={closeWikiSpacePicker}
        wikiSpacePickerLoading={wikiSpacePickerLoading}
        wikiSpacePickerItems={wikiSpacePickerItems}
        kbWikiSpaces={kbWikiSpaces}
        wikiSpaceBusyId={wikiSpaceBusyId}
        onAddWikiSpaceToKb={(id) => void handleAddWikiSpaceToKb(id)}
      />

      <KbChunkDialog
        show={showChunkDialog}
        editChunk={editChunk}
        onClose={closeChunkDialog}
        chunkSaving={chunkSaving}
        chunkContent={chunkContent}
        onChunkContentChange={setChunkContent}
        chunkDialogReadOnly={chunkDialogReadOnly}
        metadataKeys={kb?.metadata_keys}
        chunkMetadataIsArray={chunkMetadataIsArray}
        chunkDocMetadataValues={chunkDocMetadataValues}
        onChunkDocMetadataValuesChange={setChunkDocMetadataValues}
        onSaveChunk={() => void handleSaveChunk()}
      />

      {faqDialog}
    </div>
    </ContentCommentsShell>
  );
}

