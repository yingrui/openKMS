/** Wiki spaces and pages API. */
import { config } from '../config';
import { getAuthHeaders } from './apiClient';

async function parseError(res: Response): Promise<string> {
  let msg = res.statusText;
  try {
    const j = await res.json();
    if (typeof j.detail === 'string') msg = j.detail;
  } catch {
    /* ignore */
  }
  return msg;
}

export interface WikiSpaceResponse {
  id: string;
  name: string;
  description?: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
}

export interface WikiSpaceListResponse {
  items: WikiSpaceResponse[];
  total: number;
}

export interface WikiPageResponse {
  id: string;
  wiki_space_id: string;
  path: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface WikiPageListResponse {
  items: WikiPageResponse[];
  total: number;
}

export interface WikiFileResponse {
  id: string;
  wiki_space_id: string;
  wiki_page_id?: string | null;
  filename: string;
  content_type?: string | null;
  size_bytes: number;
  created_at: string;
}

export interface WikiFileListResponse {
  items: WikiFileResponse[];
  total: number;
}

export async function fetchWikiSpaces(): Promise<WikiSpaceListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createWikiSpace(data: { name: string; description?: string }): Promise<WikiSpaceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateWikiSpace(
  spaceId: string,
  data: { name?: string; description?: string | null }
): Promise<WikiSpaceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteWikiSpace(spaceId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchWikiSpace(spaceId: string): Promise<WikiSpaceResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchWikiPages(spaceId: string, pathPrefix?: string): Promise<WikiPageListResponse> {
  const headers = await getAuthHeaders();
  const q = pathPrefix ? `?path_prefix=${encodeURIComponent(pathPrefix)}` : '';
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages${q}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchWikiPage(spaceId: string, pageId: string): Promise<WikiPageResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages/${pageId}`, {
    headers,
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function createWikiPage(
  spaceId: string,
  data: { path: string; title: string; body?: string; metadata?: Record<string, unknown> | null }
): Promise<WikiPageResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function updateWikiPage(
  spaceId: string,
  pageId: string,
  data: { title?: string; body?: string; metadata?: Record<string, unknown> | null }
): Promise<WikiPageResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages/${pageId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteWikiPage(spaceId: string, pageId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages/${pageId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

/** PUT upsert by logical path (e.g. guides/onboarding). */
export async function upsertWikiPageByPath(
  spaceId: string,
  path: string,
  data: { title: string; body?: string; metadata?: Record<string, unknown> | null }
): Promise<WikiPageResponse> {
  const headers = await getAuthHeaders();
  const enc = path
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/pages/by-path/${enc}`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function fetchWikiFiles(spaceId: string): Promise<WikiFileListResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/files`, { headers, credentials: 'include' });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export function wikiFileContentUrl(spaceId: string, fileId: string): string {
  return `${config.apiUrl}/api/wiki-spaces/${spaceId}/files/${fileId}/content`;
}

export async function uploadWikiFile(
  spaceId: string,
  file: File,
  wikiPageId?: string | null
): Promise<WikiFileResponse> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  fd.append('file', file);
  if (wikiPageId) fd.append('wiki_page_id', wikiPageId);
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/files`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

export async function deleteWikiFile(spaceId: string, fileId: string): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/files/${fileId}`, {
    method: 'DELETE',
    headers: { ...headers },
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export interface WikiVaultImportResponse {
  pages_upserted: number;
  files_uploaded: number;
  skipped: string[];
  warnings: string[];
}

/** Matches backend wiki_vault_import limits. */
export const VAULT_IMPORT_MAX_FILES = 2000;
export const VAULT_IMPORT_MAX_TOTAL_BYTES = 80 * 1024 * 1024;
export const VAULT_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;

export type VaultImportSkipOptions = {
  skipPdf: boolean;
  skipDocx: boolean;
  skipDoc: boolean;
  skipPptx: boolean;
  skipPpt: boolean;
};

export function defaultVaultImportSkipOptions(): VaultImportSkipOptions {
  return {
    skipPdf: false,
    skipDocx: false,
    skipDoc: false,
    skipPptx: false,
    skipPpt: false,
  };
}

/** Build lowercase extension set including leading dot (e.g. `.pdf`). */
export function vaultSkipExtensionSet(options: VaultImportSkipOptions): Set<string> {
  const s = new Set<string>();
  if (options.skipPdf) s.add('.pdf');
  if (options.skipDocx) s.add('.docx');
  if (options.skipDoc) s.add('.doc');
  if (options.skipPptx) s.add('.pptx');
  if (options.skipPpt) s.add('.ppt');
  return s;
}

function vaultPathEndsWithSkippedExtension(path: string, skipExt: ReadonlySet<string>): string | null {
  const lower = path.toLowerCase();
  for (const ext of skipExt) {
    if (lower.endsWith(ext)) return ext;
  }
  return null;
}

export type VaultImportPhase = 'binary' | 'markdown';

export type VaultImportProgress = {
  phase: VaultImportPhase;
  /** 1-based index across all files (binaries then markdown). */
  currentIndex: number;
  total: number;
  path: string;
  fileLoaded?: number;
  fileTotal?: number;
};

/** Path segments we never upload (matches backend wiki_vault_import). */
const VAULT_IMPORT_SKIP_SEGMENTS = new Set(['.obsidian', '.trash', '.git', '__macosx']);

export function vaultImportPathShouldSkip(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/');
  return norm.split('/').some((seg) => seg && VAULT_IMPORT_SKIP_SEGMENTS.has(seg.toLowerCase()));
}

/**
 * Vault-relative path for uploads. Directory picks set `webkitRelativePath` as
 * `<selected-folder-name>/...` — we drop that first segment so wiki paths match the vault root
 * (e.g. `MyVault/notes/a.md` → `notes/a.md`). Falls back to `file.name` when no directory path.
 */
export function vaultImportRelativePath(file: File): string {
  const raw =
    'webkitRelativePath' in file && (file as File & { webkitRelativePath?: string }).webkitRelativePath
      ? (file as File & { webkitRelativePath: string }).webkitRelativePath
      : file.name;
  const norm = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const usedWebkit =
    'webkitRelativePath' in file && !!(file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (!usedWebkit) return norm;
  const i = norm.indexOf('/');
  if (i === -1) return norm;
  return norm.slice(i + 1);
}

function parseXhrError(xhr: XMLHttpRequest): string {
  try {
    const j = JSON.parse(xhr.responseText) as { detail?: string };
    if (typeof j.detail === 'string') return j.detail;
  } catch {
    /* ignore */
  }
  return xhr.statusText || `HTTP ${xhr.status}`;
}

/** Upload one attachment; `vaultRelativePath` is stored as WikiFile.filename for link rewriting. */
export async function uploadWikiFileWithVaultPath(
  spaceId: string,
  file: File,
  vaultRelativePath: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<WikiFileResponse> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  fd.append('file', file, vaultRelativePath.replace(/\\/g, '/'));

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${config.apiUrl}/api/wiki-spaces/${spaceId}/files`);
    xhr.withCredentials = true;
    if (headers.Authorization) {
      xhr.setRequestHeader('Authorization', headers.Authorization);
    }
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded, ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as WikiFileResponse);
        } catch {
          reject(new Error('Invalid upload response'));
        }
      } else {
        reject(new Error(parseXhrError(xhr)));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(fd);
  });
}

