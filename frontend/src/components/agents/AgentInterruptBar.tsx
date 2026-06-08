import { useTranslation } from 'react-i18next';

interface Props {
  summary: string;
  busy?: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function formatInterruptSummary(raw: string): { text: string; count: number } {
  try {
    const j = JSON.parse(raw) as {
      action_requests?: Array<{ name?: string; description?: string }>;
    };
    const requests = j.action_requests ?? [];
    const lines = requests
      .map((r) => r.description?.trim() || (r.name ? `${r.name} needs approval` : ''))
      .filter(Boolean);
    if (lines.length) {
      const preview = lines.slice(0, 3).join(' · ');
      const extra = lines.length > 3 ? ` · +${lines.length - 3} more` : '';
      return { text: preview + extra, count: lines.length };
    }
  } catch {
    /* plain text */
  }
  return { text: raw, count: 1 };
}

export function AgentInterruptBar({ summary, busy = false, onApprove, onReject }: Props) {
  const { t } = useTranslation('agents');
  const { text, count } = formatInterruptSummary(summary);
  const approveLabel =
    count > 1 ? t('interrupt.approveMultiple', { count }) : t('interrupt.approve');
  return (
    <div className="agents-interrupt-bar">
      <span>{text}</span>
      <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={onApprove}>
        {approveLabel}
      </button>
      <button type="button" className="btn btn-sm" disabled={busy} onClick={onReject}>
        {t('interrupt.reject')}
      </button>
    </div>
  );
}
