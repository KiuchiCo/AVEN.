'use client';

import { useAuth } from '@clerk/nextjs';
import { useCallback } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import type { FileRecord } from './types';
import { connectionError } from '../connection-error';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');

async function failure(response: Response): Promise<never> {
  const body = await response.json().catch(() => null) as { message?: string } | null;
  throw new Error(body?.message ?? 'AVEN could not complete that request.');
}

export function useFilesApi() {
  const { getToken } = useAuth();
  const { workspace } = useWorkspaceSession();
  const root = `${apiBase}/workspaces/${workspace.id}/files`;

  const authorised = useCallback(async () => {
    const token = await getToken();
    if (!token || !apiBase) throw connectionError(token);
    return { Authorization: `Bearer ${token}` };
  }, [getToken]);

  const call = useCallback(async <T,>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
    const response = await fetch(`${root}${path}`, {
      method: init.method ?? 'GET', cache: 'no-store',
      headers: { ...(await authorised()), ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (!response.ok) return failure(response);
    return response.json() as Promise<T>;
  }, [authorised, root]);

  /** Sends the file as the raw request body. Content-Type stays octet-stream; the real type travels in X-File-Mime. */
  const upload = useCallback(async (file: File, options: { folderId?: string | null; replaceFileId?: string } = {}): Promise<FileRecord> => {
    const params = new URLSearchParams({ name: file.name });
    if (options.folderId) params.set('folderId', options.folderId);
    if (options.replaceFileId) params.set('replaceFileId', options.replaceFileId);
    const response = await fetch(`${root}/upload?${params.toString()}`, {
      method: 'POST', body: file,
      headers: { ...(await authorised()), 'Content-Type': 'application/octet-stream', 'X-File-Mime': file.type || 'application/octet-stream' },
    });
    if (!response.ok) return failure(response);
    return response.json() as Promise<FileRecord>;
  }, [authorised, root]);

  const fetchBlob = useCallback(async (fileId: string, query: { version?: number; inline?: boolean } = {}) => {
    const params = new URLSearchParams();
    if (query.version) params.set('version', String(query.version));
    if (query.inline) params.set('inline', '1');
    const response = await fetch(`${root}/${fileId}/download?${params.toString()}`, { headers: await authorised() });
    if (!response.ok) return failure(response);
    return response.blob();
  }, [authorised, root]);

  /** Downloads through a temporary link, because files need the sign-in header and so can't be plain links. */
  const download = useCallback(async (file: Pick<FileRecord, 'id' | 'name'>, version?: number) => {
    const url = URL.createObjectURL(await fetchBlob(file.id, { version }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = file.name; anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }, [fetchBlob]);

  const preview = useCallback(async (file: Pick<FileRecord, 'id'>) => {
    // The tab opens during the click itself: opened after the download, Safari (iPhone and iPad too) treats it as a pop-up and blocks it.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    try {
      const url = URL.createObjectURL(await fetchBlob(file.id, { inline: true }));
      if (tab) tab.location.href = url;
      else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = ''; anchor.click(); } // pop-ups blocked: save it instead of leaving AVEN
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (reason) { tab?.close(); throw reason; }
  }, [fetchBlob]);

  return { call, upload, download, preview, fetchBlob, workspaceId: workspace.id, role: workspace.role };
}
