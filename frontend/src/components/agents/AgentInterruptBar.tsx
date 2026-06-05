import { useTranslation } from 'react-i18next';

interface Props {
  summary: string;
  onApprove: () => void;
  onReject: () => void;
}

export function AgentInterruptBar({ summary, onApprove, onReject }: Props) {
  const { t } = useTranslation('agents');
  return (
    <div className="agents-interrupt-bar">
      <span>{summary}</span>
      <button type="button" className="btn btn-sm btn-primary" onClick={onApprove}>
        {t('interrupt.approve')}
      </button>
      <button type="button" className="btn btn-sm" onClick={onReject}>
        {t('interrupt.reject')}
      </button>
    </div>
  );
}
