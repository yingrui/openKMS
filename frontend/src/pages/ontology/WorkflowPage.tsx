import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ForceGraph2D, { type ForceGraphMethods } from 'react-force-graph-2d';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  Check,
  Expand,
  ExternalLink,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Loader2,
  Maximize2,
  Minimize2,
  Newspaper,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  executeCypherQuery,
  fetchObjectInstances,
  indexObjectTypeToNeo4j,
  updateObjectInstance,
} from '../../data/ontologyApi';
import { fetchDocuments, type DocumentListItemResponse } from '../../data/documentsApi';
import './WorkflowPage.scss';

/** Fixed demo-environment identifiers for the ApprovalCase ontology + Neo4j sync. */
const APPROVAL_OBJECT_TYPE_ID = '9f3ecf2e-899d-4562-bb4c-8c2b99b36c1d';
const NEO4J_DATASOURCE_ID = '8a1440ed-489a-4e3f-b232-e02224d5321b';
/** Credit-archive document channel used for the due-diligence material list (stage 0). */
const DUE_DILIGENCE_CHANNEL = 'dc_039951f1';
/** Market-data dataset backing the post-loan pledge-ratio monitor (stage 4). */
const MARKET_DATASET_ID = '5558f704-47cc-4c92-8637-b7b8dd6d67a0';

/**
 * The data silos fused into this case's knowledge graph. Each entry is one *input*
 * source system; the graph (25 entities · 35 relations) is the fused *output*. The
 * `credit` silo resolves its "view original" link at runtime; the rest are static.
 */
type SiloDef = {
  key: string;
  Icon: typeof FileText;
  count: number;
  unitKey: string;
  /** Static "view original" URL; omitted for `credit`, which resolves a representative doc. */
  href?: string;
};
const SILOS: SiloDef[] = [
  { key: 'credit', Icon: FileText, count: 13, unitKey: 'unit_docs' },
  { key: 'judicial', Icon: Newspaper, count: 6, unitKey: 'unit_articles', href: '/articles' },
  { key: 'policy', Icon: BookOpen, count: 5, unitKey: 'unit_pages', href: '/wikis/a775d789-b5de-4648-b237-45890991354a' },
  { key: 'market', Icon: TrendingUp, count: 746, unitKey: 'unit_rows', href: '/ontology/datasets/5558f704-47cc-4c92-8637-b7b8dd6d67a0' },
  { key: 'collateral', Icon: ImageIcon, count: 3, unitKey: 'unit_scans', href: '/media/channels/mc_0de71981' },
  { key: 'glossary', Icon: BookMarked, count: 27, unitKey: 'unit_terms', href: '/glossaries/326ce551-c9d6-4d92-8b9d-4795f871191a' },
];
/** Substring that identifies the representative credit document (resolved to a view URL). */
const CREDIT_DOC_MATCH = '授信申请书';

/** Today's date as YYYY-MM-DD. */
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

type WorkflowType = 'credit' | 'fraud';

/** Canonical order of the five credit-review stages (values stored on ApprovalCase.stage). */
const STAGE_ORDER = ['受理与尽职调查', '合规审查', '授信审议', '审批决议', '贷后管理'] as const;

const DECISION_MAP: Record<string, { key: string; tone: string }> = {
  待定: { key: 'decision_pending', tone: 'pending' },
  通过: { key: 'decision_approved', tone: 'approved' },
  有条件通过: { key: 'decision_conditional', tone: 'conditional' },
  暂缓: { key: 'decision_deferred', tone: 'deferred' },
  否决: { key: 'decision_rejected', tone: 'rejected' },
};

const STATUS_MAP: Record<string, string> = {
  进行中: 'statusInProgress',
  已完成: 'statusDone',
  已退回: 'statusReturned',
};

/** Node accent colour per Neo4j label. ApprovalCase is the visual centre (gold). */
const NODE_TYPE_COLORS: Record<string, string> = {
  ApprovalCase: '#d97706',
  Company: '#4f46e5',
  CreditFacility: '#059669',
  Collateral: '#7c3aed',
  ListedStock: '#0d9488',
  Person: '#be185d',
  Lawsuit: '#dc2626',
};

const KNOWN_TYPES = ['ApprovalCase', 'Company', 'CreditFacility', 'Collateral', 'ListedStock', 'Person', 'Lawsuit'];

type CaseInfo = {
  id: string;
  case_no: string;
  title: string;
  applicant: string;
  facility_no: string;
  amount_wan: number | string | null;
  stage: string;
  stage_status: string;
  decision: string;
  risk_flags: string;
  owner: string;
  updated_at_note: string;
  /** Full raw node properties, used as a merge base when writing the approval decision back. */
  raw: Record<string, unknown>;
};

type WFNode = {
  id: string;
  name: string;
  label: string;
  props: Record<string, unknown>;
  isCase: boolean;
  x?: number;
  y?: number;
};
type WFLink = { source: string; target: string; relType: string };

