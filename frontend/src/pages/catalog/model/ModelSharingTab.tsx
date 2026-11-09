import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ResourceSharePanel } from '../../../components/ResourceSharePanel';
import { RESOURCE_TYPES } from '../../../data/resourceAclApi';
import { EntityViewHeader, EntityViewPanel } from '../../shared/EntityViewShell';

/**
 * Model → Settings → Sharing.
 *
 * A semantic model is a definition — which datasets, metrics, fields and relationships a caller
 * can see — so it is shared with the same mechanics as a dataset or a knowledge base rather than
 * being governed by an operation key alone. This is the **model** gate; a data resource under it
 * is a separate, row-scoped grant.
 */
export function ModelSharingTab() {
  const { t } = useTranslation('ontology');
  const { modelId = '' } = useParams();

  return (
    <>
      <EntityViewHeader
        title={t('dataModel.modelSharing')}
        subtitle={t('dataModel.modelSharingHint')}
      />
      <EntityViewPanel>
        {modelId ? (
          <ResourceSharePanel
            resourceType={RESOURCE_TYPES.semanticModel}
            resourceId={modelId}
            title={t('dataModel.modelSharing')}
          />
        ) : null}
      </EntityViewPanel>
    </>
  );
}
