/**
 * 结构化元数据区块 —— 文章 / 媒体详情页共用(与文档的 metadata 提取对齐)。
 * 读模式展示字段;编辑模式按字段类型输入;「提取」触发 LLM 抽取。
 * 受控:meta 由父组件持有;本组件只管 UI 态(编辑/提取/保存)。
 */
import { useMemo, useState } from 'react';
import { Sparkles, Loader2, Edit3, Save, X } from 'lucide-react';
import type { ExtractionSchemaDisplayField } from '../../data/channelUtils';
import './ContentMetadataSection.scss';

const HIDDEN_KEYS = new Set(['extracted_at', 'extraction_model_id']);

export interface ContentMetadataSectionProps {
  title?: string;
  meta: Record<string, unknown>;
  schemaFields: ExtractionSchemaDisplayField[];
  hasExtractionModel: boolean;
  /** 是否有可供抽取的内容(文章有 markdown / 媒体有转写稿或摘要)。 */
  canExtract: boolean;
  /** 抽取按钮禁用时的提示。 */
  extractHint?: string;
  /** 执行抽取(父组件内请求并更新 meta);返回告警。 */
  onExtract: () => Promise<{ warnings?: string[] }>;
  /** 保存编辑后的字段(父组件内请求并更新 meta)。 */
  onSave: (values: Record<string, unknown>) => Promise<void>;
}

function displayValue(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function ContentMetadataSection(props: ContentMetadataSectionProps) {
  const { meta, schemaFields, hasExtractionModel, canExtract, extractHint, onExtract, onSave } = props;
  const [extracting, setExtracting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [buffer, setBuffer] = useState<Record<string, unknown>>({});

  const fieldByKey = useMemo(() => {
    const m = new Map<string, ExtractionSchemaDisplayField>();
    schemaFields.forEach((f) => m.set(f.key, f));
    return m;
  }, [schemaFields]);

  const metaKeys = useMemo(() => {
    if (schemaFields.length > 0) return schemaFields.map((f) => f.key);
    return Object.keys(meta).filter((k) => !HIDDEN_KEYS.has(k));
  }, [schemaFields, meta]);

  const hasValues = metaKeys.some((k) => {
    const v = meta[k];
    return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });

  const handleExtract = async () => {
    setExtracting(true);
    setWarnings([]);
    try {
      const res = await onExtract();
      setWarnings(res.warnings ?? []);
    } finally {
      setExtracting(false);
    }
  };

  const enterEdit = () => {
    const init: Record<string, unknown> = {};
    metaKeys.forEach((k) => { init[k] = meta[k] ?? ''; });
    setBuffer(init);
    setEditMode(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave(buffer);
      setEditMode(false);
    } finally {
      setSaving(false);
    }
  };

  const setField = (key: string, value: unknown) => setBuffer((b) => ({ ...b, [key]: value }));

  const renderInput = (key: string) => {
    const f = fieldByKey.get(key);
    const type = f?.type ?? 'string';
    const val = buffer[key];
    if (type === 'date') {
      return <input type="date" value={String(val ?? '')} onChange={(e) => setField(key, e.target.value)} />;
    }
    if (type === 'integer' || type === 'number') {
      return <input type="number" value={String(val ?? '')} onChange={(e) => setField(key, e.target.value)} />;
    }
    if (type === 'boolean') {
      return (
        <select value={String(val ?? '')} onChange={(e) => setField(key, e.target.value === 'true')}>
          <option value="">—</option><option value="true">是</option><option value="false">否</option>
        </select>
      );
    }
    if (type === 'enum' && f?.enum) {
      return (
        <select value={String(val ?? '')} onChange={(e) => setField(key, e.target.value)}>
          <option value="">—</option>
          {f.enum.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (type === 'array' || type === 'list[object_type]') {
      const text = Array.isArray(val) ? val.join(', ') : String(val ?? '');
      return (
        <input
          type="text" placeholder="用逗号分隔" value={text}
          onChange={(e) => setField(key, e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
        />
      );
    }
    return <input type="text" value={String(val ?? '')} onChange={(e) => setField(key, e.target.value)} />;
  };

  const extractedAt = meta['extracted_at'] ? String(meta['extracted_at']).slice(0, 10) : null;

  return (
    <section className="cms-meta">
      <header className="cms-meta__head">
        <h3><Sparkles size={15} /> {props.title ?? '结构化元数据'}</h3>
        {metaKeys.length > 0 && !editMode && (
          <button type="button" className="cms-meta__btn" onClick={enterEdit}>
            <Edit3 size={13} /> 编辑
          </button>
        )}
      </header>

      {metaKeys.length === 0 ? (
        <p className="cms-meta__empty">
          暂无结构化字段。{!hasExtractionModel && '请先在频道设置里配置提取模型与字段。'}
        </p>
      ) : editMode ? (
        <>
          <dl className="cms-meta__grid">
            {metaKeys.map((k) => (
              <div key={k} className="cms-meta__row">
                <dt>{fieldByKey.get(k)?.label ?? k}</dt>
                <dd>{renderInput(k)}</dd>
              </div>
            ))}
          </dl>
          <div className="cms-meta__actions">
            <button type="button" className="cms-meta__btn cms-meta__btn--primary" onClick={save} disabled={saving}>
              {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />} 保存
            </button>
            <button type="button" className="cms-meta__btn" onClick={() => setEditMode(false)}>
              <X size={13} /> 取消
            </button>
          </div>
        </>
      ) : hasValues ? (
        <dl className="cms-meta__grid">
          {metaKeys.filter((k) => meta[k] != null && meta[k] !== '').map((k) => (
            <div key={k} className="cms-meta__row">
              <dt>{fieldByKey.get(k)?.label ?? k}</dt>
              <dd>
                {Array.isArray(meta[k])
                  ? (meta[k] as unknown[]).map((v, i) => <span key={i} className="cms-meta__pill">{String(v)}</span>)
                  : displayValue(meta[k])}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="cms-meta__empty">尚未提取。点击下方「提取」从内容中抽取结构化字段。</p>
      )}

      {warnings.length > 0 && (
        <ul className="cms-meta__warnings">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      <div className="cms-meta__foot">
        <button
          type="button"
          className="cms-meta__btn cms-meta__btn--extract"
          onClick={handleExtract}
          disabled={extracting || !canExtract || !hasExtractionModel}
          title={!hasExtractionModel ? '频道未配置提取模型' : !canExtract ? (extractHint ?? '暂无可提取内容') : '用 LLM 抽取结构化字段'}
        >
          {extracting ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />}
          {extracting ? '提取中…' : '提取'}
        </button>
        {extractedAt && <span className="cms-meta__stamp">上次提取 {extractedAt}</span>}
      </div>
    </section>
  );
}
