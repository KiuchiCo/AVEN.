'use client';

import { useAuth } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent } from 'react';
import { useWorkspaceSession } from '../workspace-shell';
import { attachArrows, clampSize, normalizeBox, toWorld, zoomAt, type View } from './board-geometry';
import { colorNames, defaults, palette, uid, type BoardDetail, type BoardElement, type Color, type EntityType, type Tool } from './board-types';

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
const tools: { id: Tool; label: string }[] = [{ id: 'select', label: 'Select' }, { id: 'sticky', label: 'Note' }, { id: 'rect', label: 'Box' }, { id: 'ellipse', label: 'Oval' }, { id: 'text', label: 'Text' }, { id: 'arrow', label: 'Arrow' }, { id: 'pen', label: 'Pen' }, { id: 'card', label: 'Link' }];
const entityPaths: Record<EntityType, { label: string; path: string; href: string }> = { TASK: { label: 'Task', path: 'tasks', href: '/workspace/tasks' }, DOCUMENT: { label: 'Document', path: 'documents', href: '/workspace/documents' }, PROJECT: { label: 'Project', path: 'projects', href: '/workspace/projects' } };
type Pick = { type: EntityType; items: { id: string; title: string }[]; filter: string; loading: boolean };
type Gesture = { kind: 'pan'; sx: number; sy: number; view: View } | { kind: 'move'; id: string; px: number; py: number; orig: BoardElement } | { kind: 'resize'; id: string; px: number; py: number; orig: BoardElement } | { kind: 'draw'; id: string; px: number; py: number };
type Conflict = BoardDetail | null;

