'use client';

import { useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { WorkspaceSession } from './layout';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type WorkspaceOption = { id: string; name: string; role: string; memberCount: number; isPersonal: boolean };

export function WorkspaceSwitcher({ session }: { session: WorkspaceSession }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<WorkspaceOption[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        const response = await fetch(`${apiBase}/session/workspaces`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (response.ok && !cancelled) setItems(await response.json() as WorkspaceOption[]);
      } catch { if (!cancelled) setError('Could not load your workspaces.'); }
    })();
    return () => { cancelled = true; };
  }, [open, getToken]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setOpen(false); }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  async function switchWorkspace(workspaceId: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/active-workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId }) });
      if (!response.ok) throw new Error('Could not switch workspace.');
      setOpen(false); router.replace('/workspace'); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not switch workspace.'); }
    finally { setBusy(false); }
  }

  async function createWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/session/workspaces`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message ?? 'Could not create workspace.');
      await switchWorkspace(result.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create workspace.'); }
    finally { setBusy(false); }
  }

  const subtitle = session.workspace.isPersonal ? 'Personal workspace' : `${session.workspace.memberCount ?? 1} members · ${session.workspace.role?.toLowerCase() ?? 'member'}`;
  return (
    <div className="workspace-switcher-wrap" ref={root}>
      <button className="workspace-switcher" type="button" aria-expanded={open} aria-haspopup="dialog" onClick={() => { setOpen((value) => !value); setError(''); }}>
        <span className="workspace-switcher__mark" aria-hidden="true">◇</span>
        <span className="workspace-switcher__copy"><strong>{session.workspace.name}</strong><small>{subtitle}</small></span>
        <span className="workspace-switcher__chevron" aria-hidden="true">⌄</span>
      </button>
      {open && <div className="workspace-menu" role="dialog" aria-label="Switch workspace">
        <span className="workspace-menu__label">Your workspaces</span>
        <div className="workspace-menu__list">
          {(items.length ? items : [{ ...session.workspace, role: session.workspace.role ?? 'MEMBER', memberCount: session.workspace.memberCount ?? 1, isPersonal: session.workspace.isPersonal ?? true }]).map((item) => (
            <button className="workspace-option" key={item.id} type="button" disabled={busy || item.id === session.workspace.id} onClick={() => void switchWorkspace(item.id)}>
              <span className="workspace-option__mark">{item.isPersonal ? '◇' : item.name.slice(0, 1).toUpperCase()}</span>
              <span><strong>{item.name}</strong><small>{item.isPersonal ? 'Personal' : `${item.memberCount} members`}</small></span>
              {item.id === session.workspace.id && <span className="workspace-option__check" aria-label="Current workspace">✓</span>}
            </button>
          ))}
        </div>
        <LinkSettings onClick={() => setOpen(false)} />
        {creating ? <form className="workspace-create-form" onSubmit={createWorkspace}>
          <label htmlFor="new-workspace-name">New workspace</label>
          <input id="new-workspace-name" autoFocus maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Product team" required />
          <div><button type="button" className="workspace-create-cancel" onClick={() => { setCreating(false); setError(''); }}>Cancel</button><button className="workspace-create-submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create'}</button></div>
        </form> : <button type="button" className="workspace-add" onClick={() => setCreating(true)}>＋ Create a workspace</button>}
        {error && <p className="workspace-menu__error" role="alert">{error}</p>}
      </div>}
    </div>
  );
}

function LinkSettings({ onClick }: { onClick: () => void }) {
  return <a className="workspace-settings-link" href="/workspace/settings" onClick={onClick}>Workspace settings <span aria-hidden="true">↗</span></a>;
}
