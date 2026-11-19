import { useTranslation } from 'react-i18next';
import { ResourceSharePanel } from '../../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../../data/resourceAclApi';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';
import { useKbDetail } from '../KnowledgeBaseDetailCtx';

/**
 * `/knowledge-bases/:id/sharing` — who may read this base.
 *
 * The same panel (and the same resource type) the dataset and semantic-model pages use; it is a section of
 * its own rather than a sub-tab of Settings, because it answers a different question from what the base *is*.
 */
export function KbSharingSection() {
  const { t } = useTranslation('knowledgeBase');
  const { kb } = useKbDetail();
  if (!kb) return null;

  return (
    <>
      <EntityViewHeader
        title={t('detail.sharingTitle')}
        subtitle={t('detail.sharingSubtitle')}
      />
      <EntityViewPanel>
        <ResourceSharePanel
          resourceType={RESOURCE_TYPES.knowledgeBase}
          resourceId={kb.id}
          title={t('detail.sharingTitle')}
        />
      </EntityViewPanel>
    </>
  );
}