export function BoardEditor({ boardId }: { boardId: string }) {
  const { workspace } = useWorkspaceSession();
  const { getToken } = useAuth();
  const readOnly = workspace.role === 'GUEST';
  const [name, setName] = useState('');
  const [elements, setElements] = useState<BoardElement[]>([]);
  const [updatedAt, setUpdatedAt] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [tool, setTool] = useState<Tool>('select');
  const [color, setColor] = useState<Color>('amber');
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [view, setView] = useState<View>({ x: 40, y: 40, k: 1 });
  const [status, setStatus] = useState('');
  const [conflict, setConflict] = useState<Conflict>(null);
  const [dirty, setDirty] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const router = useRouter();
  const history = useRef<BoardElement[][]>([]);
  const gesture = useRef<Gesture | null>(null);
  const latest = useRef({ elements, updatedAt });
  useEffect(() => { latest.current = { elements, updatedAt }; });
  const svg = useRef<SVGSVGElement>(null);

  const call = useCallback(async (path: string, method = 'GET', body?: unknown) => {
    const token = await getToken();
    if (!token || !apiBase) throw new Error('AVEN could not connect to the API.');
    const response = await fetch(`${apiBase}/workspaces/${workspace.id}/whiteboards/${boardId}${path}`, { method, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const json = await response.json().catch(() => null);
    return { response, json };
  }, [getToken, workspace.id, boardId]);

  useEffect(() => {
    let live = true;
    void call('').then(({ response, json }) => {
      if (!live) return;
      if (!response.ok) { setStatus(json?.message ?? 'Could not load this whiteboard.'); return; }
      const board = json as BoardDetail; setName(board.name); setElements(attachArrows(board.content.elements)); setUpdatedAt(board.updatedAt); setLoaded(true);
    }).catch(() => live && setStatus('Could not load this whiteboard.'));
    return () => { live = false; };
  }, [call]);

  // Save a moment after the last change. A save never overwrites someone else's: a conflict asks first.
  useEffect(() => {
    if (!dirty || readOnly || conflict) return;
    const timer = setTimeout(async () => {
      const sent = latest.current;
      setStatus('Saving…');
      try {
        const { response, json } = await call('', 'PATCH', { elements: sent.elements, baseUpdatedAt: sent.updatedAt });
        if (response.status === 409) { setConflict(json.current as BoardDetail); setStatus(''); return; }
        if (!response.ok) { setStatus(json?.message ?? 'Could not save. Your changes are still here.'); return; }
        setUpdatedAt((json as BoardDetail).updatedAt);
        if (latest.current.elements === sent.elements) setDirty(false);
        setStatus('Saved');
      } catch { setStatus('Could not save. Your changes are still here.'); }
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, elements, updatedAt, readOnly, conflict, call]);

  const commit = useCallback((next: BoardElement[], remember = true) => {
    if (remember) history.current = [...history.current.slice(-49), latest.current.elements];
    setElements(attachArrows(next)); setDirty(true);
  }, []);
  const patch = (id: string, change: Partial<BoardElement>) => setElements((list) => attachArrows(list.map((item) => (item.id === id ? { ...item, ...change } : item))));
  const undo = useCallback(() => { const previous = history.current.pop(); if (previous) { setElements(previous); setDirty(true); setSelected(null); } }, []);
  const remove = useCallback(() => { if (selected) { commit(latest.current.elements.filter((item) => item.id !== selected)); setSelected(null); } }, [selected, commit]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (editing || readOnly || (event.target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(event.target.tagName))) return;
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undo(); }
      if (event.key === 'Escape') { setTool('select'); setSelected(null); }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [editing, readOnly, remove, undo]);

  const point = (event: { clientX: number; clientY: number }): [number, number] => {
    const rect = svg.current!.getBoundingClientRect(); return toWorld(view, event.clientX - rect.left, event.clientY - rect.top);
  };

  function down(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const [px, py] = point(event);
    const target = (event.target as Element).closest<SVGElement>('[data-id]');
    const handle = (event.target as Element).closest('[data-handle]');
    if (!readOnly && tool === 'select' && target?.dataset.id) {
      const orig = latest.current.elements.find((item) => item.id === target.dataset.id)!;
      setSelected(orig.id); setColor(orig.color);
      gesture.current = handle ? { kind: 'resize', id: orig.id, px, py, orig } : { kind: 'move', id: orig.id, px, py, orig };
    } else if (readOnly || tool === 'select') {
      // The open text editor is left alone: it saves itself when it loses focus, which this click causes.
      setSelected(null);
      gesture.current = { kind: 'pan', sx: event.clientX, sy: event.clientY, view };
    } else if (tool === 'arrow' || tool === 'pen') {
      const id = uid();
      const startShape = latest.current.elements.find((item) => item.id === target?.dataset.id && item.type !== 'arrow' && item.type !== 'pen');
      const element: BoardElement = tool === 'pen' ? { id, type: 'pen', x: px, y: py, w: 0, h: 0, color, points: [[px, py]] } : { id, type: 'arrow', x: px, y: py, w: 0, h: 0, color, ...(startShape ? { from: startShape.id } : {}) };
      history.current = [...history.current.slice(-49), latest.current.elements];
      setElements((list) => [...list, element]); gesture.current = { kind: 'draw', id, px, py };
    } else {
      const size = defaults[tool]; const id = uid();
      commit([...latest.current.elements, { id, type: tool, x: px - size.w / 2, y: py - size.h / 2, ...size, color, text: '' }]);
      // Opened a moment later: the browser moves focus on mouse-down, which would otherwise close the editor at once.
      setSelected(id); setTool('select'); window.setTimeout(() => setEditing(id), 60);
    }
  }

  function move(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current; if (!g) return;
    if (g.kind === 'pan') { setView({ ...g.view, x: g.view.x + event.clientX - g.sx, y: g.view.y + event.clientY - g.sy }); return; }
    const [px, py] = point(event); const dx = px - g.px; const dy = py - g.py;
    if (g.kind === 'move') {
      const { orig } = g;
      patch(g.id, { x: orig.x + dx, y: orig.y + dy, ...(orig.points ? { points: orig.points.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : {}), ...(orig.type === 'arrow' ? { from: undefined, to: undefined } : {}) });
    } else if (g.kind === 'resize') {
      patch(g.id, g.orig.type === 'arrow' ? { w: g.orig.w + dx, h: g.orig.h + dy, to: undefined } : { w: clampSize(g.orig.w + dx), h: clampSize(g.orig.h + dy) });
    } else {
      setElements((list) => list.map((item) => (item.id !== g.id ? item : item.type === 'pen' ? { ...item, points: [...(item.points ?? []), [px, py] as [number, number]].slice(-2000) } : { ...item, w: px - g.px, h: py - g.py })));
    }
  }

  function up(event: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current; gesture.current = null; if (!g || g.kind === 'pan') return;
    if (g.kind === 'draw') {
      const drawn = latest.current.elements.find((item) => item.id === g.id);
      if (drawn && drawn.type === 'arrow' && Math.hypot(drawn.w, drawn.h) < 8) { setElements((list) => list.filter((item) => item.id !== g.id)); return; }
      if (drawn?.type === 'arrow') {
        const endId = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGElement>('[data-id]')?.dataset.id;
        const endShape = latest.current.elements.find((item) => item.id === endId && item.id !== drawn.from && item.type !== 'arrow' && item.type !== 'pen');
        if (endShape) patch(g.id, { to: endShape.id });
      }
      if (drawn?.type === 'pen') { const xs = drawn.points!.map((p) => p[0]); const ys = drawn.points!.map((p) => p[1]); patch(g.id, { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }); }
      setSelected(g.id);
    } else history.current = [...history.current.slice(-49), latest.current.elements.map((item) => (item.id === g.id ? g.orig : item))];
    setDirty(true);
  }

  function wheel(event: WheelEvent<SVGSVGElement>) {
    const rect = svg.current!.getBoundingClientRect(); const sx = event.clientX - rect.left; const sy = event.clientY - rect.top;
    if (event.ctrlKey || event.metaKey) setView((current) => zoomAt(current, sx, sy, event.deltaY < 0 ? 1.1 : 1 / 1.1));
    else setView((current) => ({ ...current, x: current.x - event.deltaX, y: current.y - event.deltaY }));
  }

  const select = elements.find((item) => item.id === selected);
  const editingElement = elements.find((item) => item.id === editing);
  const stroke = (item: BoardElement) => palette[item.color].line;
  const body = (item: BoardElement) => item.type === 'arrow' || item.type === 'pen' ? null : item.type === 'card' ? <foreignObject x={item.x} y={item.y} width={item.w} height={item.h} pointerEvents="none"><div className="board-card"><small>{item.entity ? entityPaths[item.entity.type].label : 'Link'}</small><strong>{item.text}</strong></div></foreignObject> : <foreignObject x={item.x} y={item.y} width={item.w} height={item.h} pointerEvents="none"><div className={`board-text board-text--${item.type}`}>{item.text}</div></foreignObject>;

  async function openPicker(type: EntityType) {
    setPick({ type, items: [], filter: '', loading: true });
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/workspaces/${workspace.id}/${entityPaths[type].path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const rows = response.ok ? await response.json() as { id: string; title?: string; name?: string }[] : [];
      setPick((current) => (current && current.type === type ? { ...current, loading: false, items: rows.map((row) => ({ id: row.id, title: row.title ?? row.name ?? 'Untitled' })).slice(0, 200) } : current));
    } catch { setPick((current) => (current ? { ...current, loading: false } : current)); }
  }
  function placeCard(entry: { id: string; title: string }) {
    if (!pick || !svg.current) return;
    const rect = svg.current.getBoundingClientRect(); const [cx, cy] = toWorld(view, rect.width / 2, rect.height / 2);
    const id = uid();
    commit([...latest.current.elements, { id, type: 'card', x: cx - 110, y: cy - 40, w: 220, h: 80, color: 'ivory', text: entry.title.slice(0, 200), entity: { type: pick.type, id: entry.id } }]);
    setSelected(id); setPick(null);
  }

  function renameBoard() {
    const next = window.prompt('Rename whiteboard', name)?.trim(); if (!next || next === name) return;
    void call('', 'PATCH', { name: next }).then(({ response, json }) => { if (response.ok) setName(next); else setStatus(json?.message ?? 'Could not rename.'); });
  }

  if (!loaded) return <section className="workspace-settings-page"><p>{status || 'Loading…'}</p><Link href="/workspace/whiteboards">Back to whiteboards</Link></section>;
  return <section className="board">
    <header className="board-bar">
      <Link href="/workspace/whiteboards">← Whiteboards</Link>
      <h1>{name}</h1>
      {!readOnly && <button onClick={renameBoard}>Rename</button>}
      <span className="board-status" role="status">{readOnly ? 'View only' : status}</span>
    </header>
    {!readOnly && <div className="board-tools" role="toolbar" aria-label="Whiteboard tools">
      {tools.map((item) => <button key={item.id} aria-pressed={item.id === 'card' ? pick !== null : tool === item.id} onClick={() => (item.id === 'card' ? void openPicker('TASK') : setTool(item.id))}>{item.label}</button>)}
      <span className="board-sep" />
      {colorNames.map((name) => <button key={name} className="board-swatch" aria-label={`Colour ${name}`} aria-pressed={color === name} style={{ background: palette[name].fill, borderColor: palette[name].line }} onClick={() => { setColor(name); if (selected) { commit(latest.current.elements.map((item) => (item.id === selected ? { ...item, color: name } : item))); } }} />)}
      <span className="board-sep" />
      <button onClick={undo} >Undo</button>
      <button onClick={remove} disabled={!selected}>Delete</button>
      {select?.type === 'card' && select.entity && <Link className="board-open" href={`${entityPaths[select.entity.type].href}/${select.entity.id}`}>Open {entityPaths[select.entity.type].label.toLowerCase()} ↗</Link>}
      <span className="board-sep" />
      <button onClick={() => setView((current) => zoomAt(current, 400, 250, 1 / 1.2))} aria-label="Zoom out">−</button>
      <span>{Math.round(view.k * 100)}%</span>
      <button onClick={() => setView((current) => zoomAt(current, 400, 250, 1.2))} aria-label="Zoom in">+</button>
    </div>}
    {conflict && <div className="board-conflict" role="alert"><span>Someone else changed this whiteboard while you were editing.</span>
      <button onClick={() => { setElements(conflict.content.elements); setUpdatedAt(conflict.updatedAt); setConflict(null); setDirty(false); history.current = []; }}>Load their version</button>
      <button onClick={() => { setUpdatedAt(conflict.updatedAt); setConflict(null); }}>Keep mine</button></div>}
    {pick && <div className="board-picker" role="dialog" aria-label="Link to something in this workspace">
      <div role="group" aria-label="What to link">{(Object.keys(entityPaths) as EntityType[]).map((type) => <button key={type} aria-pressed={pick.type === type} onClick={() => void openPicker(type)}>{entityPaths[type].label}s</button>)}</div>
      <input value={pick.filter} placeholder={`Find a ${entityPaths[pick.type].label.toLowerCase()}`} aria-label="Filter" onChange={(event) => setPick({ ...pick, filter: event.target.value })} autoFocus />
      <ul>{pick.loading ? <li>Loading…</li> : pick.items.filter((entry) => entry.title.toLowerCase().includes(pick.filter.toLowerCase())).slice(0, 8).map((entry) => <li key={entry.id}><button onClick={() => placeCard(entry)}>{entry.title}</button></li>)}</ul>
      <button onClick={() => setPick(null)}>Cancel</button>
    </div>}
    <div className="board-canvas">
      <svg ref={svg} role="application" aria-label="Whiteboard canvas" onPointerDown={down} onPointerMove={move} onPointerUp={up} onWheel={wheel} onDoubleClick={(event) => { const id = (event.target as Element).closest<SVGElement>('[data-id]')?.dataset.id; const item = elements.find((entry) => entry.id === id); if (item?.type === 'card' && item.entity) { router.push(`${entityPaths[item.entity.type].href}/${item.entity.id}`); return; } if (!readOnly && item && item.type !== 'arrow' && item.type !== 'pen') setEditing(item.id); }} style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}>
        <defs>{colorNames.map((name) => <marker key={name} id={`arrow-${name}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" fill={palette[name].line} /></marker>)}</defs>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {elements.map((item) => <g key={item.id} data-id={item.id}>
            {item.type === 'card' && <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={10} fill={palette[item.color].fill} stroke={stroke(item)} strokeWidth={1.5} />}
            {item.type === 'sticky' && <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={4} fill={palette[item.color].fill} stroke={stroke(item)} strokeWidth={1} />}
            {item.type === 'rect' && <rect x={item.x} y={item.y} width={item.w} height={item.h} rx={8} fill="none" stroke={stroke(item)} strokeWidth={2} />}
            {item.type === 'ellipse' && <ellipse cx={item.x + item.w / 2} cy={item.y + item.h / 2} rx={item.w / 2} ry={item.h / 2} fill="none" stroke={stroke(item)} strokeWidth={2} />}
            {item.type === 'text' && <rect x={item.x} y={item.y} width={item.w} height={item.h} fill="transparent" />}
            {item.type === 'arrow' && <><line x1={item.x} y1={item.y} x2={item.x + item.w} y2={item.y + item.h} stroke="transparent" strokeWidth={14} /><line x1={item.x} y1={item.y} x2={item.x + item.w} y2={item.y + item.h} stroke={stroke(item)} strokeWidth={2.5} markerEnd={`url(#arrow-${item.color})`} /></>}
            {item.type === 'pen' && <polyline points={item.points!.map((p) => p.join(',')).join(' ')} fill="none" stroke={stroke(item)} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />}
            {body(item)}
          </g>)}
          {select && !readOnly && (() => { const box = select.type === 'arrow' ? normalizeBox(select) : select; const hx = select.type === 'arrow' ? select.x + select.w : box.x + box.w; const hy = select.type === 'arrow' ? select.y + select.h : box.y + box.h; return <g pointerEvents="none"><rect x={box.x - 4} y={box.y - 4} width={box.w + 8} height={box.h + 8} fill="none" stroke="var(--aven-bronze)" strokeDasharray="5 4" />{select.type !== 'pen' && <rect data-id={select.id} data-handle="1" pointerEvents="all" x={hx - 6} y={hy - 6} width={12} height={12} rx={3} fill="var(--aven-bronze)" style={{ cursor: 'nwse-resize' }} />}</g>; })()}
        </g>
      </svg>
      {editingElement && <textarea className="board-editing" autoFocus aria-label="Edit text" defaultValue={editingElement.text ?? ''} maxLength={2000} style={{ left: view.x + editingElement.x * view.k, top: view.y + editingElement.y * view.k, width: editingElement.w * view.k, height: editingElement.h * view.k, fontSize: 15 * view.k }}
        onBlur={(event) => { const text = event.target.value; commit(latest.current.elements.map((item) => (item.id === editingElement.id ? { ...item, text } : item))); setEditing(null); }}
        onKeyDown={(event) => { if (event.key === 'Escape') (event.target as HTMLTextAreaElement).blur(); }} />}
    </div>
  </section>;
}
