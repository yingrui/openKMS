import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { config } from '../../config';
import { useAuth } from '../../contexts/AuthContext';
import { PERM_CONSOLE_GROUPS } from '../../config/permissions';
import { authAwareFetch, getAuthHeaders } from '../../data/apiClient';
import { fetchAdminUsersPage, type LocalUserRow } from '../../data/adminUsersApi';
import {
  fetchDataResources,
  fetchGroupMembers,
  fetchGroupScopes,
  putGroupMembers,
  putGroupScopes,
  type DataResourceOut,
  type GroupScopesOut,
} from '../../data/securityAdminApi';
import './ConsoleGroupDataAccess.css';

type ChannelNode = { id: string; name: string; children?: ChannelNode[] };

function flattenChannels(nodes: ChannelNode[], prefix = ''): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    const label = prefix ? `${prefix} / ${n.name}` : n.name;
    out.push({ id: n.id, label });
    if (n.children?.length) out.push(...flattenChannels(n.children, label));
  }
  return out;
}

type Opt = { id: string; name: string };

export function ConsoleGroupDataAccess() {
  const { groupId } = useParams<{ groupId: string }>();
  const { hasPermission, authMode } = useAuth();
  const membershipLocal = authMode === 'local';
  const [scopes, setScopes] = useState<GroupScopesOut | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [allUsers, setAllUsers] = useState<LocalUserRow[]>([]);
  const [channels, setChannels] = useState<{ id: string; label: string }[]>([]);
  const [articleChannels, setArticleChannels] = useState<{ id: string; label: string }[]>([]);
  const [kbs, setKbs] = useState<Opt[]>([]);
  const [wikis, setWikis] = useState<Opt[]>([]);
  const [evals, setEvals] = useState<Opt[]>([]);
  const [datasets, setDatasets] = useState<Opt[]>([]);
  const [objectTypes, setObjectTypes] = useState<Opt[]>([]);
  const [linkTypes, setLinkTypes] = useState<Opt[]>([]);
  const [dataResources, setDataResources] = useState<DataResourceOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!groupId) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const [sc, mem, usersPage, chRes, achRes, kbRes, wikiRes, evRes, dsRes, otRes, ltRes, drList] = await Promise.all([
        fetchGroupScopes(groupId),
        membershipLocal ? fetchGroupMembers(groupId) : Promise.resolve({ users: [] as { id: string }[] }),
        membershipLocal
          ? fetchAdminUsersPage().catch(() => ({ users: [] as LocalUserRow[] }))
          : Promise.resolve({ users: [] as LocalUserRow[] }),
        authAwareFetch(`${config.apiUrl}/api/document-channels`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/article-channels`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/knowledge-bases`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/wiki-spaces`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/evaluation-datasets`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/datasets`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/object-types`, { headers, credentials: 'include' }),
        authAwareFetch(`${config.apiUrl}/api/link-types`, { headers, credentials: 'include' }),
        fetchDataResources().catch(() => [] as DataResourceOut[]),
      ]);
      setScopes({
        ...sc,
        article_channel_ids: sc.article_channel_ids ?? [],
        data_resource_ids: sc.data_resource_ids ?? [],
      });
      setMemberIds(mem.users.map((u) => u.id));
      if (usersPage.users?.length) setAllUsers(usersPage.users);

      if (chRes.ok) {
        const tree = (await chRes.json()) as ChannelNode[];
        setChannels(flattenChannels(Array.isArray(tree) ? tree : []));
      }
      if (achRes.ok) {
        const tree = (await achRes.json()) as ChannelNode[];
        setArticleChannels(flattenChannels(Array.isArray(tree) ? tree : []));
      }
      if (kbRes.ok) {
        const j = await kbRes.json();
        const items = (j.items ?? []) as { id: string; name: string }[];
        setKbs(items.map((x) => ({ id: x.id, name: x.name })));
      }
      if (wikiRes.ok) {
        const j = await wikiRes.json();
        const items = (j.items ?? []) as { id: string; name: string }[];
        setWikis(items.map((x) => ({ id: x.id, name: x.name })));
      }
      if (evRes.ok) {
        const j = await evRes.json();
        const items = (j.items ?? []) as { id: string; name: string }[];
        setEvals(items.map((x) => ({ id: x.id, name: x.name })));
      }
      if (dsRes.ok) {
        const j = await dsRes.json();
        const items = (j.items ?? []) as { id: string; display_name?: string; schema_name?: string; table_name?: string }[];
        setDatasets(
          items.map((x) => ({
            id: x.id,
            name: x.display_name || `${x.schema_name}.${x.table_name}`,
          }))
        );
      }
      if (otRes.ok) {
        const j = await otRes.json();
        const items = (j.items ?? []) as { id: string; name: string }[];
        setObjectTypes(items.map((x) => ({ id: x.id, name: x.name })));
      }
      if (ltRes.ok) {
        const j = await ltRes.json();
        const items = (j.items ?? []) as { id: string; name: string }[];
        setLinkTypes(items.map((x) => ({ id: x.id, name: x.name })));
      }
      setDataResources(Array.isArray(drList) ? drList : []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [groupId, membershipLocal]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMember = (uid: string) => {
    setMemberIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const toggleId = (field: keyof GroupScopesOut, id: string) => {
    setScopes((prev) => {
      if (!prev) return prev;
      const cur = new Set(prev[field] as string[]);
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
      return { ...prev, [field]: [...cur] };
    });
  };

  const onSaveMembers = async () => {
    if (!groupId) return;
    setSaving(true);
    try {
      await putGroupMembers(groupId, memberIds);
      toast.success('Members saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onSaveScopes = async () => {
    if (!groupId || !scopes) return;
    setSaving(true);
    try {
      const next = await putGroupScopes(groupId, scopes);
      setScopes(next);
      toast.success('Resource scopes saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const multiSelectSection = useMemo(() => {
    if (!scopes) return null;
    const sections: { key: keyof GroupScopesOut; title: string; options: { id: string; label: string }[] }[] = [
      { key: 'channel_ids', title: 'Document channels', options: channels },
      { key: 'article_channel_ids', title: 'Article channels', options: articleChannels },
      { key: 'knowledge_base_ids', title: 'Knowledge bases', options: kbs.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'wiki_space_ids', title: 'Wiki spaces', options: wikis.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'evaluation_dataset_ids', title: 'Evaluation datasets', options: evals.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'dataset_ids', title: 'Datasets', options: datasets.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'object_type_ids', title: 'Object types', options: objectTypes.map((x) => ({ id: x.id, label: x.name })) },
      { key: 'link_type_ids', title: 'Link types', options: linkTypes.map((x) => ({ id: x.id, label: x.name })) },
      {
        key: 'data_resource_ids',
        title: 'Data resources (named filters)',
        options: dataResources.map((x) => ({
          id: x.id,
          label: `${x.name} (${x.resource_kind})`,
        })),
      },
    ];
    return sections;
  }, [scopes, channels, articleChannels, kbs, wikis, evals, datasets, objectTypes, linkTypes, dataResources]);

  if (!hasPermission(PERM_CONSOLE_GROUPS)) {
    return <Navigate to="/console" replace />;
  }
  if (!groupId) {
    return <Navigate to="/console/data-security/groups" replace />;
  }

  return (
    <div className="console-group-access">
      <div className="page-header">
        <Link to="/console/data-security/groups" className="console-group-access-back">
          ← Groups
        </Link>
        <h1>Group data access</h1>
        <p className="page-subtitle">
          When <code>OPENKMS_ENFORCE_GROUP_DATA_SCOPES</code> is on (local mode), users in this group see the union of
          legacy ID selections and attached <strong>data resources</strong> (per-kind filters). Empty legacy lists with
          no data resources mean no access for that category when the flag is on. In OIDC mode, manage group names and
          resource scopes here; user membership in access groups is not edited in this console.
        </p>
      </div>

      {loading || !scopes ? (
        <p className="console-group-access-muted">Loading…</p>
      ) : (
        <>
          <section className="console-group-access-section">
            <h2>Members</h2>
            {membershipLocal ? (
              <>
                <p className="console-group-access-hint">Assign local users to this access group.</p>
                <div className="console-group-access-checkgrid">
                  {allUsers.map((u) => (
                    <label key={u.id} className="console-group-access-check">
                      <input type="checkbox" checked={memberIds.includes(u.id)} onChange={() => toggleMember(u.id)} />
                      <span>
                        {u.username} <span className="muted">({u.email})</span>
                      </span>
                    </label>
                  ))}
                </div>
                <button type="button" className="btn-primary" disabled={saving} onClick={() => void onSaveMembers()}>
                  Save members
                </button>
              </>
            ) : (
              <p className="console-group-access-hint">
                In OIDC mode, access group membership is not managed here. Define groups and scopes below; map users to
                groups in your identity provider (future sync may surface members in the app).
              </p>
            )}
          </section>

          <section className="console-group-access-section">
            <h2>Resources</h2>
            {multiSelectSection?.map((sec) => (
              <div key={sec.key} className="console-group-access-block">
                <h3>{sec.title}</h3>
                <div className="console-group-access-checkgrid">
                  {sec.options.map((o) => (
                    <label key={o.id} className="console-group-access-check">
                      <input
                        type="checkbox"
                        checked={(scopes[sec.key] as string[]).includes(o.id)}
                        onChange={() => toggleId(sec.key, o.id)}
                      />
                      <span>{o.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void onSaveScopes()}>
              Save resource scopes
            </button>
          </section>
        </>
      )}
    </div>
  );
}
