import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentCommentsPanel } from './ContentCommentsPanel';
import { clampCommentsRailWidth } from './useCommentsRailState';
import type { useContentComments } from './useContentComments';
import './ContentCommentsRail.scss';

type CommentsApi = ReturnType<typeof useContentComments>;

type Props = {
  open: boolean;
  widthPx: number;
  onWidthChange: (w: number) => void;
  onRequestCollapse: () => void;
  comments: CommentsApi;
};

export function ContentCommentsRail({ open, widthPx, onWidthChange, onRequestCollapse, comments }: Props) {
  const { t } = useTranslation('comments');

  const onResizePointerDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = widthPx;
      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        onWidthChange(clampCommentsRailWidth(startW + delta));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [onWidthChange, widthPx],
  );

  if (!open) return null;

  return (
    <div className="content-comments-rail" style={{ width: widthPx, ['--comments-rail-w' as string]: `${widthPx}px` }}>
      <div
        className="content-comments-rail__resize"
        role="separator"
        aria-orientation="vertical"
        aria-valuenow={widthPx}
        aria-label={t('resize')}
        onMouseDown={onResizePointerDown}
      />
      <div className="content-comments-rail__inner">
        <ContentCommentsPanel onRequestCollapse={onRequestCollapse} comments={comments} />
      </div>
    </div>
  );
}
