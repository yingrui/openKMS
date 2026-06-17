import { Star } from 'lucide-react';
import './ContentCommentsRail.scss';

const STAR_COUNT = 5;

type Props = {
  value: number | null;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: number;
  label?: string;
};

export function CommentRankStars({ value, onChange, readonly = false, size = 14, label }: Props) {
  const interactive = !readonly && onChange != null;
  const rank = value ?? 0;
  const ariaLabel =
    label ?? (rank > 0 ? `${rank} of ${STAR_COUNT} stars` : `0 of ${STAR_COUNT} stars`);

  return (
    <div
      className={`comment-rank-stars${interactive ? ' comment-rank-stars--interactive' : ''}`}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={ariaLabel}
    >
      {Array.from({ length: STAR_COUNT }, (_, idx) => {
        const starIndex = idx + 1;
        const filled = rank > 0 && starIndex <= rank;
        return (
          <button
            key={starIndex}
            type="button"
            className={`comment-rank-stars__star${filled ? ' comment-rank-stars__star--on' : ''}`}
            disabled={!interactive}
            aria-checked={interactive ? rank === starIndex : undefined}
            role={interactive ? 'radio' : undefined}
            title={String(starIndex)}
            onClick={() => {
              if (!onChange) return;
              onChange(rank === starIndex ? 0 : starIndex);
            }}
          >
            <Star size={size} fill={filled ? 'currentColor' : 'none'} aria-hidden />
            <span className="visually-hidden">{starIndex}</span>
          </button>
        );
      })}
    </div>
  );
}
