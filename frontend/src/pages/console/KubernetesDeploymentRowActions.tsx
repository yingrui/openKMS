import { useTranslation } from 'react-i18next';
import { Eye, Settings2, Trash2 } from 'lucide-react';
import { TableRowActionButton, TableRowActions } from '../../styles/design-system';

/** Row actions for a deployment — one file per set (the guardrail counts render sites per file). */
export function DeploymentRowActions({
  onView,
  onEnv,
  onDelete,
}: {
  onView: () => void;
  onEnv: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('console');
  return (
    <TableRowActions>
      <TableRowActionButton
        title={t('kubernetes.viewTitle')}
        aria-label={t('kubernetes.viewTitle')}
        icon={<Eye size={16} aria-hidden />}
        onClick={onView}

      />
      <TableRowActionButton
        title={t('kubernetes.envTitle')}
        aria-label={t('kubernetes.envTitle')}
        icon={<Settings2 size={16} aria-hidden />}
        onClick={onEnv}

      />
      <TableRowActionButton
        title={t('kubernetes.deleteTitle')}
        aria-label={t('kubernetes.deleteTitle')}
        icon={<Trash2 size={16} aria-hidden />}
        onClick={onDelete}
        variant="danger"
      />
    </TableRowActions>
  );
}
