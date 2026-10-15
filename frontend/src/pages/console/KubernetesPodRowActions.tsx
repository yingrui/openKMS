import { useTranslation } from 'react-i18next';
import { Eye, FileText, Trash2 } from 'lucide-react';
import { TableRowActionButton, TableRowActions } from '../../styles/design-system';

/** Row actions for a pod — one file per set (the guardrail counts render sites per file). */
export function PodRowActions({
  onView,
  onLogs,
  onDelete,
}: {
  onView: () => void;
  onLogs: () => void;
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
        title={t('kubernetes.logsTitle')}
        aria-label={t('kubernetes.logsTitle')}
        icon={<FileText size={16} aria-hidden />}
        onClick={onLogs}

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
