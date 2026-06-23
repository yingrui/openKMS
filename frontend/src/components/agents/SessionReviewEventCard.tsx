import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { LessonEvent } from '../../data/sessionReviewApi';
import './SessionReview.scss';

type EventStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  event: LessonEvent;
  status: EventStatus;
  onApprove: (event: LessonEvent, status: EventStatus) => void;
  onEdit: (oldEvent: LessonEvent, updated: LessonEvent, status: EventStatus) => void;
  onReject: () => void;
}

const SEVERITY_ICON: Record<string, string> = {
  high: '🔴',
  medium: '🟡',
  low: '⚪',
};

const TYPE_LABEL: Record<string, string> = {
  error: 'Error',
  lesson: 'Lesson',
  pattern: 'Pattern',
};

export function SessionReviewEventCard({
  event,
  status,
  onApprove,
  onEdit,
  onReject,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editWww, setEditWww] = useState(event.what_went_wrong);
  const [editWfi, setEditWfi] = useState(event.what_fixed_it ?? '');
  const [editSeverity, setEditSeverity] = useState(event.severity);
  const [editType, setEditType] = useState(event.type);

  const handleSave = () => {
    const updated: LessonEvent = {
      ...event,
      what_went_wrong: editWww.trim(),
      what_fixed_it: editWfi.trim() || null,
      severity: editSeverity,
      type: editType,
    };
    onEdit(event, updated, status);
    setEditing(false);
  };

  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';

  return (
    <div className={`sreview-card sreview-card--${status}`}>
      <div className="sreview-card-header">
        <span className="sreview-card-badge">
          {SEVERITY_ICON[event.severity] ?? '⚪'} {TYPE_LABEL[event.type] ?? event.type} · {event.severity}
        </span>
        {isApproved && <span className="sreview-card-status sreview-card-status--approved">✓ Approved</span>}
        {isRejected && <span className="sreview-card-status sreview-card-status--rejected">✗ Rejected</span>}
      </div>

      {editing ? (
        <div className="sreview-card-edit">
          <label className="sreview-card-field">
            Type
            <select value={editType} onChange={(e) => setEditType(e.target.value as LessonEvent['type'])}>
              <option value="error">Error</option>
              <option value="lesson">Lesson</option>
              <option value="pattern">Pattern</option>
            </select>
          </label>
          <label className="sreview-card-field">
            Severity
            <select value={editSeverity} onChange={(e) => setEditSeverity(e.target.value as LessonEvent['severity'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <label className="sreview-card-field">
            What went wrong
            <textarea
              value={editWww}
              onChange={(e) => setEditWww(e.target.value)}
              rows={3}
            />
          </label>
          <label className="sreview-card-field">
            What fixed it
            <textarea
              value={editWfi}
              onChange={(e) => setEditWfi(e.target.value)}
              rows={2}
            />
          </label>
          <div className="sreview-card-edit-actions">
            <button type="button" className="sreview-btn sreview-btn--save" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="sreview-btn sreview-btn--cancel" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="sreview-card-body">
            <div className="sreview-card-field-read">
              <span className="sreview-card-label">Problem</span>
              <p>{event.what_went_wrong}</p>
            </div>
            {event.what_fixed_it ? (
              <div className="sreview-card-field-read">
                <span className="sreview-card-label">Fix</span>
                <p>{event.what_fixed_it}</p>
              </div>
            ) : null}
            <div className="sreview-card-field-read">
              <span className="sreview-card-label">Context</span>
              <blockquote className="sreview-card-quote">{event.context}</blockquote>
            </div>
          </div>

          <div className="sreview-card-actions">
            {!isRejected ? (
              <>
                <button
                  type="button"
                  className="sreview-btn sreview-btn--approve"
                  disabled={isApproved}
                  onClick={() => onApprove(event, 'approved')}
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  className="sreview-btn sreview-btn--edit"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={14} /> Edit
                </button>
              </>
            ) : null}
            {!isApproved ? (
              <button
                type="button"
                className="sreview-btn sreview-btn--reject"
                disabled={isRejected}
                onClick={onReject}
              >
                <X size={14} /> Reject
              </button>
            ) : (
              <button
                type="button"
                className="sreview-btn sreview-btn--edit"
                onClick={() => {
                  onApprove(event, 'pending');
                }}
              >
                Un-approve
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
