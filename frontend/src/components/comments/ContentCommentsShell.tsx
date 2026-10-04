import type { ReactNode, CSSProperties } from 'react';
import { useCallback } from 'react';
import type { CommentResourceType } from '../../data/commentsApi';
import { ContentCommentsRail } from './ContentCommentsRail';
import { ContentCommentsUtilityRail, type UtilityRailButton } from './ContentCommentsUtilityRail';
import { useCommentsRailState } from './useCommentsRailState';
import { useContentComments } from './useContentComments';
import './ContentCommentsRail.scss';

type Props = {
  resourceType: CommentResourceType;
  resourceId: string;
  enabled?: boolean;
  children: ReactNode;
  className?: string;
  /** Hide utility rail (e.g. Q&A fullpage). */
  hideComments?: boolean;
  extraUtilityButtons?: UtilityRailButton[];
};

export function ContentCommentsShell({
  resourceType,
  resourceId,
  enabled = true,
  children,
  className,
  hideComments = false,
  extraUtilityButtons = [],
}: Props) {
  const storagePrefix = `${resourceType}_${resourceId}`;
  const rail = useCommentsRailState(storagePrefix);
  const comments = useContentComments(resourceType, resourceId, enabled && !hideComments);

  const toggleComments = useCallback(() => {
    rail.setOpenPersist(!rail.open);
  }, [rail]);

  const collapseComments = useCallback(() => {
    rail.setOpenPersist(false);
  }, [rail]);

  const shellClass = [
    'content-comments-shell',
    'content-comments-shell--has-utility',
    rail.open ? 'content-comments-shell--comments-open' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const shellStyle = {
    '--comments-utility-w': '40px',
    '--comments-rail-w': rail.open ? `${rail.widthPx}px` : '0px',
  } as CSSProperties;

  return (
    <div className={shellClass} style={shellStyle}>
      <div className="content-comments-shell__main">{children}</div>
      {!hideComments && enabled && resourceId ? (
        <>
          {rail.open ? (
            <div
              className="content-comments-shell__backdrop"
              role="presentation"
              onClick={collapseComments}
              aria-hidden
            />
          ) : null}
          <ContentCommentsRail
            open={rail.open}
            widthPx={rail.widthPx}
            onWidthChange={rail.setWidthPersist}
            onRequestCollapse={collapseComments}
            comments={comments}
          />
          <ContentCommentsUtilityRail
            commentsActive={rail.open}
            onCommentsToggle={toggleComments}
            extraButtons={extraUtilityButtons}
          />
        </>
      ) : null}
    </div>
  );
}
