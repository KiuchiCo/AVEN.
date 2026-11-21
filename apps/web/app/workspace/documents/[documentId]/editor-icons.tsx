// The small line icons of the formatting toolbar. Drawn on a 20-unit grid with the same 1.6 stroke as the rest of AVEN's icons.
const paths = {
  search: <><circle cx="9" cy="9" r="5.5" /><path d="m13.2 13.2 4 4" /></>,
  undo: <><path d="M7.5 5 3.5 9l4 4" /><path d="M4 9h8a4.5 4.5 0 0 1 0 9H8" /></>,
  redo: <><path d="m12.5 5 4 4-4 4" /><path d="M16 9H8a4.5 4.5 0 0 0 0 9h4" /></>,
  print: <><path d="M6 7V3h8v4" /><rect x="3" y="7" width="14" height="7" rx="1.5" /><path d="M6 12h8v5H6z" /></>,
  minus: <path d="M5 10h10" />, plus: <><path d="M5 10h10" /><path d="M10 5v10" /></>,
  link: <><path d="M8.5 11.5a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-.8.8" /><path d="M11.5 8.5a3.5 3.5 0 0 0-5 0L4 11a3.5 3.5 0 0 0 5 5l.8-.8" /></>,
  comment: <><path d="M4 4.5h12a1 1 0 0 1 1 1v7.5a1 1 0 0 1-1 1H9l-3.5 3v-3H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z" /><path d="M10 7v4M8 9h4" /></>,
  image: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><circle cx="7.5" cy="8.5" r="1.3" /><path d="m4 15 4.2-4.2 3 3 2-2L17 15.5" /></>,
  table: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M3 9h14M3 13h14M8.5 4v12M13 4v12" /></>,
  alignLeft: <path d="M3 5h14M3 9h9M3 13h14M3 17h9" />, alignCenter: <path d="M3 5h14M5.5 9h9M3 13h14M5.5 17h9" />,
  alignRight: <path d="M3 5h14M8 9h9M3 13h14M8 17h9" />, alignJustify: <path d="M3 5h14M3 9h14M3 13h14M3 17h14" />,
  spacing: <><path d="M9 4.5h8M9 10h8M9 15.5h8" /><path d="m4.5 5 1.8-2.2L8 5M4.5 15l1.8 2.2L8 15M6.3 3v14" /></>,
  checklist: <><path d="m3 5 1.5 1.5L7 4" /><path d="m3 11 1.5 1.5L7 10" /><path d="M10 5.5h7M10 11.5h7M10 17h7" /></>,
  bullets: <><circle cx="4.5" cy="5.5" r="1" /><circle cx="4.5" cy="10" r="1" /><circle cx="4.5" cy="14.5" r="1" /><path d="M8.5 5.5H17M8.5 10H17M8.5 14.5H17" /></>,
  numbered: <><path d="M4 4v3.5M3.2 7.5h1.6" /><path d="M3 11.2c.3-.8 2.2-.9 2.2.3 0 1-1.7 1.4-2.2 2.2h2.4" /><path d="M8.5 5.5H17M8.5 10H17M8.5 14.5H17" /></>,
  indentIn: <><path d="M3 4.5h14M9 8.5h8M9 12.5h8M3 16.5h14" /><path d="m3 8.5 3 2-3 2Z" /></>,
  indentOut: <><path d="M3 4.5h14M9 8.5h8M9 12.5h8M3 16.5h14" /><path d="m6 8.5-3 2 3 2Z" /></>,
  clear: <><path d="M5 4h10M10 4l-1.6 8M7 16h6" /><path d="m12.5 11 4.5 4.5m0-4.5L12.5 15.5" /></>,
  colour: <><path d="m6.5 13 3.5-9 3.5 9M7.7 10h4.6" /></>,
  highlight: <><path d="m11.5 4 4.5 4.5-6.2 6.3-3.6.7.7-3.6Z" /><path d="m7.3 11.2 2.3 2.3" /></>,
  more: <><circle cx="5" cy="10" r="1.1" /><circle cx="10" cy="10" r="1.1" /><circle cx="15" cy="10" r="1.1" /></>,
  chevron: <path d="m6 8 4 4 4-4" />, chevronUp: <path d="m6 12 4-4 4 4" />,
  pencil: <><path d="m12.5 4.5 3 3-8.3 8.3-3.7.7.7-3.7Z" /><path d="m11 6 3 3" /></>,
  eye: <><path d="M2.5 10s2.8-5 7.5-5 7.5 5 7.5 5-2.8 5-7.5 5-7.5-5-7.5-5Z" /><circle cx="10" cy="10" r="2.2" /></>,
  rowAdd: <><rect x="3" y="3.5" width="14" height="6" rx="1" /><path d="M10 12.5v4M8 14.5h4" /></>, rowRemove: <><rect x="3" y="3.5" width="14" height="6" rx="1" /><path d="M8 14.5h4" /></>,
  colAdd: <><rect x="3.5" y="3" width="6" height="14" rx="1" /><path d="M12.5 10h4M14.5 8v4" /></>, colRemove: <><rect x="3.5" y="3" width="6" height="14" rx="1" /><path d="M12.5 10h4" /></>,
  copy: <><rect x="7" y="7" width="9" height="9" rx="1.5" /><path d="M13 7V5.5A1.5 1.5 0 0 0 11.5 4h-6A1.5 1.5 0 0 0 4 5.5v6A1.5 1.5 0 0 0 5.5 13H7" /></>,
  trash: <><path d="M4.5 6h11M8 6V4h4v2M6 6l.7 10h6.6L14 6" /></>, up: <path d="m5 12 5-5 5 5" />, down: <path d="m5 8 5 5 5-5" />,
  widthFull: <><rect x="2.5" y="5" width="15" height="10" rx="1.2" /></>, widthHalf: <><rect x="5" y="5" width="10" height="10" rx="1.2" /></>,
  sparkle: <path d="m10 3 1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6Z" />,
  share: <><circle cx="15" cy="5" r="2" /><circle cx="5" cy="10" r="2" /><circle cx="15" cy="15" r="2" /><path d="m6.8 9 6.4-3M6.8 11l6.4 3" /></>,
  download: <><path d="M10 3.5v9M6.5 9.5 10 13l3.5-3.5" /><path d="M4 16h12" /></>,
  panel: <><rect x="3" y="4" width="14" height="12" rx="1.5" /><path d="M12 4v12" /></>,
  back: <><path d="M12 5 7 10l5 5" /></>,
} as const;
export type EditorIconName = keyof typeof paths;

export function EditorIcon({ name, size = 18 }: { name: EditorIconName; size?: number }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
