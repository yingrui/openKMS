import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, FilePlus2, Save, Send, X } from "lucide-react";
import { toast } from "sonner";
import { PythonCodeEditor } from "../../../components/code/PythonCodeEditor";
import { WorkforceAreaNav } from "../../../components/workforce/WorkforceAreaNav";
import {
  deleteWorkforceSkillFile,
  deprecateWorkforceSkillVersion,
  getWorkforceSkill,
  publishWorkforceSkill,
  writeWorkforceSkillFile,
  type WorkforceSkillDetail,
} from "../../../data/workforceSkillsApi";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { Dialog, FormField } from "../../../styles/design-system";
import {
  joinSkillFile,
  splitSkillFile,
  type SkillFrontMatter,
} from "./skillMarkdown";
import "./workforceSkills.scss";

const SKILL_FILE = "SKILL.md";

/**
 * Writing a workforce skill: a `SKILL.md` plus optional Python, saved as a draft and released as a
 * version an agent can install.
 *
 * The frontmatter is a form rather than raw YAML because three of its values are things the platform
 * acts on (name, the description the prompt always carries, the entrypoint it will run), and a form
 * can say what each one needs. The body and the scripts stay text.
 */
export function WorkforceSkillEditorPage() {
  const { t } = useTranslation("workforce");
  const { skillId = "" } = useParams();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<WorkforceSkillDetail | null>(null);
  const [files, setFiles] = useState<Record<string, string>>({});
  const [activeFile, setActiveFile] = useState(SKILL_FILE);
  const [frontmatter, setFrontmatter] = useState<SkillFrontMatter>({
    name: skillId,
    description: "",
    entrypoint: "",
    subcommands: [],
  });
  const [body, setBody] = useState("");
  const [subcommandsText, setSubcommandsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showAddFile, setShowAddFile] = useState(false);
  const [newPath, setNewPath] = useState("scripts/cli.py");

  /**
   * Puts a server payload on screen: files, the open file, and the frontmatter fields. Setters only,
   * so the identity is stable and `reload` does not have to depend on the rendered state.
   */
  const applyDetail = useCallback((next: WorkforceSkillDetail) => {
    setDetail(next);
    setActiveFile((current) => (next.files[current] ? current : SKILL_FILE));
    const parsed = splitSkillFile(next.files[SKILL_FILE] ?? '');
    const frontmatterFields = { ...parsed.frontmatter, name: next.id };
    setFrontmatter(frontmatterFields);
    setBody(parsed.body);
    setSubcommandsText(parsed.frontmatter.subcommands.join(', '));
    // Compare against the file as the editor would write it, so "nothing changed" means nothing
    // changed: a stray trailing newline must not read as an edit someone has to publish.
    setFiles({ ...next.files, [SKILL_FILE]: joinSkillFile(frontmatterFields, parsed.body) });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      applyDetail(await getWorkforceSkill(skillId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyDetail, skillId, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const draftFrontmatter = useMemo<SkillFrontMatter>(
    () => ({
      name: skillId,
      description: frontmatter.description,
      entrypoint: frontmatter.entrypoint,
      subcommands: subcommandsText
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean),
    }),
    [frontmatter.description, frontmatter.entrypoint, skillId, subcommandsText],
  );

  /** What saving would write: the composed `SKILL.md` plus every other file as it is in the editor. */
  const pendingFiles = useMemo<Record<string, string>>(
    () => ({ ...files, [SKILL_FILE]: joinSkillFile(draftFrontmatter, body) }),
    [body, draftFrontmatter, files],
  );

  const dirty = useMemo(() => {
    if (!detail) return false;
    return (
      Object.keys(pendingFiles).some(
        (path) => pendingFiles[path] !== detail.files[path],
      ) || Object.keys(detail.files).some((path) => !(path in pendingFiles))
    );
  }, [detail, pendingFiles]);

  const save = async () => {
    setSaving(true);
    try {
      let next: WorkforceSkillDetail | null = null;
      for (const [path, content] of Object.entries(pendingFiles)) {
        if (detail && detail.files[path] === content) continue;
        next = await writeWorkforceSkillFile(skillId, path, content);
      }
      if (next) applyDetail(next);
      else await reload();
      toast.success(t("skills.saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("skills.saveFailed"));
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      if (dirty) await save();
      const next = await publishWorkforceSkill(skillId);
      applyDetail(next);
      toast.success(
        t("skills.published", { version: next.versions[0]?.version ?? "" }),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("skills.publishFailed"));
    } finally {
      setPublishing(false);
    }
  };

  const removeFile = async (path: string) => {
    const ok = await confirm({
      title: t('skills.removeFile'),
      message: t('skills.removeFileConfirm', { path }),
      confirmLabel: t('skills.removeFile'),
      danger: true,
    });
    if (!ok) return;
    const saved = Boolean(detail?.files[path] !== undefined);
    if (!saved) {
      setFiles((prev) => {
        const next = { ...prev };
        delete next[path];
        return next;
      });
      setActiveFile(SKILL_FILE);
      return;
    }
    try {
      applyDetail(await deleteWorkforceSkillFile(skillId, path));
      toast.success(t('skills.fileRemoved'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('skills.removeFileFailed'));
    }
  };

  const addFile = async () => {
    const path = newPath.trim();
    if (!path) return;
    setFiles((prev) => ({ ...prev, [path]: prev[path] ?? "" }));
    setActiveFile(path);
    setShowAddFile(false);
    setNewPath("scripts/cli.py");
  };

  const deprecate = async (version: string) => {
    const ok = await confirm({
      title: t("skills.deprecate"),
      message: t("skills.deprecateConfirm", { version }),
      confirmLabel: t("skills.deprecate"),
      danger: true,
    });
    if (!ok) return;
    try {
      applyDetail(await deprecateWorkforceSkillVersion(skillId, version));
      toast.success(t("skills.deprecated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("skills.deprecateFailed"));
    }
  };

  const activeContent = files[activeFile] ?? "";
  const isSkillFile = activeFile === SKILL_FILE;
  const isPython = activeFile.endsWith(".py");
  const latestPublished = detail?.versions.find(
    (v) => v.status === "published",
  );

  return (
    <div className="workforce-skills-page">
      <WorkforceAreaNav />
      <Link to="/workforce/skills" className="workforce-skill-back">
        <ArrowLeft size={16} aria-hidden />
        <span>{t("skills.backToRegistry")}</span>
      </Link>

      {loading && <p className="ds-resource-list-loading">{t("loading")}</p>}

      {!loading && detail && (
        <>
          <div className="page-header workforce-skill-header">
            <div>
              <h1>{detail.name}</h1>
              <p className="page-subtitle">
                {detail.has_draft
                  ? t("skills.draftSubtitle", { version: detail.draft_version })
                  : latestPublished
                    ? t("skills.releasedSubtitle", {
                        version: latestPublished.version,
                      })
                    : t("skills.unpublishedSubtitle")}
              </p>
            </div>
            <div className="workforce-skill-header__actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void save()}
                disabled={saving || publishing || !dirty}
              >
                <Save size={16} aria-hidden />
                <span>{saving ? t("saving") : t("skills.saveDraft")}</span>
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void publish()}
                disabled={saving || publishing || !(detail.has_draft || dirty)}
                title={detail.has_draft || dirty ? undefined : t('skills.publishNeedsChange')}
              >
                <Send size={16} aria-hidden />
                <span>
                  {t("skills.publish", { version: detail.draft_version })}
                </span>
              </button>
            </div>
          </div>

          <div className="workforce-skill-editor">
            <aside className="workforce-skill-files">
              <div className="workforce-skill-files__head">
                <span>{t("skills.files")}</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setShowAddFile(true)}
                >
                  <FilePlus2 size={16} aria-hidden />
                  <span className="ds-compact-label">
                    {t("skills.addFile")}
                  </span>
                </button>
              </div>
              <ul>
                {Object.keys(files)
                  .sort()
                  .map((path) => (
                    <li key={path} className="workforce-skill-file-row">
                      <button
                        type="button"
                        className={`workforce-skill-file${path === activeFile ? " active" : ""}`}
                        onClick={() => setActiveFile(path)}
                      >
                        {path}
                      </button>
                      {path === SKILL_FILE ? null : (
                        <button
                          type="button"
                          className="btn btn-ghost workforce-skill-file__remove"
                          aria-label={t("skills.removeFileNamed", { path })}
                          title={t("skills.removeFileNamed", { path })}
                          onClick={() => void removeFile(path)}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </aside>

            <section className="workforce-skill-canvas">
              {isSkillFile ? (
                <>
                  <FormField
                    label={t("skills.descriptionLabel")}
                    hint={t("skills.descriptionHint")}
                  >
                    <textarea
                      className="ds-control"
                      rows={2}
                      value={frontmatter.description}
                      onChange={(e) =>
                        setFrontmatter((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                    />
                  </FormField>
                  <div className="workforce-skill-row">
                    <FormField
                      label={t("skills.entrypointLabel")}
                      hint={t("skills.entrypointHint")}
                    >
                      <input
                        className="ds-control"
                        value={frontmatter.entrypoint}
                        placeholder={t('skills.entrypointPlaceholder')}
                        onChange={(e) =>
                          setFrontmatter((prev) => ({
                            ...prev,
                            entrypoint: e.target.value,
                          }))
                        }
                      />
                    </FormField>
                    <FormField
                      label={t("skills.subcommandsLabel")}
                      hint={t("skills.subcommandsHint")}
                    >
                      <input
                        className="ds-control"
                        value={subcommandsText}
                        placeholder={t('skills.subcommandsPlaceholder')}
                        onChange={(e) => setSubcommandsText(e.target.value)}
                      />
                    </FormField>
                  </div>
                  <FormField
                    label={t("skills.bodyLabel")}
                    hint={t("skills.bodyHint")}
                  >
                    <textarea
                      className="ds-control workforce-skill-body"
                      rows={16}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t("skills.bodyPlaceholder")}
                    />
                  </FormField>
                </>
              ) : isPython ? (
                <div className="workforce-skill-code">
                  <PythonCodeEditor
                    value={activeContent}
                    onChange={(value) =>
                      setFiles((prev) => ({ ...prev, [activeFile]: value }))
                    }
                    ariaLabel={activeFile}
                  />
                </div>
              ) : (
                <textarea
                  className="ds-control workforce-skill-body"
                  rows={16}
                  value={activeContent}
                  onChange={(e) =>
                    setFiles((prev) => ({
                      ...prev,
                      [activeFile]: e.target.value,
                    }))
                  }
                  aria-label={activeFile}
                />
              )}

              {(detail.blocking.length > 0 || detail.warnings.length > 0) && (
                <div className="workforce-skill-report">
                  {detail.blocking.map((item) => (
                    <p
                      key={item}
                      className="workforce-skill-report__item is-blocking"
                    >
                      {item}
                    </p>
                  ))}
                  {detail.warnings.map((item) => (
                    <p key={item} className="workforce-skill-report__item">
                      {item}
                    </p>
                  ))}
                  <p className="workforce-skill-report__note">
                    {t("skills.reportNote")}
                  </p>
                </div>
              )}
            </section>

            <aside className="workforce-skill-versions">
              <div className="workforce-skill-versions__head">
                {t("skills.versions")}
              </div>
              {detail.versions.length === 0 ? (
                <p className="workforce-skill-versions__empty">
                  {t("skills.noVersions")}
                </p>
              ) : (
                <ul>
                  {detail.versions.map((version) => (
                    <li key={version.version}>
                      <div className="workforce-skill-version">
                        <span className="workforce-skill-version__name">
                          {t("skills.chipVersion", {
                            version: version.version,
                          })}
                        </span>
                        <span
                          className={`workforce-skill-chip${
                            version.status === "deprecated"
                              ? " workforce-skill-chip--muted"
                              : ""
                          }`}
                        >
                          {version.status === "published"
                            ? t("skills.statusPublished")
                            : t("skills.statusDeprecated")}
                        </span>
                      </div>
                      {version.status === "published" ? (
                        <button
                          type="button"
                          className="btn btn-ghost workforce-skill-version__action"
                          onClick={() => void deprecate(version.version)}
                        >
                          {t("skills.deprecate")}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        </>
      )}

      <Dialog
        open={showAddFile}
        onClose={() => setShowAddFile(false)}
        title={t("skills.addFile")}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAddFile(false)}
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void addFile()}
            >
              {t("skills.addFile")}
            </button>
          </>
        }
      >
        <FormField
          label={t("skills.filePathLabel")}
          hint={t("skills.filePathHint")}
        >
          <input
            className="ds-control"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder={t('skills.entrypointPlaceholder')}
          />
        </FormField>
      </Dialog>
    </div>
  );
}
