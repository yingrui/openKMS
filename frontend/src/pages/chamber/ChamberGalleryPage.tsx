import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutGrid, Plus, Settings, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { deleteChamberApp, listChamberApps, type ChamberAppResponse } from '../../data/chamberApi';
import { PERM_ONTOLOGY_WRITE } from '../../config/permissions';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { EmptyState } from '../../styles/design-system';
import './ChamberPages.scss';

export function ChamberGalleryPage() {
  const { t } = useTranslation('chamber');
  const confirm = useConfirm();
  const { hasPermission } = useAuth();
  // The backend gates update/delete on `ontology:write`; a read-only visitor must not be offered them
  // (the old check was "can reach /chamber", which is the read gate — every reader saw the buttons).
  const canManage = hasPermission(PERM_ONTOLOGY_WRITE);
  const [apps, setApps] = useState<ChamberAppResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const handleDeleteApp = async (app: ChamberAppResponse) => {
    const ok = await confirm({
      title: t('delete'),
      message: t('confirmDelete'),
      confirmLabel: t('delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteChamberApp(app.id);
      toast.success(t('deletedToast', { name: app.name }));
      await reload();
    } catch (e) {
      // Silent failure is the worst kind here: the card stays but the reader believes it is gone.
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
  };

  const reload = async () => {
    // Registration is the only state: every listed app can be opened, so there is nothing to filter on.
    setApps(await listChamberApps());
  };

  useEffect(() => {
    void reload()
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [canManage]);

  return (
    <div className="chamber-page">
      <header className="page-header chamber-page__header">
        <div>
          <h1>{t('galleryTitle')}</h1>
          <p className="page-subtitle">{t('gallerySubtitle')}</p>
        </div>
        {/* The empty state already offers the same button; two of them on one screen is noise. */}
        {canManage && (apps.length > 0 || loading) ? (
          <Link to="/chamber/new" className="btn btn-primary">
            <Plus size={16} />
            <span>{t('registerAction')}</span>
          </Link>
        ) : null}
      </header>
      {loading ? <p>{t('loading')}</p> : null}
      {error ? <p className="chamber-page__error" role="alert">{error}</p> : null}
      {!loading && !apps.length && !error ? (
        <EmptyState
          title={t('emptyGallery')}
          description={t('emptyGalleryHint')}
          action={
            canManage ? (
              <Link to="/chamber/new" className="btn btn-primary">
                {t('registerAction')}
              </Link>
            ) : (
              <Link to="/console/kubernetes" className="btn btn-primary">
                {t('goToKubernetes')}
              </Link>
            )
          }
        />
      ) : null}
      {!loading && apps.length > 0 ? (
        <div className="chamber-page__grid">
          {apps.map((app) => {
            // One state only: every listed app opens. (This used to branch on `published`, which meant that
            // once the status concept was removed every card led to the read-only settings page.)
            const openTo = `/chamber/${app.id}`;
            return (
              <div key={app.id} className="chamber-page__card">
                <div className="chamber-page__card-top">
                  <Link to={openTo} className="chamber-page__card-icon" aria-hidden tabIndex={-1}>
                    <LayoutGrid size={26} strokeWidth={1.5} />
                  </Link>
                  {canManage ? (
                    <div className="chamber-page__card-actions">
                      <Link
                        to={`/chamber/${app.id}/settings`}
                        title={t('editSettings')}
                        aria-label={t('editSettings')}
                      >
                        <Settings size={15} />
                      </Link>
                      <button
                        type="button"
                        title={t('delete')}
                        aria-label={t('delete')}
                        onClick={() => void handleDeleteApp(app)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
                <Link to={openTo} className="chamber-page__card-body">
                  <h3>{app.name}</h3>
                  <div className="chamber-page__card-badges">
                    <span className="chamber-page__badge chamber-page__badge--kind">{t('kindModule')}</span>
                    {app.bindings_stale ? <span className="chamber-page__badge">{t('stale')}</span> : null}
                  </div>
                  {app.description ? (
                    <span className="chamber-page__card-desc" title={app.description}>
                      {app.description}
                    </span>
                  ) : null}
                  <span className="chamber-page__card-meta">
                    {app.api_name}
                    {app.created_by_name ? ` · ${t('cardOwner', { name: app.created_by_name })}` : ''}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