/** Display name for a node given its label + serialized properties. */
function nodeDisplayName(label: string, props: Record<string, unknown>): string {
  const pick = (k: string) => (typeof props[k] === 'string' && props[k] ? String(props[k]) : '');
  switch (label) {
    case 'ApprovalCase':
      return pick('title') || pick('case_no') || label;
    case 'CreditFacility':
      return pick('summary') || pick('facility_no') || label;
    case 'Lawsuit':
      return pick('cause') || pick('case_no') || label;
    default:
      return pick('name') || label;
  }
}

/** Build the edge-per-row Cypher for one case. Returns 7 stable columns per row (src/tgt keyed by elementId). */
function buildGraphCypher(caseNo: string): string {
  const cn = caseNo.replace(/'/g, "\\'");
  const scan = (matchExpr: string, srcVar: string, tgtVar: string, relVar: string) =>
    `MATCH (ac:ApprovalCase {case_no: '${cn}'})${matchExpr}\n` +
    `RETURN elementId(${srcVar}) AS src_id, head(labels(${srcVar})) AS src_label, ${srcVar} AS src, ` +
    `type(${relVar}) AS rel_type, ` +
    `elementId(${tgtVar}) AS tgt_id, head(labels(${tgtVar})) AS tgt_label, ${tgtVar} AS tgt`;
  return [
    // case -> applicant
    scan('-[r:CASE_APPLICANT]->(m:Company)', 'ac', 'm', 'r'),
    // case -> facility
    scan('-[r:CASE_FOR]->(m:CreditFacility)', 'ac', 'm', 'r'),
    // applicant guarantee network (both directions, up to 4 hops); unwound to individual edges
    `MATCH (ac:ApprovalCase {case_no: '${cn}'})-[:CASE_APPLICANT]->(applicant:Company)\n` +
      `MATCH gp=(applicant)-[:GUARANTEES*1..4]-(gco:Company)\n` +
      `UNWIND relationships(gp) AS r\n` +
      `RETURN elementId(startNode(r)) AS src_id, head(labels(startNode(r))) AS src_label, startNode(r) AS src, ` +
      `type(r) AS rel_type, ` +
      `elementId(endNode(r)) AS tgt_id, head(labels(endNode(r))) AS tgt_label, endNode(r) AS tgt`,
    // facility <- collateral
    `MATCH (ac:ApprovalCase {case_no: '${cn}'})-[:CASE_FOR]->(f:CreditFacility)\n` +
      `MATCH (col:Collateral)-[r:PLEDGED_FOR]->(f)\n` +
      `RETURN elementId(col) AS src_id, head(labels(col)) AS src_label, col AS src, ` +
      `type(r) AS rel_type, ` +
      `elementId(f) AS tgt_id, head(labels(f)) AS tgt_label, f AS tgt`,
    // applicant -> listed stock (sales dependency / holdings)
    `MATCH (ac:ApprovalCase {case_no: '${cn}'})-[:CASE_APPLICANT]->(applicant:Company)\n` +
      `MATCH (applicant)-[r:SELLS_TO|HOLDS_STOCK]->(st:ListedStock)\n` +
      `RETURN elementId(applicant) AS src_id, head(labels(applicant)) AS src_label, applicant AS src, ` +
      `type(r) AS rel_type, ` +
      `elementId(st) AS tgt_id, head(labels(st)) AS tgt_label, st AS tgt`,
  ].join('\nUNION\n');
}

/** Turn the edge-per-row result into force-graph {nodes, links}. */
function rowsToGraph(rows: Record<string, unknown>[]): { nodes: WFNode[]; links: WFLink[] } {
  const nodeMap = new Map<string, WFNode>();
  const links: WFLink[] = [];
  const linkSet = new Set<string>();

  const addNode = (id: unknown, label: unknown, props: unknown) => {
    if (typeof id !== 'string' || !id) return;
    if (nodeMap.has(id)) return;
    const lbl = typeof label === 'string' ? label : 'Node';
    const p = props && typeof props === 'object' ? (props as Record<string, unknown>) : {};
    nodeMap.set(id, {
      id,
      label: lbl,
      props: p,
      name: nodeDisplayName(lbl, p),
      isCase: lbl === 'ApprovalCase',
    });
  };

  for (const row of rows) {
    addNode(row.src_id, row.src_label, row.src);
    addNode(row.tgt_id, row.tgt_label, row.tgt);
    const s = row.src_id;
    const t = row.tgt_id;
    const rel = typeof row.rel_type === 'string' ? row.rel_type : '';
    if (typeof s === 'string' && typeof t === 'string' && s && t) {
      const key = `${s}->${t}:${rel}`;
      if (!linkSet.has(key)) {
        linkSet.add(key);
        links.push({ source: s, target: t, relType: rel });
      }
    }
  }
  return { nodes: [...nodeMap.values()], links };
}

export function WorkflowPage() {
  const { t } = useTranslation('workflow');
  const [cases, setCases] = useState<CaseInfo[]>([]);
  const [loadingCases, setLoadingCases] = useState(true);
  const [selectedCaseNo, setSelectedCaseNo] = useState<string>('');
  const [graphData, setGraphData] = useState<{ nodes: WFNode[]; links: WFLink[] } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const [selectedNode, setSelectedNode] = useState<WFNode | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  // --- cockpit state: template picker + active workflow lens ---
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [workflowType, setWorkflowType] = useState<WorkflowType>('credit');

  // --- clickable-stage panel state ---
  const [selectedStage, setSelectedStage] = useState<number | null>(null);
  const [ddDocs, setDdDocs] = useState<DocumentListItemResponse[] | null>(null);
  const [ddLoading, setDdLoading] = useState(false);
  const [approvalOpinion, setApprovalOpinion] = useState('');
  const [approving, setApproving] = useState<string | null>(null);

  const graphRef = useRef<ForceGraphMethods<WFNode, WFLink>>(undefined);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  // Resolve the credit silo's "view original" link to a representative credit document.
  const [creditDocUrl, setCreditDocUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const docs = await fetchDocuments({ limit: 200 });
        if (cancelled) return;
        const hit = docs.items.find((d) => d.name?.includes(CREDIT_DOC_MATCH));
        if (hit) setCreditDocUrl(`/documents/view/${hit.id}`);
      } catch {
        /* non-fatal: the credit card falls back to plain (unlinked) text */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- load all approval cases ---
  const loadCases = useCallback(async () => {
    setLoadingCases(true);
    try {
      const data = await executeCypherQuery(
        'MATCH (ac:ApprovalCase) RETURN elementId(ac) AS id, ac AS props ORDER BY ac.case_no'
      );
      const list: CaseInfo[] = data.rows.map((row) => {
        const p = (row.props && typeof row.props === 'object' ? row.props : {}) as Record<string, unknown>;
        const s = (k: string) => (p[k] == null ? '' : String(p[k]));
        return {
          id: String(row.id ?? s('case_no')),
          case_no: s('case_no'),
          title: s('title'),
          applicant: s('applicant'),
          facility_no: s('facility_no'),
          amount_wan: (p.amount_wan as number | string | null) ?? null,
          stage: s('stage'),
          stage_status: s('stage_status'),
          decision: s('decision'),
          risk_flags: s('risk_flags'),
          owner: s('owner'),
          updated_at_note: s('updated_at_note'),
          raw: p,
        };
      });
      setCases(list);
      setSelectedCaseNo((prev) => (prev && list.some((c) => c.case_no === prev) ? prev : list[0]?.case_no ?? ''));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('toastCasesFailed'));
    } finally {
      setLoadingCases(false);
    }
  }, [t]);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const selectedCase = useMemo(
    () => cases.find((c) => c.case_no === selectedCaseNo) ?? null,
    [cases, selectedCaseNo]
  );

  // Lazily load the due-diligence material list the first time the intake stage is opened.
  // NOTE: ddLoading must NOT be a dependency — setDdLoading(true) would re-run this effect,
  // fire the cleanup, set cancelled=true, and the in-flight fetch would drop its result (stuck spinner).
  useEffect(() => {
    if (selectedStage !== 0 || ddDocs !== null) return;
    let cancelled = false;
    setDdLoading(true);
    fetchDocuments({ channel_id: DUE_DILIGENCE_CHANNEL, limit: 30 })
      .then((res) => {
        if (!cancelled) setDdDocs(res.items);
      })
      .catch(() => {
        if (!cancelled) setDdDocs([]);
      })
      .finally(() => {
        if (!cancelled) setDdLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStage, ddDocs]);

  // --- human-in-the-loop: write the approval decision back and re-sync the graph (stage 3) ---
  const submitDecision = useCallback(
    async (decision: '通过' | '有条件通过' | '否决') => {
      if (!selectedCase || approving) return;
      setApproving(decision);
      try {
        // Merge onto the authoritative instance data so no field is dropped.
        let baseData: Record<string, unknown> = { ...selectedCase.raw };
        try {
          const list = await fetchObjectInstances(APPROVAL_OBJECT_TYPE_ID, { search: selectedCase.case_no });
          const inst = list.items.find((it) => it.id === selectedCase.case_no);
          if (inst?.data) baseData = { ...inst.data };
        } catch {
          /* fall back to raw node props */
        }
        const opinion = approvalOpinion.trim();
        const note = `${todayStr()} 审批决议：${decision}${opinion ? `（${opinion}）` : ''}`;
        const nextData = {
          ...baseData,
          decision,
          stage: '审批决议',
          stage_status: '已完成',
          updated_at_note: note,
        };
        await updateObjectInstance(APPROVAL_OBJECT_TYPE_ID, selectedCase.case_no, nextData);
        await indexObjectTypeToNeo4j(APPROVAL_OBJECT_TYPE_ID, NEO4J_DATASOURCE_ID);
        toast.success(t('approvalSaved'));
        setApprovalOpinion('');
        await loadCases();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : t('approvalFailed'));
      } finally {
        setApproving(null);
      }
    },
    [selectedCase, approving, approvalOpinion, loadCases, t]
  );

  // --- load graph for the selected case ---
  useEffect(() => {
    if (!selectedCaseNo) {
      setGraphData(null);
      return;
    }
    let cancelled = false;
    setLoadingGraph(true);
    setSelectedNode(null);
    executeCypherQuery(buildGraphCypher(selectedCaseNo))
      .then((data) => {
        if (cancelled) return;
        setGraphData(rowsToGraph(data.rows));
      })
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : t('toastGraphFailed'));
        setGraphData({ nodes: [], links: [] });
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCaseNo, t]);

  // --- graph sizing ---
  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setGraphSize({ width: Math.round(width), height: Math.round(height) });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fullscreen, graphData]);

  useEffect(() => {
    const g = graphRef.current;
    if (g && graphData) {
      const charge = g.d3Force('charge');
      if (charge && typeof charge.strength === 'function') charge.strength(-420);
      const link = g.d3Force('link');
      if (link && typeof link.distance === 'function') link.distance(110);
    }
  }, [graphData]);

  // ESC exits fullscreen / closes node detail / closes template modal
  useEffect(() => {
    if (!fullscreen && !selectedNode && !showTemplateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTemplateModal) setShowTemplateModal(false);
        else if (selectedNode) setSelectedNode(null);
        else if (fullscreen) setFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, selectedNode, showTemplateModal]);

  // --- pipeline stepper state ---
  const stageState = useMemo(() => {
    const currentIndex = selectedCase ? STAGE_ORDER.indexOf(selectedCase.stage as (typeof STAGE_ORDER)[number]) : -1;
    const done = selectedCase?.stage_status === '已完成';
    const returned = selectedCase?.stage_status === '已退回';
    // When the current stage is completed, treat the next stage as active.
    const activeIndex =
      currentIndex < 0 ? -1 : done && currentIndex < STAGE_ORDER.length - 1 ? currentIndex + 1 : currentIndex;
    const doneUpTo = currentIndex < 0 ? -1 : done ? currentIndex : currentIndex - 1;
    return { currentIndex, activeIndex, doneUpTo, returned };
  }, [selectedCase]);

  const riskFlags = useMemo(() => {
    if (!selectedCase?.risk_flags) return [];
    return selectedCase.risk_flags.split(/[,，、;；\s]+/).filter(Boolean);
  }, [selectedCase]);

  const legendTypes = useMemo(() => {
    const present = new Set(graphData?.nodes.map((n) => n.label) ?? []);
    const ordered = KNOWN_TYPES.filter((typeName) => present.has(typeName));
    return ordered.length > 0 ? ordered : KNOWN_TYPES.filter((typeName) => typeName === 'ApprovalCase');
  }, [graphData]);

  const formatAmount = (v: number | string | null): string => {
    if (v == null || v === '') return t('noRiskFlags');
    const n = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(n)) return `${n.toLocaleString()} ${t('wanUnit')}`;
    return String(v);
  };

  const decisionMeta = selectedCase ? DECISION_MAP[selectedCase.decision] : undefined;

  const selectTemplate = (type: WorkflowType) => {
    setWorkflowType(type);
    setShowTemplateModal(false);
  };

  const stageLabel = (i: number) => t(`${workflowType === 'fraud' ? 'fraudStage_' : 'stage_'}${i}`);

  const zoomBy = (factor: number) => {
    const g = graphRef.current;
    if (g && typeof g.zoom === 'function') g.zoom(g.zoom() * factor, 200);
  };

  /** Expandable content shown below the stepper for the clicked stage (credit lens). */
  const renderStagePanel = (i: number) => {
    if (workflowType === 'fraud') {
      return <p className="ontology-workflow__stage-placeholder">{t('fraudStagePanel')}</p>;
    }
    switch (i) {
      case 0: // 受理与尽职调查 — due-diligence materials
        return (
          <div className="ontology-workflow__stage-block">
            <h4 className="ontology-workflow__stage-title">{t('stage0_ddTitle')}</h4>
            {ddLoading ? (
              <div className="ontology-workflow__stage-loading">
                <Loader2 size={15} className="ontology-workflow__spinner" aria-hidden />
                <span>{t('loading')}</span>
              </div>
            ) : ddDocs && ddDocs.length > 0 ? (
              <ul className="ontology-workflow__dd-list">
                {ddDocs.map((d) => (
                  <li key={d.id}>
                    <a
                      className="ontology-workflow__dd-item"
                      href={`/documents/view/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <FileText size={14} aria-hidden />
                      <span className="ontology-workflow__dd-name">{d.name}</span>
                      <span className="ontology-workflow__dd-type">{d.file_type?.toUpperCase() || 'DOC'}</span>
                      <ExternalLink size={12} aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ontology-workflow__stage-placeholder">{t('stage0_empty')}</p>
            )}
          </div>
        );
      case 1: // 合规审查 — three-check result cards
        return (
          <div className="ontology-workflow__stage-block">
            <h4 className="ontology-workflow__stage-title">{t('stage1_title')}</h4>
            <div className="ontology-workflow__check-grid">
              {[
                { Icon: GitBranch, tKey: 'stage1_ring' },
                { Icon: Users, tKey: 'stage1_penetration' },
                { Icon: ShieldCheck, tKey: 'stage1_exposure' },
              ].map(({ Icon, tKey }) => (
                <div key={tKey} className="ontology-workflow__check-card">
                  <div className="ontology-workflow__check-head">
                    <Icon size={16} aria-hidden />
                    <span>{t(`${tKey}_title`)}</span>
                  </div>
                  <p className="ontology-workflow__check-concl">{t(`${tKey}_concl`)}</p>
                  <span className="ontology-workflow__check-hint">{t('stage1_askHint')}</span>
                </div>
              ))}
            </div>
          </div>
        );
      case 2: // 授信审议 — deliberation summary
        return (
          <div className="ontology-workflow__stage-block">
            <h4 className="ontology-workflow__stage-title">{t('stage2_title')}</h4>
            <p className="ontology-workflow__stage-summary">{t('stage2_concl')}</p>
            <p className="ontology-workflow__stage-hint">{t('stage2_reportHint')}</p>
          </div>
        );
      case 3: // 审批决议 — HITL approval card
        return (
          <div className="ontology-workflow__stage-block">
            <h4 className="ontology-workflow__stage-title">{t('approvalHeading')}</h4>
            <p className="ontology-workflow__stage-hint">{t('approvalHint')}</p>
            <textarea
              className="ontology-workflow__approval-opinion"
              value={approvalOpinion}
              onChange={(e) => setApprovalOpinion(e.target.value)}
              placeholder={t('approvalOpinionPlaceholder')}
              rows={2}
              disabled={!!approving}
            />
            <div className="ontology-workflow__approval-actions">
              <button
                type="button"
                className="ontology-workflow__approval-btn ontology-workflow__approval-btn--approve"
                disabled={!!approving}
                onClick={() => void submitDecision('通过')}
              >
                {approving === '通过' ? (
                  <Loader2 size={14} className="ontology-workflow__spinner" aria-hidden />
                ) : (
                  <Check size={14} aria-hidden />
                )}
                {t('approveBtn')}
              </button>
              <button
                type="button"
                className="ontology-workflow__approval-btn ontology-workflow__approval-btn--conditional"
                disabled={!!approving}
                onClick={() => void submitDecision('有条件通过')}
              >
                {approving === '有条件通过' ? (
                  <Loader2 size={14} className="ontology-workflow__spinner" aria-hidden />
                ) : (
                  <AlertTriangle size={14} aria-hidden />
                )}
                {t('conditionalBtn')}
              </button>
              <button
                type="button"
                className="ontology-workflow__approval-btn ontology-workflow__approval-btn--reject"
                disabled={!!approving}
                onClick={() => void submitDecision('否决')}
              >
                {approving === '否决' ? (
                  <Loader2 size={14} className="ontology-workflow__spinner" aria-hidden />
                ) : (
                  <X size={14} aria-hidden />
                )}
                {t('rejectBtn')}
              </button>
            </div>
          </div>
        );
      case 4: // 贷后管理 — pledge-ratio monitor
        return (
          <div className="ontology-workflow__stage-block">
            <h4 className="ontology-workflow__stage-title">{t('stage4_title')}</h4>
            <div className="ontology-workflow__pledge-card">
              <AlertTriangle size={16} aria-hidden />
              <p>{t('stage4_body')}</p>
            </div>
            <a
              className="ontology-workflow__stage-link"
              href={`/ontology/datasets/${MARKET_DATASET_ID}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <TrendingUp size={13} aria-hidden />
              {t('stage4_link')}
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="ontology-workflow">
      <header className="ontology-workflow__header">
        <div className="ontology-workflow__header-bar">
          <div className="ontology-workflow__title">
            {workflowType === 'fraud' ? (
              <ShieldAlert size={20} strokeWidth={1.75} aria-hidden />
            ) : (
              <Workflow size={20} strokeWidth={1.75} aria-hidden />
            )}
            <h1>{t(workflowType === 'fraud' ? 'fraudTitle' : 'title')}</h1>
          </div>
          <button
            type="button"
            className="ontology-workflow__new-btn"
            onClick={() => setShowTemplateModal(true)}
          >
            <Plus size={16} aria-hidden />
            {t('newWorkflow')}
          </button>
        </div>
        <p className="ontology-workflow__subtitle">{t(workflowType === 'fraud' ? 'fraudSubtitle' : 'subtitle')}</p>
      </header>

      {loadingCases ? (
        <div className="ontology-workflow__state">
          <Loader2 size={18} className="ontology-workflow__spinner" aria-hidden />
          <span>{t('loading')}</span>
        </div>
      ) : cases.length === 0 ? (
        <div className="ontology-workflow__state ontology-workflow__state--empty">
          <p className="ontology-workflow__empty-title">{t('emptyCases')}</p>
          <p className="ontology-workflow__empty-hint">{t('emptyCasesHint')}</p>
        </div>
      ) : (
        <div className="ontology-workflow__body">
          {workflowType === 'fraud' && (
            <div className="ontology-workflow__fraud-banner" role="note">
              <ShieldAlert size={16} aria-hidden />
              <span>{t('fraudBanner')}</span>
            </div>
          )}

          {/* --- case summary + selector --- */}
          <section className="ontology-workflow__summary">
            <div className="ontology-workflow__summary-head">
              {cases.length > 1 ? (
                <label className="ontology-workflow__case-select">
                  <span>{t('caseSelector')}</span>
                  <select value={selectedCaseNo} onChange={(e) => setSelectedCaseNo(e.target.value)}>
                    {cases.map((c) => (
                      <option key={c.case_no} value={c.case_no}>
                        {c.case_no} · {c.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="ontology-workflow__case-single">
                  <span className="ontology-workflow__case-no">{selectedCase?.case_no}</span>
                </div>
              )}
              {decisionMeta && (
                <span
                  className={`ontology-workflow__decision ontology-workflow__decision--${decisionMeta.tone}`}
                  title={t('decision')}
                >
                  {t('decision')}: {t(decisionMeta.key)}
                </span>
              )}
            </div>

            {selectedCase && (
              <>
                <h2 className="ontology-workflow__case-title">{selectedCase.title}</h2>
                <div className="ontology-workflow__meta">
                  <div className="ontology-workflow__meta-item">
                    <span className="ontology-workflow__meta-label">{t('applicant')}</span>
                    <span className="ontology-workflow__meta-value">{selectedCase.applicant || '—'}</span>
                  </div>
                  <div className="ontology-workflow__meta-item">
                    <span className="ontology-workflow__meta-label">{t('amount')}</span>
                    <span className="ontology-workflow__meta-value ontology-workflow__meta-value--amount">
                      {formatAmount(selectedCase.amount_wan)}
                    </span>
                  </div>
                  <div className="ontology-workflow__meta-item">
                    <span className="ontology-workflow__meta-label">{t('facility')}</span>
                    <span className="ontology-workflow__meta-value">{selectedCase.facility_no || '—'}</span>
                  </div>
                  <div className="ontology-workflow__meta-item">
                    <span className="ontology-workflow__meta-label">{t('owner')}</span>
                    <span className="ontology-workflow__meta-value">{selectedCase.owner || '—'}</span>
                  </div>
                </div>

                <div className="ontology-workflow__risks">
                  <span className="ontology-workflow__meta-label">{t('riskFlags')}</span>
                  {riskFlags.length === 0 ? (
                    <span className="ontology-workflow__risks-none">{t('noRiskFlags')}</span>
                  ) : (
                    <div className="ontology-workflow__risk-chips">
                      {riskFlags.map((rf, i) => (
                        <span key={i} className="ontology-workflow__risk-chip">
                          <AlertTriangle size={12} aria-hidden />
                          {rf}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {selectedCase.updated_at_note && (
                  <p className="ontology-workflow__update-note">
                    <span className="ontology-workflow__meta-label">{t('updatedNote')}</span>
                    {selectedCase.updated_at_note}
                  </p>
                )}
              </>
            )}
          </section>

          {/* --- five-stage pipeline stepper --- */}
          <section className="ontology-workflow__pipeline" aria-label={t(workflowType === 'fraud' ? 'fraudPipelineHeading' : 'pipelineHeading')}>
            <h3 className="ontology-workflow__section-title">{t(workflowType === 'fraud' ? 'fraudPipelineHeading' : 'pipelineHeading')}</h3>
            <ol className="ontology-workflow__stepper">
              {STAGE_ORDER.map((_stage, i) => {
                const isDone = i <= stageState.doneUpTo;
                const isActive = i === stageState.activeIndex;
                const state = isActive
                  ? stageState.returned
                    ? 'returned'
                    : 'active'
                  : isDone
                    ? 'done'
                    : 'pending';
                const isOpen = selectedStage === i;
                return (
                  <li
                    key={i}
                    className={`ontology-workflow__step ontology-workflow__step--${state}${
                      isOpen ? ' ontology-workflow__step--open' : ''
                    }`}
                  >
                    <button
                      type="button"
                      className="ontology-workflow__step-btn"
                      aria-expanded={isOpen}
                      onClick={() => setSelectedStage((prev) => (prev === i ? null : i))}
                    >
                      <span className="ontology-workflow__step-marker">
                        {isDone ? <Check size={14} aria-hidden /> : <span>{i + 1}</span>}
                      </span>
                      <span className="ontology-workflow__step-body">
                        <span className="ontology-workflow__step-name">{stageLabel(i)}</span>
                        {isActive && selectedCase?.stage_status && (
                          <span className="ontology-workflow__step-status">
                            {t(STATUS_MAP[selectedCase.stage_status] ?? 'statusInProgress')}
                          </span>
                        )}
                      </span>
                    </button>
                    {i < STAGE_ORDER.length - 1 && <span className="ontology-workflow__step-connector" aria-hidden />}
                  </li>
                );
              })}
            </ol>
            {selectedStage !== null && (
              <div className="ontology-workflow__stage-panel">{renderStagePanel(selectedStage)}</div>
            )}
          </section>

          {/* --- data-silo fusion band: N silos (inputs) fused into 1 graph (output) --- */}
          {selectedCase && (
            <section className="ontology-workflow__fusion" aria-label={t('fusionHeading')}>
              <h3 className="ontology-workflow__section-title">{t('fusionHeading')}</h3>

              <p className="ontology-workflow__fusion-headline">
                <span className="ontology-workflow__fusion-headline-in">
                  {t('fusionHeadlineIn', { count: SILOS.length })}
                </span>
                <span className="ontology-workflow__fusion-headline-arrow" aria-hidden>→</span>
                <span className="ontology-workflow__fusion-headline-out">
                  {t('fusionHeadlineOut', { entities: 25, relations: 35 })}
                </span>
              </p>

              <div className="ontology-workflow__silo-grid">
                {SILOS.map(({ key, Icon, count, unitKey, href }) => {
                  const url = key === 'credit' ? creditDocUrl : href;
                  return (
                    <div key={key} className="ontology-workflow__silo-card">
                      <div className="ontology-workflow__silo-head">
                        <Icon size={16} className="ontology-workflow__silo-icon" aria-hidden />
                        <span className="ontology-workflow__silo-name">{t(`silo_${key}_name`)}</span>
                        <span className="ontology-workflow__silo-type">{t(`silo_${key}_type`)}</span>
                      </div>
                      <div className="ontology-workflow__silo-count">
                        <span className="ontology-workflow__silo-num">{count.toLocaleString()}</span>
                        <span className="ontology-workflow__silo-unit">{t(unitKey)}</span>
                      </div>
                      <p className="ontology-workflow__silo-contrib">
                        <span className="ontology-workflow__silo-contrib-arrow" aria-hidden>→</span>
                        {t(`silo_${key}_desc`)}
                      </p>
                      {url && (
                        <a
                          className="ontology-workflow__silo-link"
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('viewSource')}
                          <ExternalLink size={12} aria-hidden />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="ontology-workflow__fusion-note">{t('fusionNote')}</p>
            </section>
          )}

          {/* --- case graph --- */}
          <section className="ontology-workflow__graph-section">
            <h3 className="ontology-workflow__section-title">{t('graphHeading')}</h3>
            <div
              ref={graphContainerRef}
              className={`ontology-workflow__graph ${fullscreen ? 'ontology-workflow__graph--fullscreen' : ''}`}
            >
              {loadingGraph ? (
                <div className="ontology-workflow__graph-state">
                  <Loader2 size={18} className="ontology-workflow__spinner" aria-hidden />
                  <span>{t('loading')}</span>
                </div>
              ) : !graphData || graphData.nodes.length === 0 ? (
                <div className="ontology-workflow__graph-state">{t('graphEmpty')}</div>
              ) : (
                <>
                  {/* legend */}
                  <div className="ontology-workflow__legend">
                    <span className="ontology-workflow__legend-title">{t('legend')}</span>
                    {legendTypes.map((typeName) => (
                      <span key={typeName} className="ontology-workflow__legend-item">
                        <span
                          className="ontology-workflow__legend-dot"
                          style={{ background: NODE_TYPE_COLORS[typeName] ?? '#64748b' }}
                        />
                        {t(`type_${typeName}`, { defaultValue: typeName })}
                      </span>
                    ))}
                  </div>

                  {/* controls */}
                  <div className="ontology-workflow__graph-controls">
                    <button type="button" onClick={() => zoomBy(1.3)} title={t('zoomIn')} aria-label={t('zoomIn')}>
                      <ZoomIn size={16} aria-hidden />
                    </button>
                    <button type="button" onClick={() => zoomBy(1 / 1.3)} title={t('zoomOut')} aria-label={t('zoomOut')}>
                      <ZoomOut size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const g = graphRef.current;
                        if (g && typeof g.zoomToFit === 'function') g.zoomToFit(300, 60);
                      }}
                      title={t('zoomToFit')}
                      aria-label={t('zoomToFit')}
                    >
                      <Expand size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const g = graphRef.current;
                        if (g && typeof g.d3ReheatSimulation === 'function') g.d3ReheatSimulation();
                      }}
                      title={t('reheat')}
                      aria-label={t('reheat')}
                    >
                      <RotateCcw size={16} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setFullscreen((v) => !v)}
                      title={fullscreen ? t('exitFullscreen') : t('fullscreen')}
                      aria-label={fullscreen ? t('exitFullscreen') : t('fullscreen')}
                    >
                      {fullscreen ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
                    </button>
                  </div>

                  {/* node detail panel */}
                  {selectedNode && (
                    <div className="ontology-workflow__node-detail" role="dialog" aria-label={t('nodeDetails')}>
                      <div className="ontology-workflow__node-detail-head">
                        <span
                          className="ontology-workflow__node-detail-badge"
                          style={{ background: NODE_TYPE_COLORS[selectedNode.label] ?? '#64748b' }}
                        >
                          {t(`type_${selectedNode.label}`, { defaultValue: selectedNode.label })}
                        </span>
                        <button
                          type="button"
                          className="ontology-workflow__node-detail-close"
                          onClick={() => setSelectedNode(null)}
                          title={t('closeDetails')}
                          aria-label={t('closeDetails')}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      </div>
                      <div className="ontology-workflow__node-detail-title">{selectedNode.name}</div>
                      <dl className="ontology-workflow__node-detail-props">
                        {Object.entries(selectedNode.props)
                          .filter(([, v]) => v != null && v !== '')
                          .map(([k, v]) => (
                            <div key={k} className="ontology-workflow__node-detail-row">
                              <dt>{k}</dt>
                              <dd>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</dd>
                            </div>
                          ))}
                      </dl>
                    </div>
                  )}

                  <ForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    width={graphSize.width || undefined}
                    height={graphSize.height || undefined}
                    cooldownTicks={120}
                    onEngineStop={() => {
                      const g = graphRef.current;
                      if (g && typeof g.zoomToFit === 'function') g.zoomToFit(400, 60);
                    }}
                    onNodeClick={(node) => setSelectedNode(node as WFNode)}
                    onBackgroundClick={() => setSelectedNode(null)}
                    nodeLabel={(n) => (n as WFNode).name}
                    linkLabel={(l) => (l as WFLink).relType}
                    linkColor={() => 'rgba(100,116,139,0.55)'}
                    linkWidth={1}
                    linkDirectionalArrowLength={5}
                    linkDirectionalArrowRelPos={1}
                    linkCurvature={0.12}
                    backgroundColor="#f8fafc"
                    nodeCanvasObject={(node, ctx, globalScale) => {
                      const n = node as WFNode;
                      const accent = NODE_TYPE_COLORS[n.label] ?? '#64748b';
                      const isCase = n.isCase;
                      const fontSize = Math.max(isCase ? 13 : 10, (isCase ? 15 : 12) / globalScale);
                      ctx.font = `${isCase ? '600 ' : ''}${fontSize}px system-ui, sans-serif`;
                      const label = (n.name ?? n.id).slice(0, 28);
                      const textWidth = ctx.measureText(label).width;
                      const padX = isCase ? 12 : 8;
                      const w = textWidth + padX * 2;
                      const h = fontSize + (isCase ? 14 : 8);
                      const x = (n.x ?? 0) - w / 2;
                      const y = (n.y ?? 0) - h / 2;
                      ctx.beginPath();
                      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, isCase ? 8 : 4);
                      else ctx.rect(x, y, w, h);
                      ctx.fillStyle = isCase ? 'rgba(255, 248, 235, 0.98)' : 'rgba(255, 255, 255, 0.96)';
                      ctx.fill();
                      ctx.strokeStyle = accent;
                      ctx.lineWidth = (isCase ? 3 : 1.5) / globalScale;
                      ctx.stroke();
                      ctx.textAlign = 'center';
                      ctx.textBaseline = 'middle';
                      ctx.fillStyle = isCase ? '#7c4a03' : '#1f2937';
                      ctx.fillText(label, n.x ?? 0, n.y ?? 0);
                    }}
                    nodePointerAreaPaint={(node, color, ctx, globalScale) => {
                      const n = node as WFNode;
                      const isCase = n.isCase;
                      const fontSize = Math.max(isCase ? 13 : 10, (isCase ? 15 : 12) / globalScale);
                      ctx.font = `${fontSize}px system-ui, sans-serif`;
                      const label = (n.name ?? n.id).slice(0, 28);
                      const textWidth = ctx.measureText(label).width;
                      const padX = isCase ? 12 : 8;
                      const w = textWidth + padX * 2;
                      const h = fontSize + (isCase ? 14 : 8);
                      ctx.fillStyle = color;
                      ctx.fillRect((n.x ?? 0) - w / 2, (n.y ?? 0) - h / 2, w, h);
                    }}
                  />
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {/* AI 助手浮窗已提升为全局(MainLayout),此处不再单独渲染,避免重复 FAB。 */}

      {/* --- template picker modal --- */}
      {showTemplateModal && (
        <div
          className="ontology-workflow__modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('templateModalTitle')}
          onClick={() => setShowTemplateModal(false)}
        >
          <div className="ontology-workflow__modal" onClick={(e) => e.stopPropagation()}>
            <div className="ontology-workflow__modal-head">
              <h2>{t('templateModalTitle')}</h2>
              <button
                type="button"
                className="ontology-workflow__modal-close"
                onClick={() => setShowTemplateModal(false)}
                aria-label={t('closeDetails')}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <p className="ontology-workflow__modal-sub">{t('templateModalSub')}</p>
            <div className="ontology-workflow__template-cards">
              <button
                type="button"
                className={`ontology-workflow__template-card${workflowType === 'credit' ? ' ontology-workflow__template-card--active' : ''}`}
                onClick={() => selectTemplate('credit')}
              >
                <span className="ontology-workflow__template-icon ontology-workflow__template-icon--credit">
                  <Workflow size={22} aria-hidden />
                </span>
                <span className="ontology-workflow__template-name">{t('templateCreditTitle')}</span>
                <span className="ontology-workflow__template-desc">{t('templateCreditDesc')}</span>
              </button>
              <button
                type="button"
                className={`ontology-workflow__template-card${workflowType === 'fraud' ? ' ontology-workflow__template-card--active' : ''}`}
                onClick={() => selectTemplate('fraud')}
              >
                <span className="ontology-workflow__template-icon ontology-workflow__template-icon--fraud">
                  <ShieldAlert size={22} aria-hidden />
                </span>
                <span className="ontology-workflow__template-name">{t('templateFraudTitle')}</span>
                <span className="ontology-workflow__template-desc">{t('templateFraudDesc')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
