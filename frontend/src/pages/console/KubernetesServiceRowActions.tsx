import { useTranslation } from 'react-i18next';
import { AppWindow, Eye, Trash2 } from 'lucide-react';
import { TableRowActionButton, TableRowActions } from '../../styles/design-system';

/** Row actions for a service — one file per set (the guardrail counts render sites per file). */
export function ServiceRowActions({
  onView,
  onRegisterApp,
  onDelete,
}: {
  onView: () => void;
  onRegisterApp: () => void;
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
        title={t('kubernetes.registerAppTitle')}
        aria-label={t('kubernetes.registerAppTitle')}
        icon={<AppWindow size={16} aria-hidden />}
        onClick={onRegisterApp}

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
