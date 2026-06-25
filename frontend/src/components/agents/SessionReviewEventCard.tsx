import { useState } from 'react';
import { Check, Pencil, Wand, X } from 'lucide-react';
import { toast } from 'sonner';
import type { LessonEvent } from '../../data/sessionReviewApi';
import { generateSkill, saveArtifact } from '../../data/sessionReviewApi';
import './SessionReview.scss';

type EventStatus = 'pending' | 'approved' | 'rejected';

interface Props {
  event: LessonEvent;
  status: EventStatus;
  onApprove: (event: LessonEvent, status: EventStatus) => void;
  onEdit: (oldEvent: LessonEvent, updated: LessonEvent, status: EventStatus) => void;
  onReject: () => void;
  projectId: string;
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
  skill_candidate: 'Skill Candidate',
};

export function SessionReviewEventCard({
  event,
  status,
  onApprove,
  onEdit,
  onReject,
  projectId,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editWww, setEditWww] = useState(event.what_went_wrong);
  const [editWfi, setEditWfi] = useState(event.what_fixed_it ?? '');
  const [editSeverity, setEditSeverity] = useState(event.severity);
  const [editType, setEditType] = useState(event.type);

  // Skill generation modal
  const [skillModal, setSkillModal] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [skillSlug, setSkillSlug] = useState('');
  const [skillContent, setSkillContent] = useState('');

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

  const handleGenerateSkill = async () => {
    setGenerating(true);
    try {
      const content = await generateSkill(projectId, event);
      setSkillContent(content);
      const slug = event.what_went_wrong
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      setSkillSlug(slug);
      setSkillModal(true);
    } catch (e) {
      toast.error(`Generate failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveSkill = async () => {
    if (!skillSlug.trim() || !skillContent.trim()) return;
    setSaving(true);
    try {
      await saveArtifact(projectId, `.openkms/skills/${skillSlug}/SKILL.md`, skillContent);
      toast.success(`Skill "${skillSlug}" saved`);
      setSkillModal(false);
    } catch (e) {
      toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isSkillCandidate = event.type === 'skill_candidate';

  return (
    <>
      <div className={`sreview-card sreview-card--${status}`}>
        <div className="sreview-card-header">
          <span className="sreview-card-badge">
            {SEVERITY_ICON[event.severity] ?? '⚪'} {TYPE_LABEL[event.type] ?? event.type} · {event.severity}
          </span>
          {event.occurrence_count && event.occurrence_count > 1 ? (
            <span className="sreview-card-occurrence" title={`Occurred in ${event.occurrence_count} sessions`}>
              ×{event.occurrence_count}
            </span>
          ) : null}
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
                <option value="skill_candidate">Skill Candidate</option>
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
              <textarea value={editWww} onChange={(e) => setEditWww(e.target.value)} rows={3} />
            </label>
            <label className="sreview-card-field">
              What fixed it
              <textarea value={editWfi} onChange={(e) => setEditWfi(e.target.value)} rows={2} />
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
                <span className="sreview-card-label">{isSkillCandidate ? 'Workflow' : 'Problem'}</span>
                <p>{event.what_went_wrong}</p>
              </div>
              {event.what_fixed_it ? (
                <div className="sreview-card-field-read">
                  <span className="sreview-card-label">{isSkillCandidate ? 'Why reusable' : 'Fix'}</span>
                  <p>{event.what_fixed_it}</p>
                </div>
              ) : null}
              <div className="sreview-card-field-read">
                <span className="sreview-card-label">Context</span>
                <blockquote className="sreview-card-quote">{event.context}</blockquote>
              </div>
            </div>

            <div className="sreview-card-actions">
              {isSkillCandidate ? (
                <button
                  type="button"
                  className="sreview-btn sreview-btn--skill"
                  disabled={generating}
                  onClick={handleGenerateSkill}
                >
                  <Wand size={14} />
                  {generating ? 'Generating…' : 'Generate Skill'}
                </button>
              ) : null}
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
                  onClick={() => { onApprove(event, 'pending'); }}
                >
                  Un-approve
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {skillModal ? (
        <div className="sreview-modal-overlay" onClick={() => setSkillModal(false)}>
          <div className="sreview-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="sreview-modal-title">Generate Skill</h3>
            <label className="sreview-card-field">
              Skill slug
              <div className="sreview-skill-slug-wrap">
                <span className="sreview-skill-slug-prefix">.openkms/skills/</span>
                <input
                  className="sreview-skill-slug-input"
                  value={skillSlug}
                  onChange={(e) => setSkillSlug(e.target.value.replace(/[^a-z0-9-]/g, ''))}
                  placeholder="my-skill"
                />
                <span className="sreview-skill-slug-suffix">/SKILL.md</span>
              </div>
            </label>
            <label className="sreview-card-field">
              SKILL.md content
              <textarea
                value={skillContent}
                onChange={(e) => setSkillContent(e.target.value)}
                rows={16}
                className="sreview-skill-content-textarea"
              />
            </label>
            <div className="sreview-modal-actions">
              <button type="button" className="sreview-btn sreview-btn--cancel" onClick={() => setSkillModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="sreview-btn sreview-btn--save"
                disabled={saving || !skillSlug.trim() || !skillContent.trim()}
                onClick={handleSaveSkill}
              >
                {saving ? 'Saving…' : 'Save Skill'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