export async function importWikiVaultMarkdownFile(
  spaceId: string,
  vaultPath: string,
  body: string
): Promise<{ wiki_path: string; warnings: string[] }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/import/vault/markdown-file`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ vault_path: vaultPath, body }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}

type VaultWorkEntry = { file: File; path: string };

/** Upload folder contents one file at a time (binaries first, then markdown with server-side link rewrite). */
export async function runWikiVaultFolderImportSequential(
  spaceId: string,
  files: readonly File[],
  onProgress: (p: VaultImportProgress) => void,
  skipExtensions: ReadonlySet<string> = new Set()
): Promise<WikiVaultImportResponse> {
  const skipped: string[] = [];
  const work: VaultWorkEntry[] = [];

  for (const f of files) {
    const path = vaultImportRelativePath(f);
    if (vaultImportPathShouldSkip(path)) {
      skipped.push(path);
      continue;
    }
    const skipExt = vaultPathEndsWithSkippedExtension(path, skipExtensions);
    if (skipExt) {
      skipped.push(`${path} (skipped ${skipExt})`);
      continue;
    }
    if (f.size > VAULT_IMPORT_MAX_FILE_BYTES) {
      skipped.push(`${path} (file too large)`);
      continue;
    }
    work.push({ file: f, path });
  }

  if (work.length === 0) {
    throw new Error(
      'No files to import (everything was skipped, too large, or under .git / .obsidian / .trash / __MACOSX).'
    );
  }
  if (work.length > VAULT_IMPORT_MAX_FILES) {
    throw new Error(`Too many files (max ${VAULT_IMPORT_MAX_FILES})`);
  }

  const totalBytes = work.reduce((s, e) => s + e.file.size, 0);
  if (totalBytes > VAULT_IMPORT_MAX_TOTAL_BYTES) {
    throw new Error(`Vault too large (max ${Math.round(VAULT_IMPORT_MAX_TOTAL_BYTES / (1024 * 1024))} MB total)`);
  }

  const binaries = work.filter((e) => !e.path.toLowerCase().endsWith('.md'));
  const markdowns = work.filter((e) => e.path.toLowerCase().endsWith('.md'));
  binaries.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));
  markdowns.sort((a, b) => a.path.localeCompare(b.path, undefined, { sensitivity: 'base' }));

  const total = binaries.length + markdowns.length;
  let idx = 0;
  const warnings: string[] = [];
  let files_uploaded = 0;
  let pages_upserted = 0;

  for (const b of binaries) {
    idx += 1;
    onProgress({
      phase: 'binary',
      currentIndex: idx,
      total,
      path: b.path,
      fileLoaded: 0,
      fileTotal: b.file.size,
    });
    await uploadWikiFileWithVaultPath(spaceId, b.file, b.path, (loaded, tot) => {
      onProgress({
        phase: 'binary',
        currentIndex: idx,
        total,
        path: b.path,
        fileLoaded: loaded,
        fileTotal: tot,
      });
    });
    files_uploaded += 1;
  }

  for (const m of markdowns) {
    idx += 1;
    onProgress({ phase: 'markdown', currentIndex: idx, total, path: m.path });
    const text = await m.file.text();
    const r = await importWikiVaultMarkdownFile(spaceId, m.path, text);
    warnings.push(...r.warnings);
    pages_upserted += 1;
  }

  return { pages_upserted, files_uploaded, skipped, warnings };
}

/** @param skipExtensions optional; paths ending with these extensions (e.g. `.pdf`) are not imported. */
export async function importWikiVaultFolder(
  spaceId: string,
  files: FileList | readonly File[],
  onProgress?: (p: VaultImportProgress) => void,
  skipExtensions?: ReadonlySet<string>
): Promise<WikiVaultImportResponse> {
  const cb = onProgress ?? (() => {});
  return runWikiVaultFolderImportSequential(spaceId, Array.from(files), cb, skipExtensions ?? new Set());
}

/** Import from a single zip (same layout as folder upload). */
export async function importWikiVaultZip(spaceId: string, zipFile: File): Promise<WikiVaultImportResponse> {
  const headers = await getAuthHeaders();
  const fd = new FormData();
  fd.append('archive', zipFile);
  const res = await fetch(`${config.apiUrl}/api/wiki-spaces/${spaceId}/import/vault`, {
    method: 'POST',
    headers: { ...headers },
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return res.json();
}
