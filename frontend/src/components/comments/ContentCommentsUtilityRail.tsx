import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, MessageSquare } from 'lucide-react';
import './ContentCommentsRail.scss';

export type UtilityRailButton = {
  id: string;
  icon: ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
};

type Props = {
  commentsActive: boolean;
  onCommentsToggle: () => void;
  extraButtons?: UtilityRailButton[];
};

export function ContentCommentsUtilityRail({ commentsActive, onCommentsToggle, extraButtons = [] }: Props) {
  const { t } = useTranslation('comments');

  return (
    <aside className="content-comments-utility-rail" aria-label={t('toggleComments')}>
      {extraButtons.map((btn) => (
        <button
          key={btn.id}
          type="button"
          className={`content-comments-utility-rail__btn${btn.active ? ' content-comments-utility-rail__btn--active' : ''}`}
          onClick={btn.onClick}
          title={btn.label}
          aria-label={btn.label}
          aria-pressed={btn.active}
        >
          {btn.icon}
        </button>
      ))}
      <button
        type="button"
        className={`content-comments-utility-rail__btn${commentsActive ? ' content-comments-utility-rail__btn--active' : ''}`}
        onClick={onCommentsToggle}
        title={t('toggleComments')}
        aria-label={t('toggleComments')}
        aria-pressed={commentsActive}
      >
        <MessageSquare size={18} strokeWidth={1.75} aria-hidden />
      </button>
    </aside>
  );
}

export function copilotUtilityButton(active: boolean, onClick: () => void, label: string): UtilityRailButton {
  return {
    id: 'copilot',
    icon: <Bot size={18} strokeWidth={1.75} aria-hidden />,
    label,
    active,
    onClick,
  };
}
