// The AVEN block icon family. One registry, one stroke style: 24×24 grid, 1.6 stroke, round caps and joins, no fills except
// small solid details (bullets, triangles, quote marks). Every block, slash-menu entry and block selector reads from here, so a
// block looks the same everywhere. Icon ids are the canonical names of blocks and views.
import type { ReactNode } from 'react';

const dot = (x: number, y: number, r = 1.15) => <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />;
/** A heading letter "H" on the left of the grid, drawn at the given left edge. */
const H = (x: number, top = 6.5, bottom = 17.5) => <path d={`M${x} ${top}v${bottom - top}M${x + 7} ${top}v${bottom - top}M${x} ${(top + bottom) / 2}h7`} />;
/** A small level digit used as a subscript, 1–4, at the lower right. */
const digit = (n: 1 | 2 | 3 | 4, x = 16) => {
  const d = {
    1: `M${x + 0.5} 14.4l1.9-1.1V19`,
    2: `M${x} 14.2a1.9 1.9 0 0 1 3.6.7c0 1-1.1 1.7-3.6 3.9h3.9`,
    3: `M${x} 13.4h3.4l-1.7 2a1.9 1.9 0 1 1-1.6 2.9`,
    4: `M${x + 2.6} 19v-6.2l-3 4.4h4.2`,
  }[n];
  return <path d={d} strokeWidth="1.4" />;
};
const triangle = (x: number, y: number) => <path d={`M${x} ${y}l3 2-3 2z`} fill="currentColor" strokeWidth="1" />;

