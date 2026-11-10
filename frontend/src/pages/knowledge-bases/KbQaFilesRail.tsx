import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FolderTree } from 'lucide-react';
import { KbQaFilesPanel } from './KbQaFilesPanel';
import { useFilesRailWidth } from '../../hooks/useFilesRailWidth';
import '../../styles/files-rail.scss';

const RAIL_MIN_PX = 200;
const RAIL_DEFAULT_PX = 400;
const RAIL_WIDTH_KEY = 'openkms_kb_qa_files_rail_width_px_v1';
const SESSIONS_PX = 240;
const CHAT_MIN_PX = 300;

/**
 * The conversation's files, docked exactly as the project agent docks its own: a rail on the right,
 * a resize handle, a chip in the chat's top-right when it is collapsed, and a collapse button in the
 * rail's head when it is open.
 *
 * The shell owns the open state because the phone toolbar opens the same rail; this owns the width,
 * which the project agent remembers the same way.
 */
export function KbQaFilesRail({
  kbId,
  sessionId,
  open,
  onOpen,
  onCollapse,
  isMobile,
  containerRef,
  suppressToggle,
}: {
  kbId: string;
  sessionId: string | null;
  open: boolean;
  onOpen: () => void;
  onCollapse: () => void;
  isMobile: boolean;
  /** The row the rail docks into — the chat, not the page, bounds the width. */
  containerRef: RefObject<HTMLElement | null>;
  /** The Sources drawer owns the chat's top-right corner while it is open; two chips there overlap. */
  suppressToggle: boolean;
}) {
  const { t } = useTranslation('knowledgeBase');
  const clampRailWidth = useCallback((w: number, containerWidth: number) => {
    const max = Math.max(RAIL_MIN_PX, containerWidth - SESSIONS_PX - CHAT_MIN_PX - 8);
    return Math.round(Math.min(max, Math.max(RAIL_MIN_PX, w)));
  }, []);
  const rail = useFilesRailWidth({
    storageKey: RAIL_WIDTH_KEY,
    defaultPx: RAIL_DEFAULT_PX,
    containerRef,
    clamp: clampRailWidth,
  });

  if (!open) {
    // Phone: the toolbar opens the rail, so there is no chip to show.
    if (isMobile || suppressToggle) return null;
    return (
      <button
        type="button"
        className="files-rail-toggle files-rail-chip"
        onClick={onOpen}
        aria-expanded={false}
        aria-controls="kb-qa-files-rail"
        title={t('detail.qaFiles')}
        aria-label={t('detail.qaFiles')}
      >
        <FolderTree size={14} aria-hidden />
        {t('detail.qaFiles')}
      </button>
    );
  }
  return (
    <>
      {!isMobile ? (
        <div
          className="files-rail-resize-handle"
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={rail.width}
          aria-valuemin={RAIL_MIN_PX}
          aria-valuemax={clampRailWidth(9999, rail.containerWidthPx)}
          aria-label={t('detail.qaFilesResize')}
          title={t('detail.qaFilesResizeHint')}
          onMouseDown={rail.onResizePointerDown}
        />
      ) : null}
      <aside
        id="kb-qa-files-rail"
        className="kb-qa-files-rail"
        style={isMobile ? undefined : { width: rail.width }}
        aria-label={t('detail.qaFiles')}
      >
        <KbQaFilesPanel kbId={kbId} sessionId={sessionId} onCollapse={onCollapse} />
      </aside>
    </>
  );
}
