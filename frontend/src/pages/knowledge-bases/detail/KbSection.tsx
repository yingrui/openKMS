import { useKbDetail } from '../KnowledgeBaseDetailCtx';
import { DocumentsTab } from './tabs/DocumentsTab';
import { WikiSpacesTab } from './tabs/WikiSpacesTab';
import { FaqsTab } from './tabs/FaqsTab';
import { ChunksTab } from './tabs/ChunksTab';
import { SearchTab } from './tabs/SearchTab';
import { SettingsTab } from './tabs/SettingsTab';
import { KbSharingSection } from './KbSharingSection';

/**
 * The section the URL names, out of the shell's state.
 *
 * One component for the seven routes (`/knowledge-bases/:id`, `/faqs`, `/chunks`, …) because the tabs are
 * already separate modules and the wiring between them and the detail state is the same shape each time —
 * they ship in one chunk, as they did when a `?tab=` query string chose between them.
 */
export function KbSection() {
  const d = useKbDetail();

  switch (d.activeTab) {
    case 'wiki_spaces':
      return (
        <WikiSpacesTab
          t={d.t}
          spaces={d.kbWikiSpaces}
          hasEmbeddingModel={Boolean(d.kb?.embedding_model_id)}
          busyId={d.wikiSpaceBusyId}
          onAdd={() => void d.openWikiSpacePicker()}
          onIndex={(id) => void d.handleIndexWikiSpace(id)}
          onRemove={(id) => void d.handleRemoveWikiSpaceFromKb(id)}
        />
      );
    case 'faqs':
      return (
        <FaqsTab
          t={d.t}
          faqs={d.faqs}
          total={d.faqTotal}
          page={d.faqPage}
          pageSize={d.faqPageSize}
          onPageChange={d.setFaqPage}
          onPageSizeChange={d.setFaqPageSize}
          onGenerate={() => void d.openGenerateModal()}
          onAdd={d.openAddFaq}
          onEdit={(faq) => void d.openEditFaq(faq)}
          onDelete={(id) => void d.handleDeleteFaq(id)}
        />
      );
    case 'chunks':
      return (
        <ChunksTab
          t={d.t}
          chunks={d.chunks}
          total={d.chunkTotal}
          page={d.chunkPage}
          pageSize={d.chunkPageSize}
          onPageChange={d.setChunkPage}
          onPageSizeChange={d.setChunkPageSize}
          onEdit={d.openChunkEdit}
        />
      );
    case 'search':
      return (
        <SearchTab
          t={d.t}
          query={d.searchQuery}
          onQueryChange={d.setSearchQuery}
          searchType={d.searchType}
          onSearchTypeChange={d.setSearchType}
          onSubmit={d.handleSearch}
          searching={d.searching}
          results={d.searchResults}
          hasSearched={d.hasSearched}
          optionsOpen={d.searchOptionsExpanded}
          onToggleOptions={() => d.setSearchOptionsExpanded((o) => !o)}
          activeFilterCount={
            [
              Object.values(d.searchLabelFilters).some(Boolean),
              Object.values(d.searchMetadataFilters).some(Boolean),
              d.searchForceDense,
              d.searchTopK !== 10,
            ].filter(Boolean).length
          }
          topK={d.searchTopK}
          onTopKChange={d.setSearchTopK}
          forceDense={d.searchForceDense}
          onForceDenseChange={d.setSearchForceDense}
          metadataKeys={d.kb?.metadata_keys}
          metadataFilters={d.searchMetadataFilters}
          onMetadataFilterChange={(key, value) =>
            d.setSearchMetadataFilters((prev) => ({ ...prev, [key]: value }))
          }
          retrievalDiff={d.searchRetrievalDiff}
          onChunkView={(id) => void d.openChunkViewFromId(id)}
          onChunkEdit={(id) => void d.openChunkEditFromId(id)}
        />
      );
    case 'settings':
      return d.kb ? (
        <SettingsTab
          t={d.t}
          kb={d.kb}
          embeddingModels={d.embeddingModels}
          embeddingModelId={d.settingsEmbeddingModelId}
          onEmbeddingModelIdChange={d.setSettingsEmbeddingModelId}
          chunkStrategy={d.settingsChunkStrategy}
          onChunkStrategyChange={d.setSettingsChunkStrategy}
          chunkSize={d.settingsChunkSize}
          onChunkSizeChange={d.setSettingsChunkSize}
          chunkOverlap={d.settingsChunkOverlap}
          onChunkOverlapChange={d.setSettingsChunkOverlap}
          faqPrompt={d.settingsFaqPrompt}
          onFaqPromptChange={d.setSettingsFaqPrompt}
          metadataKeys={d.settingsMetadataKeys}
          onMetadataKeysChange={d.setSettingsMetadataKeys}
          retrievalTopK={d.retrievalTopK}
          onRetrievalTopKChange={d.setRetrievalTopK}
          retrievalRerank={d.retrievalRerank}
          onRetrievalRerankChange={d.setRetrievalRerank}
          saving={d.settingsSaving}
          onSave={() => void d.handleSaveSettings()}
          indexJobSubmitting={d.indexJobSubmitting}
          onEnqueueIndex={() => void d.enqueueIndexJob()}
        />
      ) : null;
    case 'sharing':
      return <KbSharingSection />;
    case 'documents':
    default:
      return (
        <DocumentsTab
          t={d.t}
          docs={d.docs}
          docTotal={d.docTotal}
          docPage={d.docPage}
          docPageSize={d.docPageSize}
          onPageChange={d.setDocPage}
          onPageSizeChange={d.setDocPageSize}
          onAdd={d.openDocPicker}
          onRemove={d.handleRemoveDocument}
        />
      );
  }
}
