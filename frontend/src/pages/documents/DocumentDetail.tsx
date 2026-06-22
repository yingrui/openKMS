import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { DocumentDetailSplitPanel } from './DocumentDetail.splitPanel';
import { DocumentDetailInfoPanel } from './DocumentDetail.infoPanel';
import { DocumentDetailVersionModals } from './DocumentDetail.modals';
import { DocumentDetailLoading } from './DocumentDetail.loading';
import { useDocumentDetail } from './useDocumentDetail';
import { ContentCommentsShell } from '../../components/comments/ContentCommentsShell';
import './DocumentDetail.scss';

export function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const v = useDocumentDetail(id);

  return (
    <ContentCommentsShell resourceType="document" resourceId={id ?? ''} enabled={Boolean(id)}>
    <div className="document-detail">
      <Link
        to={v.document?.channel_id ? `/documents/channels/${v.document.channel_id}` : '/documents'}
        className="document-detail-back"
      >
        <ArrowLeft size={18} />
        <span>{v.t('common.backToDocuments')}</span>
      </Link>
      {v.loading ? (
        <DocumentDetailLoading />
      ) : (
        <>
          {v.document && !v.extendedPanel && (
            <DocumentDetailInfoPanel
              document={v.document}
              docConfig={v.docConfig}
              infoVisible={v.infoVisible}
              showMetadataSection={v.showMetadataSection}
              infoEditMode={v.infoEditMode}
              editName={v.editName}
              savingInfo={v.savingInfo}
              fileHash={v.fileHash}
              markdown={v.markdown}
              processing={v.processing}
              processBlockedByMissingPipeline={v.processBlockedByMissingPipeline}
              forceFullReparse={v.forceFullReparse}
              resetting={v.resetting}
              exporting={v.exporting}
              importing={v.importing}
              importProgress={v.importProgress}
              versionSnapshotLoading={v.versionSnapshotLoading}
              latestVersionSnapshot={v.latestVersionSnapshot}
              showSaveVersionButton={v.showSaveVersionButton}
              metaKeys={v.metaKeys}
              extractionSchemaFields={v.extractionSchemaFields}
              labelConfig={v.labelConfig}
              metadataEditMode={v.metadataEditMode}
              editMeta={v.editMeta}
              savingMetadata={v.savingMetadata}
              extractWarnings={v.extractWarnings}
              extracting={v.extracting}
              hasExtractionModel={v.hasExtractionModel}
              meta={v.meta}
              labelKeysSet={v.labelKeysSet}
              labelInstances={v.labelInstances}
              lineageSectionOpen={v.lineageSectionOpen}
              lineageLoading={v.lineageLoading}
              lineageRels={v.lineageRels}
              lifecycleEdit={v.lifecycleEdit}
              editSeriesId={v.editSeriesId}
              editLifecycleStatus={v.editLifecycleStatus}
              editEffectiveFrom={v.editEffectiveFrom}
              editEffectiveTo={v.editEffectiveTo}
              lifecycleSaving={v.lifecycleSaving}
              newRelTarget={v.newRelTarget}
              newRelType={v.newRelType}
              newRelNote={v.newRelNote}
              relSaving={v.relSaving}
              onToggleInfo={() => v.setInfoVisible((x) => !x)}
              onEditNameChange={v.setEditName}
              onSaveInfo={v.handleSaveInfo}
              onCancelInfoEdit={v.handleCancelInfoEdit}
              onEnterInfoEdit={v.handleEnterInfoEdit}
              onProcess={v.handleProcess}
              onForceFullReparseChange={v.setForceFullReparse}
              onReset={v.handleReset}
              onExport={v.handleExport}
              onImport={v.handleImport}
              onOpenVersionsModal={v.handleOpenVersionsModal}
              onOpenSaveVersion={v.openSaveVersionModal}
              onEnterMetadataEdit={v.handleEnterMetadataEdit}
              onSetEditMetaField={v.setEditMetaField}
              onSaveMetadata={v.handleSaveMetadata}
              onCancelMetadataEdit={v.handleCancelMetadataEdit}
              onExtract={v.handleExtract}
              getInstanceDisplay={v.getInstanceDisplay}
              onToggleLineageSection={() => v.setLineageSectionOpen((o) => !o)}
              onSetLifecycleEdit={v.setLifecycleEdit}
              onSaveLifecycle={() => void v.handleSaveLifecycle()}
              onSetEditLifecycleStatus={v.setEditLifecycleStatus}
              onSetEditSeriesId={v.setEditSeriesId}
              onSetEditEffectiveFrom={v.setEditEffectiveFrom}
              onSetEditEffectiveTo={v.setEditEffectiveTo}
              onSetNewRelType={v.setNewRelType}
              onSetNewRelTarget={v.setNewRelTarget}
              onSetNewRelNote={v.setNewRelNote}
              onAddRelationship={() => void v.handleAddRelationship()}
              onDeleteRelationship={(relationshipId) => void v.handleDeleteRelationship(relationshipId)}
            />
          )}
          {v.error ? (
            <div className="document-detail-error">{v.error}</div>
          ) : (
            <>
              <DocumentDetailSplitPanel
                extendedPanel={v.extendedPanel}
                isSpreadsheetLayout={v.isSpreadsheetLayout}
                isMindmapLayout={v.isMindmapLayout}
                isStructuredNonVlmLayout={v.isStructuredNonVlmLayout}
                parsingResult={v.parsingResult}
                spreadsheetSheets={v.spreadsheetSheets}
                spreadsheetSheetIndex={v.spreadsheetSheetIndex}
                onSpreadsheetSheetIndex={v.setSpreadsheetSheetIndex}
                activeSpreadsheetSheet={v.activeSpreadsheetSheet}
                mindmapSheets={v.mindmapSheets}
                mindmapAttachments={v.mindmapAttachments}
                deferLargeDocImages={v.deferLargeDocImages}
                pageImageItems={v.pageImageItems}
                pageBlocks={v.pageBlocks}
                pageDimensions={v.pageDimensions}
                hoveredBlockKey={v.hoveredBlockKey}
                selectedBlock={v.selectedBlock}
                onHoveredBlockKey={v.setHoveredBlockKey}
                onSelectedBlock={v.setSelectedBlock}
                onPageMouseMove={v.handlePageMouseMove}
                onPageImageLoad={v.onPageImageLoad}
                getImageUrl={v.getImageUrl}
                folderId={v.folderId}
                onLoadDeferredImages={v.handleLoadDeferredImages}
                onToggleImagesPanel={v.handleToggleImagesPanel}
                rightPanelView={v.rightPanelView}
                onRightPanelView={v.setRightPanelView}
                markdownEditMode={v.markdownEditMode}
                onMarkdownEditMode={v.setMarkdownEditMode}
                markdown={v.markdown}
                onMarkdownChange={v.setMarkdown}
                document={v.document}
                docConfig={v.docConfig}
                showPrintButton={v.showPrintButton}
                saving={v.saving}
                onSaveMarkdown={v.handleSaveMarkdown}
                onCancelMarkdownEdit={v.cancelMarkdownEdit}
                onEnterMarkdownEdit={v.enterMarkdownEdit}
                onRebuildPageIndex={v.handleRebuildPageIndex}
                pageIndexRebuilding={v.pageIndexRebuilding}
                pageIndex={v.pageIndex}
                pageIndexLoading={v.pageIndexLoading}
                pageIndexError={v.pageIndexError}
                markdownComponents={v.markdownComponents}
                restoring={v.restoring}
                fileHash={v.fileHash}
                onRestoreMarkdown={v.handleRestoreMarkdown}
                markdownBaseUrl={v.markdownBaseUrl}
                onToggleMarkdownExtend={v.toggleMarkdownExtend}
              />
              {!v.docConfig && v.id && (
                <DocumentDetailVersionModals
                  saveVersionModalOpen={v.saveVersionModalOpen}
                  saveVersionTag={v.saveVersionTag}
                  saveVersionSubmitting={v.saveVersionSubmitting}
                  onSaveVersionTagChange={v.setSaveVersionTag}
                  onCloseSaveVersion={() => v.setSaveVersionModalOpen(false)}
                  onCreateVersion={v.handleCreateVersion}
                  versionsModalOpen={v.versionsModalOpen}
                  versionsLoading={v.versionsLoading}
                  versionsItems={v.versionsItems}
                  restoreSubmitting={v.restoreSubmitting}
                  onCloseVersions={() => v.setVersionsModalOpen(false)}
                  onPreviewVersion={v.handlePreviewVersion}
                  onOpenRestore={v.setRestoreModalVersion}
                  versionPreview={v.versionPreview}
                  versionPreviewLoading={v.versionPreviewLoading}
                  onCloseVersionPreview={() => v.setVersionPreview(null)}
                  markdownComponents={v.markdownComponents}
                  restoreModalVersion={v.restoreModalVersion}
                  restoreSaveCurrent={v.restoreSaveCurrent}
                  restoreLabel={v.restoreLabel}
                  restoreNote={v.restoreNote}
                  onCloseRestore={() => v.setRestoreModalVersion(null)}
                  onRestoreSaveCurrentChange={v.setRestoreSaveCurrent}
                  onRestoreLabelChange={v.setRestoreLabel}
                  onRestoreNoteChange={v.setRestoreNote}
                  onConfirmRestore={v.handleConfirmRestore}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
    </ContentCommentsShell>
  );
}