export const blockIconPaths = {
  // ---- Basic blocks
  'document-text': <><path d="M6 6.5V5h12v1.5M12 5v14M9.2 19h5.6" /></>,
  'heading-1': <>{H(3.5)}{digit(1)}</>,
  'heading-2': <>{H(3.5)}{digit(2)}</>,
  'heading-3': <>{H(3.5)}{digit(3)}</>,
  'heading-4': <>{H(3.5)}{digit(4)}</>,
  'bulleted-list': <>{dot(5, 7)}{dot(5, 12)}{dot(5, 17)}<path d="M10 7h10M10 12h10M10 17h10" /></>,
  'numbered-list': <><path d="M4.3 6.2l1.5-1V10M4.2 13.6a1.5 1.5 0 0 1 3 .4c0 .9-1 1.4-3 3.3h3.1M10 7h10M10 12h10M10 17h10" strokeWidth="1.45" /></>,
  'todo-list': <><path d="M3.8 7.2l1.5 1.5 2.7-3M3.8 15.2l1.5 1.5 2.7-3M11 7.5h9M11 15.5h9" /></>,
  'toggle-list': <>{triangle(3.5, 5.5)}{triangle(3.5, 13.5)}<path d="M11 7.5h9M11 15.5h9" /></>,
  page: <><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4M9 12.5h6M9 16h6" /></>,
  callout: <><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M7.5 10h9M7.5 14h5.5" /></>,
  quote: <><path d="M5 17v-3.2A3.6 3.6 0 0 1 8.6 10.2h.4M5 17h4.2v-3.8H5M13.4 17v-3.2a3.6 3.6 0 0 1 3.6-3.6h.4M13.4 17h4.2v-3.8h-4.2" /></>,
  table: <><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M3.5 9.8h17M3.5 14.3h17M10 5v14" /></>,
  divider: <><path d="M5 12h14" /></>,
  'page-link': <><path d="M12.5 21H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6l4 4v3M14 3v4h4M14 20l6.5-6.5M15.5 13.5h5v5" /></>,
  // ---- Media
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.4" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17.5l4.7-4.7 3.1 3.1 3-3.6 5.7 5.7" /></>,
  video: <><rect x="3" y="5" width="18" height="14" rx="2.6" /><path d="M10.4 9.3v5.4l4.6-2.7z" /></>,
  audio: <><path d="M4 9.5h3.3L12 5.6v12.8l-4.7-3.9H4zM15.4 9.2a4 4 0 0 1 0 5.6M18 6.8a7.4 7.4 0 0 1 0 10.4" /></>,
  code: <><path d="M8.6 7.5L4 12l4.6 4.5M15.4 7.5L20 12l-4.6 4.5M13.5 5.5l-3 13" /></>,
  file: <><path d="M17.8 11.2l-6.3 6.3a3.7 3.7 0 0 1-5.2-5.2l7.1-7.1a2.5 2.5 0 0 1 3.5 3.5l-7.1 7.1a1.2 1.2 0 0 1-1.8-1.7l6.4-6.4" /></>,
  bookmark: <><path d="M7 4h10a1 1 0 0 1 1 1v15.2l-6-4.3-6 4.3V5a1 1 0 0 1 1-1z" /></>,
  // ---- Database views
  'database-table': <><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M3.5 9.4h17M3.5 14.2h17M9.2 9.4V19M14.8 9.4V19" /></>,
  'database-board': <><rect x="3.5" y="5" width="17" height="14" rx="2.2" /><path d="M9.2 5v14M14.8 5v14" /></>,
  'database-gallery': <><rect x="4" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" /></>,
  'database-list': <><path d="M4 7h2M9 7h11M4 12h2M9 12h11M4 17h2M9 17h11" /></>,
  'database-feed': <><path d="M5 6a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v13H7a2 2 0 0 1-2-2zM18 9h1.5a.5.5 0 0 1 .5.5V17a2 2 0 0 1-2 2M8.6 8.8h6M8.6 12h6M8.6 15.2h3" /></>,
  'database-dashboard': <><rect x="3.5" y="4.5" width="7.5" height="9" rx="1.8" /><rect x="13" y="4.5" width="7.5" height="5.2" rx="1.8" /><rect x="13" y="12" width="7.5" height="7.5" rx="1.8" /><rect x="3.5" y="16" width="7.5" height="3.5" rx="1.5" /></>,
  'database-calendar': <><rect x="4" y="5" width="16" height="15" rx="2.4" /><path d="M4 9.6h16M8.5 3.5v3M15.5 3.5v3M8 13.2h.01M12 13.2h.01M16 13.2h.01M8 16.7h.01M12 16.7h.01" strokeWidth="2" /></>,
  'database-timeline': <><rect x="3.5" y="4.5" width="17" height="15" rx="2.4" /><path d="M7 9h6M10 12.5h7M7 16h5" /></>,
  'database-map': <><path d="M3.5 6.6l5.5-2.1 6 2.1 5.5-2.1v12.9l-5.5 2.1-6-2.1-5.5 2.1zM9 4.5v12.9M15 6.6v12.9" /></>,
  // ---- Charts
  'chart-bar-vertical': <><rect x="4" y="12" width="4.2" height="7" rx="1.1" /><rect x="9.9" y="5" width="4.2" height="14" rx="1.1" /><rect x="15.8" y="9" width="4.2" height="10" rx="1.1" /></>,
  'chart-bar-horizontal': <><rect x="4" y="4.2" width="7" height="4.2" rx="1.1" /><rect x="4" y="9.9" width="14" height="4.2" rx="1.1" /><rect x="4" y="15.6" width="10" height="4.2" rx="1.1" /></>,
  'chart-line': <><path d="M4 4.5V20h16M7.5 15l3.7-4 3 2.8 4.8-6.3" /></>,
  'chart-donut': <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="3.9" /><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" strokeWidth="2.6" /></>,
  'chart-number': <><rect x="3.5" y="4.5" width="17" height="15" rx="2.4" /><path d="M10.2 8.7L9.3 15.3M14.8 8.7L13.9 15.3M7.6 11h9M7.1 13.4h9" /></>,
  // ---- Database blocks
  'database-inline': <><path d="M7 3.8H5.2a1 1 0 0 0-1 1V7M17 3.8h1.8a1 1 0 0 1 1 1V7M7 20.2H5.2a1 1 0 0 1-1-1V17M17 20.2h1.8a1 1 0 0 0 1-1V17" /><ellipse cx="12" cy="8.8" rx="4.6" ry="2" /><path d="M7.4 8.8v6.4c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2V8.8M7.4 12c0 1.1 2.1 2 4.6 2s4.6-.9 4.6-2" /></>,
  'database-full-page': <><ellipse cx="12" cy="6.4" rx="7.6" ry="3" /><path d="M4.4 6.4v11.2c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3V6.4M4.4 12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3" /></>,
  'database-linked': <><ellipse cx="10" cy="6.4" rx="6" ry="2.5" /><path d="M4 6.4v9c0 1.4 2.7 2.5 6 2.5M4 10.9c0 1.4 2.7 2.5 6 2.5M16 6.4v3.6M13.6 20.6l6.6-6.6M15.4 14h4.8v4.8" /></>,
  // ---- Advanced blocks
  'table-of-contents': <><path d="M4 5.5h9M7 10h13M7 14.5h13M4 19h9" /></>,
  equation: <><rect x="4" y="4" width="16" height="16" rx="2.6" /><path d="M15.2 8H9.4l3.5 4-3.5 4h5.8" /></>,
  button: <><rect x="3" y="5.5" width="18" height="13" rx="2.8" /><path d="M7.8 12h8M13 8.9l3.1 3.1-3.1 3.1" /></>,
  breadcrumb: <><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v4h4M10.4 11.6l-.7 5M14.3 11.6l-.7 5M8.9 13.2h6M8.5 15.6h6" /></>,
  tabs: <><path d="M4 8.6a2 2 0 0 1 2-2h3.6l1.6 2h6.8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 11h16" /></>,
  'synced-block': <><path d="M4 5.5h9M4 10h5M13.2 15.2a3.5 3.5 0 0 1 6-1.4M19.5 11.4v2.6H17M20 17.4a3.5 3.5 0 0 1-6 1.4M13.7 21v-2.6h2.6" /></>,
  'toggle-heading-1': <>{triangle(2.2, 9)}{H(7.5, 7, 17)}{digit(1, 16.5)}</>,
  'toggle-heading-2': <>{triangle(2.2, 9)}{H(7.5, 7, 17)}{digit(2, 16.5)}</>,
  'toggle-heading-3': <>{triangle(2.2, 9)}{H(7.5, 7, 17)}{digit(3, 16.5)}</>,
  'ai-meeting-notes': <><path d="M6 21V4a1 1 0 0 1 1-1h7l4 4v4.2M9 8.2h3M9 11.7h6.4" /><rect x="13.6" y="13.6" width="3.6" height="5.4" rx="1.8" /><path d="M12.6 17.6a3.8 3.8 0 0 0 7.6 0M16.4 21.4V22" /></>,
  mermaid: <><path d="M12 21.2v-7.6M12 13.6C9 13.6 6.6 11 5 6.2c3 .6 5 .1 7-2.2 2 2.3 4 2.8 7 2.2-1.6 4.8-4 7.4-7 7.4z" /></>,
} satisfies Record<string, ReactNode>;

export type BlockIconId = keyof typeof blockIconPaths;
export const blockIconIds = Object.keys(blockIconPaths) as BlockIconId[];

/** A block icon. Colour comes from the surrounding text colour, so it follows the AVEN theme (muted by default, ink when active). */
export function BlockIcon({ id, size = 20, className = '' }: { id: BlockIconId; size?: number; className?: string }) {
  return <svg className={`block-icon ${className}`.trim()} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{blockIconPaths[id]}</svg>;
}
