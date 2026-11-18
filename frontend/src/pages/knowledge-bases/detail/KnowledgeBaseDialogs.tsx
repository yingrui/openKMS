import {
  KbChunkDialog,
  KbDocPickerDialog,
  KbFaqDialog,
  KbGenerateFaqDialog,
  KbWikiSpacePickerDialog,
} from '../KnowledgeBaseDetail.dialogs';
import { useKbDetail } from '../KnowledgeBaseDetailCtx';

/**
 * Every dialog a knowledge base can open, mounted once by the shell.
 *
 * They stay together because one of them is reachable from two sections (the chunk dialog opens from
 * Chunks *and* from a search result), so a dialog belongs to the base, not to a tab.
 */
export function KnowledgeBaseDialogs() {
  const d = useKbDetail();
  const { kb } = d;

  return (
    <>
      <KbGenerateFaqDialog
        show={d.showGenerateModal}
        genStep={d.genStep}
        onClose={d.closeGenerateModal}
        generating={d.generating}
        genSaving={d.genSaving}
        genProgress={d.genProgress}
        genModelId={d.genModelId}
        onGenModelIdChange={d.setGenModelId}
        llmModels={d.llmModels}
        genPrompt={d.genPrompt}
        onGenPromptChange={d.setGenPrompt}
        genDocs={d.genDocs}
        genSelectedDocs={d.genSelectedDocs}
        onGenSelectedDocsChange={d.setGenSelectedDocs}
        onToggleGenDoc={d.toggleGenDoc}
        genPreviewFaqs={d.genPreviewFaqs}
        onRemoveGenPreviewFaq={d.removeGenPreviewFaq}
        onGenerateFaqs={() => void d.handleGenerateFaqs()}
        onGenBackToConfig={d.handleGenBackToConfig}
        onSaveGeneratedFaqs={() => void d.handleSaveGeneratedFaqs()}
      />

      <KbDocPickerDialog
        show={d.showDocPicker}
        onClose={d.closeDocPicker}
        pickerAdding={d.pickerAdding}
        channels={d.channels}
        pickerSelectedChannel={d.pickerSelectedChannel}
        pickerChannelExpanded={d.pickerChannelExpanded}
        onPickerChannelSelect={d.handlePickerChannelSelect}
        onPickerChannelToggle={d.handlePickerChannelToggle}
        pickerSearch={d.pickerSearch}
        onPickerSearch={d.handlePickerSearch}
        pickerLoading={d.pickerLoading}
        pickerResults={d.pickerResults}
        alreadyAddedIds={d.alreadyAddedIds}
        pickerSelected={d.pickerSelected}
        onTogglePickerDoc={d.togglePickerDoc}
        pickerTotal={d.pickerTotal}
        pickerPage={d.pickerPage}
        pickerPageSize={d.pickerPageSize}
        onPickerPageChange={d.setPickerPage}
        pickerCanPrev={d.pickerCanPrev}
        pickerCanNext={d.pickerCanNext}
        pickerTotalPages={d.pickerTotalPages}
        onAddSelectedDocuments={() => void d.handleAddSelectedDocuments()}
      />

      <KbWikiSpacePickerDialog
        show={d.showWikiSpacePicker}
        onClose={d.closeWikiSpacePicker}
        wikiSpacePickerLoading={d.wikiSpacePickerLoading}
        wikiSpacePickerItems={d.wikiSpacePickerItems}
        kbWikiSpaces={d.kbWikiSpaces}
        wikiSpaceBusyId={d.wikiSpaceBusyId}
        onAddWikiSpaceToKb={(id) => void d.handleAddWikiSpaceToKb(id)}
      />

      <KbChunkDialog
        show={d.showChunkDialog}
        editChunk={d.editChunk}
        onClose={d.closeChunkDialog}
        chunkSaving={d.chunkSaving}
        chunkContent={d.chunkContent}
        onChunkContentChange={d.setChunkContent}
        chunkDialogReadOnly={d.chunkDialogReadOnly}
        metadataKeys={kb?.metadata_keys}
        chunkMetadataIsArray={d.chunkMetadataIsArray}
        chunkDocMetadataValues={d.chunkDocMetadataValues}
        onChunkDocMetadataValuesChange={d.setChunkDocMetadataValues}
        onSaveChunk={() => void d.handleSaveChunk()}
      />

      <KbFaqDialog
        show={d.showFaqDialog}
        editFaq={d.editFaq}
        faqDialogSource={d.faqDialogSource}
        faqPolishing={d.faqPolishing}
        onClose={d.closeFaqDialog}
        faqQuestion={d.faqQuestion}
        onFaqQuestionChange={d.setFaqQuestion}
        faqAnswer={d.faqAnswer}
        onFaqAnswerChange={d.setFaqAnswer}
        onPolishFaqAnswer={() => void d.handlePolishFaqAnswer()}
        metadataKeys={kb?.metadata_keys}
        faqMetadataIsArray={d.faqMetadataIsArray}
        faqDocMetadataValues={d.faqDocMetadataValues}
        onFaqDocMetadataValuesChange={d.setFaqDocMetadataValues}
        onSaveFaq={d.handleSaveFaq}
      />
    </>
  );
}
