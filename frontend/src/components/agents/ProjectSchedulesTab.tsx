import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CalendarClock, Loader2, Play, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { listProjectConversations } from '../../data/projectsApi';
import {
  createProjectSchedule,
  deleteProjectSchedule,
  listProjectSchedules,
  patchProjectSchedule,
  runProjectScheduleNow,
  scheduleSessionId,
  type OnRunCompleted,
  type ProjectAgentSchedule,
  type ScheduleMode,
} from '../../data/schedulesApi';
import { projectWorkspacePath } from '../../data/projectsApi';
import { fetchSystemSettings } from '../../data/systemApi';
import { timezoneSelectOptions } from '../../utils/commonTimezones';

interface Props {
  projectId: string;
}

const defaultForm = {
  display_name: '',
  mode: 'stateless' as ScheduleMode,
  cron: '0 9 * * *',
  timezone: 'UTC',
  prompt: '',
  enabled: true,
  on_run_completed: 'keep' as OnRunCompleted,
  conversation_id: '',
};

export function ProjectSchedulesTab({ projectId }: Props) {
  const { t } = useTranslation('agents');
  const navigate = useNavigate();
  const [items, setItems] = useState<ProjectAgentSchedule[]>([]);
  const [conversations, setConversations] = useState<{ id: string; title: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [creating, setCreating] = useState(false);
  const [defaultTimezone, setDefaultTimezone] = useState('UTC');

  const timezoneOptions = useMemo(() => timezoneSelectOptions(form.timezone), [form.timezone]);

  const openCreateForm = () => {
    setForm({ ...defaultForm, timezone: defaultTimezone });
    setShowForm(true);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [schedules, convs] = await Promise.all([
        listProjectSchedules(projectId),
        listProjectConversations(projectId).catch(() => []),
      ]);
      setItems(schedules);
      setConversations(convs.map((c) => ({ id: c.id, title: c.title ?? null })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.schedules.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void load();
    fetchSystemSettings()
      .then((s) => setDefaultTimezone(s.default_timezone?.trim() || 'UTC'))
      .catch(() => {
        setDefaultTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
      });
  }, [load]);

  const onCreate = async () => {
    if (!form.display_name.trim() || !form.prompt.trim() || !form.cron.trim()) return;
    if (form.mode === 'stateful' && !form.conversation_id.trim()) {
      toast.error(t('settings.schedules.conversationRequired'));
      return;
    }
    setCreating(true);
    try {
      const created = await createProjectSchedule(projectId, {
        display_name: form.display_name.trim(),
        mode: form.mode,
        cron: form.cron.trim(),
        timezone: form.timezone.trim() || 'UTC',
        prompt: form.prompt.trim(),
        enabled: form.enabled,
        on_run_completed: form.on_run_completed,
        conversation_id: form.mode === 'stateful' ? form.conversation_id.trim() : null,
      });
      setItems((prev) => [...prev, created]);
      setShowForm(false);
      setForm(defaultForm);
      toast.success(t('settings.schedules.createSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.schedules.createFailed'));
    } finally {
      setCreating(false);
    }
  };

  const toggleEnabled = async (row: ProjectAgentSchedule) => {
    setBusyId(row.id);
    try {
      const updated = await patchProjectSchedule(projectId, row.id, { enabled: !row.enabled });
      setItems((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.schedules.updateFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onDelete = async (row: ProjectAgentSchedule) => {
    if (!window.confirm(t('settings.schedules.deleteConfirm', { name: row.display_name }))) return;
    setBusyId(row.id);
    try {
      await deleteProjectSchedule(projectId, row.id);
      setItems((prev) => prev.filter((s) => s.id !== row.id));
      toast.success(t('settings.schedules.deleteSuccess'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.schedules.deleteFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (row: ProjectAgentSchedule) => {
    setBusyId(row.id);
    try {
      const { job_id } = await runProjectScheduleNow(projectId, row.id);
      toast.success(t('settings.schedules.runQueued', { id: job_id }));
      navigate(`/job-runs/${job_id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.schedules.runFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const formatDate = (iso: string | null | undefined) => {
    if (!iso) return t('settings.schedules.dash');
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return <p className="project-settings-hint">{t('settings.schedules.loading')}</p>;
  }

  return (
    <section className="project-settings-section project-settings-schedules">
      <h2>{t('settings.schedules.heading')}</h2>
      <p className="project-settings-hint project-settings-hint--intro">{t('settings.schedules.hint')}</p>
      <p className="project-settings-hint">
        <CalendarClock size={14} aria-hidden />
        {t('settings.schedules.hubHint')}{' '}
        <Link to="/job-runs/schedules">{t('settings.schedules.hubLink')}</Link>
      </p>

      {items.length === 0 && !showForm ? (
        <p className="project-settings-skills-empty">{t('settings.schedules.empty')}</p>
      ) : null}

      {items.length > 0 ? (
        <div className="project-settings-skills-table-wrap">
          <table className="project-settings-skills-table">
            <thead>
              <tr>
                <th>{t('settings.schedules.colName')}</th>
                <th>{t('settings.schedules.colMode')}</th>
                <th>{t('settings.schedules.colCron')}</th>
                <th>{t('settings.schedules.colEnabled')}</th>
                <th>{t('settings.schedules.colNextRun')}</th>
                <th>{t('settings.schedules.colLastStatus')}</th>
                <th>{t('settings.schedules.colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id}>
                  <td>{row.display_name}</td>
                  <td>{t(`settings.schedules.mode.${row.mode}`)}</td>
                  <td>
                    <code>{row.cron ?? t('settings.schedules.dash')}</code>
                    {row.timezone ? <span className="project-settings-hint"> ({row.timezone})</span> : null}
                  </td>
                  <td>
                    <label className="project-settings-checkbox">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        disabled={busyId === row.id}
                        onChange={() => void toggleEnabled(row)}
                      />
                    </label>
                  </td>
                  <td>{formatDate(row.next_run_at)}</td>
                  <td>
                    <span className={row.last_status === 'failed' ? 'project-settings-schedule-status-failed' : undefined}>
                      {row.last_status ?? t('settings.schedules.dash')}
                    </span>
                    {row.last_job_id != null ? (
                      <>
                        {' '}
                        <Link to={`/job-runs/${row.last_job_id}`} className="project-settings-schedule-job-link">
                          #{row.last_job_id}
                        </Link>
                      </>
                    ) : null}
                  </td>
                  <td className="project-settings-skills-table-actions">
                    {scheduleSessionId(row) ? (
                      <Link
                        to={projectWorkspacePath(projectId, scheduleSessionId(row))}
                        className="btn btn-secondary btn-sm"
                      >
                        {t('settings.schedules.openSession')}
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => void runNow(row)}
                    >
                      <Play size={14} aria-hidden />
                      {t('settings.schedules.runNow')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busyId === row.id}
                      onClick={() => void onDelete(row)}
                    >
                      <Trash2 size={14} aria-hidden />
                      {t('settings.schedules.delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showForm ? (
        <div className="project-settings-schedules-form">
          <h3>{t('settings.schedules.formTitle')}</h3>
          <div className="project-settings-field">
            <label htmlFor="schedule-name">{t('settings.schedules.fieldName')}</label>
            <input
              id="schedule-name"
              type="text"
              value={form.display_name}
              onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
            />
          </div>
          <div className="project-settings-field">
            <label htmlFor="schedule-mode">{t('settings.schedules.fieldMode')}</label>
            <select
              id="schedule-mode"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as ScheduleMode }))}
            >
              <option value="stateless">{t('settings.schedules.mode.stateless')}</option>
              <option value="stateful">{t('settings.schedules.mode.stateful')}</option>
            </select>
            <p className="project-settings-hint">{t(`settings.schedules.modeHint.${form.mode}`)}</p>
          </div>
          {form.mode === 'stateful' ? (
            <div className="project-settings-field">
              <label htmlFor="schedule-conversation">{t('settings.schedules.fieldConversation')}</label>
              <select
                id="schedule-conversation"
                value={form.conversation_id}
                onChange={(e) => setForm((f) => ({ ...f, conversation_id: e.target.value }))}
              >
                <option value="">{t('settings.schedules.conversationPlaceholder')}</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title?.trim() || c.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="project-settings-field">
              <label htmlFor="schedule-on-complete">{t('settings.schedules.fieldOnComplete')}</label>
              <select
                id="schedule-on-complete"
                value={form.on_run_completed}
                onChange={(e) =>
                  setForm((f) => ({ ...f, on_run_completed: e.target.value as OnRunCompleted }))
                }
              >
                <option value="keep">{t('settings.schedules.onComplete.keep')}</option>
                <option value="delete">{t('settings.schedules.onComplete.delete')}</option>
              </select>
            </div>
          )}
          <div className="project-settings-field">
            <label htmlFor="schedule-cron">{t('settings.schedules.fieldCron')}</label>
            <input
              id="schedule-cron"
              type="text"
              value={form.cron}
              onChange={(e) => setForm((f) => ({ ...f, cron: e.target.value }))}
              spellCheck={false}
            />
          </div>
          <div className="project-settings-field">
            <label htmlFor="schedule-timezone">{t('settings.schedules.fieldTimezone')}</label>
            <select
              id="schedule-timezone"
              value={form.timezone}
              onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="project-settings-field">
            <label htmlFor="schedule-prompt">{t('settings.schedules.fieldPrompt')}</label>
            <textarea
              id="schedule-prompt"
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
              rows={5}
            />
          </div>
          <div className="project-settings-field">
            <label className="project-settings-checkbox">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
              />
              <span>{t('settings.schedules.fieldEnabled')}</span>
            </label>
          </div>
          <div className="project-settings-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={creating || !form.display_name.trim() || !form.prompt.trim()}
              onClick={() => void onCreate()}
            >
              {creating ? <Loader2 size={16} className="project-settings-spinner" /> : null}
              {t('settings.schedules.create')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>
              {t('settings.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="project-settings-actions">
          <button type="button" className="btn btn-secondary" onClick={openCreateForm}>
            <Plus size={16} aria-hidden />
            {t('settings.schedules.add')}
          </button>
        </div>
      )}
    </section>
  );
}
