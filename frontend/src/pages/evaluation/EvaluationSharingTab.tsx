import { useTranslation } from 'react-i18next';
import { ResourceSharePanel } from '../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../data/resourceAclApi';
import { EntityViewHeader, EntityViewLoading, EntityViewPanel } from '../shared/EntityViewShell';
import { useEvaluationDetail } from './EvaluationDetailContext';

/** Who can see and run this test set — a page of its own, because a grant list grows. */
export function EvaluationSharingTab() {
  const { t } = useTranslation('workspace');
  const { evaluationId } = useEvaluationDetail();

  if (!evaluationId) return <EntityViewLoading label={t('shared.loading')} />;

  return (
    <>
      <EntityViewHeader
        title={t('evaluationSettings.sharing')}
        subtitle={t('evaluationSettings.sharingHint')}
      />
      <EntityViewPanel>
        <ResourceSharePanel
          resourceType={RESOURCE_TYPES.evaluation}
          resourceId={evaluationId}
          title={t('evaluationSettings.sharing')}
        />
      </EntityViewPanel>
    </>
  );
}
