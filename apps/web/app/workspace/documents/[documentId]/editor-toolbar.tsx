'use client';

// The formatting toolbar: compact groups in one row, like a word processor, adapting to what is selected. It owns no document state;
// it reads what the editor reports (FormatState) and calls the editor's commands, so there is a single implementation of every action.
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useT } from '../../../i18n';
import type { Key } from '../../../i18n/en';
import { BlockIcon } from '../../block-icons';
import { useFilesApi } from '../../files/use-files-api';
import { Popover } from '../library-ui';
import { blockCatalog, catalogCategories, type CatalogEntry } from './block-catalog';
import type { DocEditorApi, FormatState } from './DocEditor';
import { EditorIcon, type EditorIconName } from './editor-icons';
import { BASE_SIZE, MAX_SIZE, MIN_SIZE, clampSize, fontSizes, lineSpacings, stepSize, tones, type Align, type FontFamily } from './editor-model';

/** How much of the toolbar fits: `full` shows every control; `medium`, `compact` and `phone` move the less used ones into "More". */
type Tier = 0 | 1 | 2 | 3;
const tierFor = (width: number): Tier => (width >= 1300 ? 3 : width >= 900 ? 2 : width >= 600 ? 1 : 0);

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const shortcut = (keys: string) => (isMac() ? keys.replace('Ctrl', '⌘').replace('Shift', '⇧').replace('Alt', '⌥').replaceAll('+', '') : keys);

type ButtonProps = { icon?: EditorIconName; label: string; tip?: string; keys?: string; active?: boolean; disabled?: boolean; onPress: () => void; children?: ReactNode; className?: string };
/** An icon button that keeps the caret and the selection in the document while it is pressed. */
export function ToolButton({ icon, label, tip, keys, active, disabled, onPress, children, className = '' }: ButtonProps) {
  const title = `${tip ?? label}${keys ? ` (${shortcut(keys)})` : ''}`;
  return <button type="button" className={`et-btn${active ? ' is-active' : ''} ${className}`} title={title} aria-label={label} aria-pressed={active === undefined ? undefined : active} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onPress}>{icon && <EditorIcon name={icon} />}{children}</button>;
}

function Menu({ label, trigger, children, active, disabled, wide, className = '', tip }: { label: string; trigger: ReactNode; children: (close: () => void) => ReactNode; active?: boolean; disabled?: boolean; wide?: boolean; className?: string; tip?: string }) {
  return <Popover keepFocus align="start" label={label} buttonLabel={label} buttonTitle={tip ?? label} disabled={disabled} className={`et-menu dl-menu${wide ? ' et-menu--wide' : ''}`} buttonClass={`et-btn et-btn--menu${active ? ' is-active' : ''} ${className}`} buttonContent={trigger}>{children}</Popover>;
}
const Item = ({ children, active, onPick, disabled, className = '' }: { children: ReactNode; active?: boolean; onPick: () => void; disabled?: boolean; className?: string }) => <button type="button" role="menuitem" className={`${active ? 'is-active ' : ''}${className}`} disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={onPick}>{children}</button>;

const styleOptions: { id: string; type: CatalogEntry['type']; key: Key; className: string }[] = [
  { id: 'document-text', type: 'PARAGRAPH', key: 'ed.tb.normal', className: 'et-style--normal' }, { id: 'heading-1', type: 'HEADING_1', key: 'blk.heading-1', className: 'et-style--h1' },
  { id: 'heading-2', type: 'HEADING_2', key: 'blk.heading-2', className: 'et-style--h2' }, { id: 'heading-3', type: 'HEADING_3', key: 'blk.heading-3', className: 'et-style--h3' },
  { id: 'heading-4', type: 'HEADING_4', key: 'blk.heading-4', className: 'et-style--h4' }, { id: 'quote', type: 'QUOTE', key: 'blk.quote', className: 'et-style--quote' },
  { id: 'callout', type: 'CALLOUT', key: 'blk.callout', className: 'et-style--normal' }, { id: 'code', type: 'CODE', key: 'blk.code', className: 'et-style--code' },
];
const fontOptions: { id: FontFamily | null; key: Key; css: string }[] = [
  { id: null, key: 'ed.tb.fontDefault', css: 'inherit' }, { id: 'sans', key: 'ed.tb.fontSans', css: 'var(--aven-interface-font)' },
  { id: 'serif', key: 'ed.tb.fontSerif', css: 'var(--aven-display-font)' }, { id: 'mono', key: 'ed.tb.fontMono', css: "ui-monospace, 'SF Mono', Menlo, monospace" },
];
const alignOptions: { id: Align | null; icon: EditorIconName; key: Key; keys?: string }[] = [
  { id: null, icon: 'alignLeft', key: 'ed.tb.alignLeft' }, { id: 'center', icon: 'alignCenter', key: 'ed.tb.alignCenter' }, { id: 'right', icon: 'alignRight', key: 'ed.tb.alignRight' }, { id: 'justify', icon: 'alignJustify', key: 'ed.tb.alignJustify' },
];

/** A grid of the document's colours. `prefix` is "bg-" for the highlighter. */
function Palette({ prefix, current, onPick, none }: { prefix: '' | 'bg-'; current: string | null; onPick: (tone: string | null) => void; none: string }) {
  const t = useT();
  return <div className="et-palette" role="group">
    <button type="button" role="menuitem" className="et-palette__none" onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(null)}>{none}</button>
    <div className="et-palette__grid">{tones.map((tone) => <button type="button" role="menuitemradio" key={tone} className={`et-swatch md-c-${prefix}${tone}${current === tone ? ' is-active' : ''}`} title={t(`ed.tone.${tone}` as Key)} aria-label={t(`ed.tone.${tone}` as Key)} aria-checked={current === tone} onMouseDown={(event) => event.preventDefault()} onClick={() => onPick(`${prefix}${tone}`)}><span>A</span></button>)}</div>
  </div>;
}

/** Paste an address for the selected words. The selection is remembered when the box opens, so clicking into it loses nothing. */
function LinkBox({ api, onClose, requested }: { api: DocEditorApi; onClose: () => void; requested: boolean }) {
  const t = useT();
  const target = useRef(api.linkTarget());
  const [url, setUrl] = useState(''); const [problem, setProblem] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus(); const later = window.setTimeout(() => field.current?.focus(), 80); return () => window.clearTimeout(later); }, []); // again a moment later: the editor hands focus back right after the shortcut
  void requested;
  return <form className="et-link" onSubmit={(event) => { event.preventDefault(); const at = target.current; if (!at) { onClose(); return; } if (api.applyLink(url.trim(), at)) onClose(); else setProblem(true); }}>
    <label>{t('ed.tb.linkTo')}<input ref={field} type="text" inputMode="url" value={url} onChange={(event) => { setUrl(event.target.value); setProblem(false); }} placeholder="https://" data-autofocus autoComplete="off" /></label>
    {problem && <p role="alert">{t('ed.linkInvalid')}</p>}
    <div><button type="button" className="rd-btn rd-btn--soft rd-btn--small" onClick={onClose}>{t('msg.cancel')}</button><button type="submit" className="rd-btn rd-btn--small" disabled={!url.trim()}>{t('ed.tb.applyLink')}</button></div>
  </form>;
}

type Props = {
  api: RefObject<DocEditorApi | null>; format: FormatState; onPrint: () => void; onBrowseBlocks: () => void; viewing: boolean; onViewing: (viewing: boolean) => void;
  canEdit: boolean; collapsed: boolean; onCollapse: (collapsed: boolean) => void; linkRequest: number; onError: (message: string) => void; onNotice: (message: string) => void;
};

export function EditorToolbar({ api, format, onPrint, onBrowseBlocks, viewing, onViewing, canEdit, collapsed, onCollapse, linkRequest, onError, onNotice }: Props) {
  const t = useT();
  const files = useFilesApi();
  const root = useRef<HTMLDivElement>(null);
  const [tier, setTier] = useState<Tier>(3);
  const imageInput = useRef<HTMLInputElement>(null);
  const replaceInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const lastRequest = useRef(linkRequest);
  useEffect(() => {
    const node = root.current; if (!node) return;
    const watch = new ResizeObserver(() => setTier(tierFor(node.clientWidth)));
    watch.observe(node); return () => watch.disconnect();
  }, [collapsed]);
  // Cmd/Ctrl + K asks for the link box; the counter in `linkRequest` is the request.
  useEffect(() => { if (linkRequest !== lastRequest.current) { lastRequest.current = linkRequest; if (api.current?.linkTarget()) { const timer = window.setTimeout(() => setLinkOpen(true), 0); return () => window.clearTimeout(timer); } } }, [linkRequest, api]);

  const a = () => api.current;
  const editable = canEdit && !viewing && format.editable;
  const text = format.kind === 'text' || format.kind === 'none'; const marked = editable && format.kind === 'text';
  const has = (mark: string) => format.marks.includes(mark);
  const size = format.size ?? BASE_SIZE;
  const style = styleOptions.find((option) => option.type === format.type);
  const alignActive = alignOptions.find((option) => option.id === format.align) ?? alignOptions[0];
  const list = format.type === 'BULLET' || format.type === 'NUMBERED' || format.type === 'TODO' ? format.type : null;

  async function pickImage(file: File | undefined, replace: boolean) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { onError(t('ed.tb.notImage')); return; }
    try {
      const saved = await files.upload(file);
      if (replace) a()?.replaceBlockFile(saved.id); else a()?.insertBlock('IMAGE', { fileId: saved.id });
      onNotice(t('ed.tb.imageAdded'));
    } catch (reason) { onError(reason instanceof Error ? reason.message : t('ed.tb.imageFailed')); }
  }

  // Every control, once. `min` is the smallest toolbar tier that shows it in the row; below that it lives in the More menu.
  type Control = { id: string; min: Tier; show: boolean; node: ReactNode };
  const groups: { id: string; controls: Control[] }[] = [
    { id: 'general', controls: [
      { id: 'find', min: 1, show: true, node: <ToolButton icon="search" label={t('ed.tb.find')} keys="Ctrl+F" onPress={() => a()?.openFind()} active={format.find} /> },
      { id: 'undo', min: 0, show: true, node: <ToolButton icon="undo" label={t('ed.tb.undo')} keys="Ctrl+Z" disabled={!editable || !format.canUndo} onPress={() => a()?.undo()} /> },
      { id: 'redo', min: 0, show: true, node: <ToolButton icon="redo" label={t('ed.tb.redo')} keys="Ctrl+Shift+Z" disabled={!editable || !format.canRedo} onPress={() => a()?.redo()} /> },
      { id: 'print', min: 2, show: true, node: <ToolButton icon="print" label={t('ed.tb.print')} keys="Ctrl+P" onPress={onPrint} /> },
    ] },
    { id: 'insert', controls: [
      { id: 'add', min: 0, show: canEdit && !viewing, node: <Menu label={t('ed.tb.addBlock')} wide trigger={<><EditorIcon name="plus" /><span className="et-label">{t('ed.tb.block')}</span><EditorIcon name="chevron" size={14} /></>}>{(close) => <div className="et-blocks">
        <Item onPick={() => { close(); onBrowseBlocks(); }} className="et-blocks__browse"><BlockIcon id="database-gallery" size={16} />{t('blk.browse')}</Item>
        {catalogCategories.map((category) => <div key={category} role="group" aria-label={t(`blk.cat.${category}` as Key)}><p>{t(`blk.cat.${category}` as Key)}</p>{blockCatalog.filter((entry) => entry.category === category && entry.id !== 'database-inline' && entry.id !== 'database-linked').map((entry) => <Item key={entry.id} onPick={() => { close(); a()?.insertEntry(entry, a()?.currentBlockId() ?? undefined); }}><BlockIcon id={entry.id} size={16} />{t(`blk.${entry.id}` as Key)}</Item>)}</div>)}
      </div>}</Menu> },
    ] },
  ];
  const textGroups: { id: string; controls: Control[] }[] = [
    { id: 'style', controls: [
      { id: 'style', min: 0, show: true, node: <Menu label={t('ed.tb.paragraphStyle')} className="et-btn--wide" trigger={<><span className="et-value">{style ? t(style.key) : t('ed.tb.normal')}</span><EditorIcon name="chevron" size={14} /></>}>{(close) => <>{styleOptions.map((option) => <Item key={option.id} active={format.type === option.type} onPick={() => { close(); a()?.setBlockType({ type: option.type }); }} className={`et-style ${option.className}`}>{t(option.key)}</Item>)}</>}</Menu> },
      { id: 'font', min: 2, show: text, node: <Menu label={t('ed.tb.fontFamily')} disabled={!marked || !format.canLayout} className="et-btn--wide" trigger={<><span className="et-value" style={{ fontFamily: fontOptions.find((option) => option.id === format.font)?.css }}>{t(fontOptions.find((option) => option.id === format.font)?.key ?? 'ed.tb.fontDefault')}</span><EditorIcon name="chevron" size={14} /></>}>{(close) => <>{fontOptions.map((option) => <Item key={option.id ?? 'default'} active={format.font === option.id} onPick={() => { close(); a()?.setLayout({ font: option.id ?? undefined }); }}><span style={{ fontFamily: option.css }}>{t(option.key)}</span></Item>)}</>}</Menu> },
      { id: 'size', min: 0, show: text, node: <span className="et-size" role="group" aria-label={t('ed.tb.fontSize')}>
        <ToolButton icon="minus" label={t('ed.tb.smaller')} disabled={!marked || !format.canLayout || size <= MIN_SIZE} onPress={() => a()?.setLayout({ size: stepSize(format.size ?? undefined, -1) })} />
        <Menu label={t('ed.tb.fontSize')} disabled={!marked || !format.canLayout} className="et-btn--size" trigger={<span className="et-value">{size}</span>}>{(close) => <>{fontSizes.map((value) => <Item key={value} active={size === value} onPick={() => { close(); a()?.setLayout({ size: value }); }}>{value}</Item>)}<Item onPick={() => { close(); a()?.setLayout({ size: undefined }); }}>{t('ed.tb.sizeDefault')}</Item></>}</Menu>
        <ToolButton icon="plus" label={t('ed.tb.larger')} disabled={!marked || !format.canLayout || size >= MAX_SIZE} onPress={() => a()?.setLayout({ size: clampSize(stepSize(format.size ?? undefined, 1)) })} />
      </span> },
    ] },
    { id: 'marks', controls: [
      { id: 'bold', min: 0, show: text, node: <ToolButton label={t('ed.tb.bold')} keys="Ctrl+B" active={has('bold')} disabled={!marked} onPress={() => a()?.toggleMark('bold')}><b>B</b></ToolButton> },
      { id: 'italic', min: 0, show: text, node: <ToolButton label={t('ed.tb.italic')} keys="Ctrl+I" active={has('italic')} disabled={!marked} onPress={() => a()?.toggleMark('italic')}><i>I</i></ToolButton> },
      { id: 'underline', min: 0, show: text, node: <ToolButton label={t('ed.tb.underline')} keys="Ctrl+U" active={has('underline')} disabled={!marked} onPress={() => a()?.toggleMark('underline')}><u>U</u></ToolButton> },
      { id: 'strike', min: 2, show: text, node: <ToolButton label={t('ed.tb.strike')} keys="Ctrl+Shift+X" active={has('strike')} disabled={!marked} onPress={() => a()?.toggleMark('strike')}><s>S</s></ToolButton> },
      { id: 'code', min: 3, show: text, node: <ToolButton label={t('ed.tb.code')} keys="Ctrl+E" active={has('code')} disabled={!marked} onPress={() => a()?.toggleMark('code')}><code>{'</>'}</code></ToolButton> },
      { id: 'colour', min: 0, show: text, node: <Menu label={t('ed.tb.textColour')} disabled={!marked} active={Boolean(format.colour)} className="et-btn--colour" trigger={<><span className={`et-colour${format.colour ? ` md-c-${format.colour}` : ''}`}><EditorIcon name="colour" /></span><EditorIcon name="chevron" size={14} /></>}>{(close) => <Palette prefix="" current={format.colour} none={t('ed.fmt.noColour')} onPick={(tone) => { close(); a()?.setTone(tone); }} />}</Menu> },
      { id: 'highlight', min: 2, show: text, node: <Menu label={t('ed.tb.highlightColour')} disabled={!marked} active={Boolean(format.background) || has('highlight')} className="et-btn--colour" trigger={<><span className="et-colour"><EditorIcon name="highlight" /><i className={format.background ? `md-c-bg-${format.background}` : 'is-none'} /></span><EditorIcon name="chevron" size={14} /></>}>{(close) => <><Item active={has('highlight')} onPick={() => { close(); a()?.toggleMark('highlight'); }}>{t('ed.tb.markHighlight')}</Item><Palette prefix="bg-" current={format.background} none={t('ed.fmt.noColour')} onPick={(tone) => { close(); a()?.setTone(tone); }} /></>}</Menu> },
    ] },
    { id: 'insertions', controls: [
      { id: 'link', min: 0, show: text, node: <Popover keepFocus align="start" label={t('ed.tb.link')} buttonLabel={t('ed.tb.link')} buttonTitle={`${t('ed.tb.link')} (${shortcut('Ctrl+K')})`} disabled={!marked || !format.hasSelection} className="et-menu et-menu--link" buttonClass={`et-btn${has('link') ? ' is-active' : ''}`} buttonContent={<EditorIcon name="link" />}>{(close) => <LinkBox api={api.current as DocEditorApi} onClose={close} requested={false} />}</Popover> },
      { id: 'comment', min: 1, show: text || format.kind === 'code', node: <ToolButton icon="comment" label={t('ed.tb.comment')} disabled={!editable} onPress={() => a()?.commentSelection()} /> },
      { id: 'image', min: 1, show: canEdit && !viewing, node: <ToolButton icon="image" label={t('ed.tb.image')} disabled={!editable} onPress={() => imageInput.current?.click()} /> },
      { id: 'table', min: 1, show: canEdit && !viewing, node: <ToolButton icon="table" label={t('ed.tb.table')} disabled={!editable} onPress={() => a()?.insertBlock('TABLE')} /> },
    ] },
    { id: 'paragraph', controls: [
      { id: 'align', min: 0, show: text, node: <Menu label={t('ed.tb.align')} disabled={!marked || !format.canLayout} active={format.align !== null} trigger={<><EditorIcon name={alignActive.icon} /><EditorIcon name="chevron" size={14} /></>}>{(close) => <div className="et-row">{alignOptions.map((option) => <ToolButton key={option.id ?? 'left'} icon={option.icon} label={t(option.key)} active={format.align === option.id} onPress={() => { close(); a()?.setLayout({ align: option.id ?? undefined }); }} />)}</div>}</Menu> },
      { id: 'spacing', min: 2, show: text, node: <Menu label={t('ed.tb.lineSpacing')} disabled={!marked || !format.canLayout} active={format.spacing !== null} trigger={<><EditorIcon name="spacing" /><EditorIcon name="chevron" size={14} /></>}>{(close) => <>{lineSpacings.map((value) => <Item key={value} active={(format.spacing ?? 1.15) === value || (format.spacing === null && value === 1.15)} onPick={() => { close(); a()?.setLayout({ spacing: value === 1.15 ? undefined : value }); }}>{value === 1.15 ? t('ed.tb.spacingDefault') : value}</Item>)}</>}</Menu> },
      { id: 'todo', min: 1, show: text, node: <ToolButton icon="checklist" label={t('blk.todo-list')} active={list === 'TODO'} disabled={!marked} onPress={() => a()?.toggleList('TODO')} /> },
      { id: 'bullet', min: 0, show: text, node: <ToolButton icon="bullets" label={t('blk.bulleted-list')} active={list === 'BULLET'} disabled={!marked} onPress={() => a()?.toggleList('BULLET')} /> },
      { id: 'numbered', min: 1, show: text, node: <ToolButton icon="numbered" label={t('blk.numbered-list')} active={list === 'NUMBERED'} disabled={!marked} onPress={() => a()?.toggleList('NUMBERED')} /> },
      { id: 'outdent', min: 2, show: text, node: <ToolButton icon="indentOut" label={t('ed.tb.outdent')} keys="Shift+Tab" disabled={!marked || !format.canOutdent} onPress={() => a()?.indent(-1)} /> },
      { id: 'indent', min: 2, show: text, node: <ToolButton icon="indentIn" label={t('ed.tb.indent')} keys="Tab" disabled={!marked || !format.canIndent} onPress={() => a()?.indent(1)} /> },
      { id: 'clear', min: 1, show: text, node: <ToolButton icon="clear" label={t('ed.tb.clear')} disabled={!marked} onPress={() => a()?.clearFormatting()} /> },
    ] },
  ];
  // Controls for the selected block when it is not text: an image, a table, or any other block.
  const blockGroups: { id: string; controls: Control[] }[] = format.kind === 'image' ? [
    { id: 'image-tools', controls: [
      { id: 'full', min: 0, show: true, node: <ToolButton icon="widthFull" label={t('ed.tb.widthFull')} active={!format.half} disabled={!editable} onPress={() => a()?.setHalf(false)} /> },
      { id: 'half', min: 0, show: true, node: <ToolButton icon="widthHalf" label={t('ed.tb.widthHalf')} active={format.half} disabled={!editable} onPress={() => a()?.setHalf(true)} /> },
      { id: 'replace', min: 0, show: true, node: <ToolButton icon="image" label={t('ed.tb.replaceImage')} disabled={!editable} onPress={() => replaceInput.current?.click()}><span className="et-label">{t('ed.tb.replaceImage')}</span></ToolButton> },
    ] },
  ] : format.kind === 'table' ? [
    { id: 'table-tools', controls: [
      { id: 'rowAbove', min: 0, show: true, node: <ToolButton icon="rowAdd" label={t('tbl.rowAbove')} disabled={!editable || format.rows >= 30} onPress={() => a()?.tableOp('rowAbove')} /> },
      { id: 'rowBelow', min: 0, show: true, node: <ToolButton icon="rowAdd" label={t('tbl.rowBelow')} disabled={!editable || format.rows >= 30} onPress={() => a()?.tableOp('rowBelow')} /> },
      { id: 'delRow', min: 0, show: true, node: <ToolButton icon="rowRemove" label={t('tbl.rowDelete')} disabled={!editable || format.rows <= 1} onPress={() => a()?.tableOp('deleteRow')} /> },
      { id: 'colBefore', min: 1, show: true, node: <ToolButton icon="colAdd" label={t('tbl.colBefore')} disabled={!editable || format.columns >= 8} onPress={() => a()?.tableOp('colBefore')} /> },
      { id: 'colAfter', min: 1, show: true, node: <ToolButton icon="colAdd" label={t('tbl.colAfter')} disabled={!editable || format.columns >= 8} onPress={() => a()?.tableOp('colAfter')} /> },
      { id: 'delCol', min: 1, show: true, node: <ToolButton icon="colRemove" label={t('tbl.colDelete')} disabled={!editable || format.columns <= 1} onPress={() => a()?.tableOp('deleteColumn')} /> },
      { id: 'delTable', min: 1, show: true, node: <ToolButton icon="trash" label={t('tbl.delete')} disabled={!editable} onPress={() => a()?.tableOp('deleteTable')} className="et-btn--danger" /> },
    ] },
  ] : [];
  const blockActions: Control[] = format.kind === 'image' || format.kind === 'table' || format.kind === 'atom' ? [
    { id: 'up', min: 0, show: true, node: <ToolButton icon="up" label={t('ed.moveUp')} disabled={!editable} onPress={() => a()?.blockOp('up')} /> },
    { id: 'down', min: 0, show: true, node: <ToolButton icon="down" label={t('ed.moveDown')} disabled={!editable} onPress={() => a()?.blockOp('down')} /> },
    { id: 'dup', min: 2, show: true, node: <ToolButton icon="copy" label={t('ed.duplicateBlock')} disabled={!editable} onPress={() => a()?.blockOp('duplicate')} /> },
    { id: 'del', min: 0, show: true, node: <ToolButton icon="trash" label={t('ed.deleteBlock')} disabled={!editable} onPress={() => a()?.blockOp('delete')} className="et-btn--danger" /> },
  ] : [];

  const all = [...groups.slice(0, 1), ...(format.kind === 'none' || format.kind === 'code' || format.kind === 'text' ? textGroups.filter((group) => text || group.id === 'style' || group.id === 'insertions') : []), ...blockGroups, ...(blockActions.length ? [{ id: 'block', controls: blockActions }] : []), ...groups.slice(1)]
    .map((group) => ({ ...group, controls: group.controls.filter((control) => control.show) })).filter((group) => group.controls.length);
  const inRow = (control: Control) => tier >= control.min;
  const overflow = all.map((group) => ({ ...group, controls: group.controls.filter((control) => !inRow(control)) })).filter((group) => group.controls.length);

  if (collapsed) return <div className="et-bar et-bar--collapsed" ref={root}><ToolButton icon="chevron" label={t('ed.tb.expand')} onPress={() => onCollapse(false)} /><span className="et-hint">{t('ed.tb.collapsedHint')}</span></div>;

  return <div className="et-bar" role="toolbar" aria-label={t('ed.tb.label')} ref={root}>
    <div className="et-row-main">
      {all.map((group, index) => { const shown = group.controls.filter(inRow); return shown.length ? <div className="et-group" role="group" key={group.id} data-group={group.id}>{index > 0 && <span className="et-sep" aria-hidden="true" />}{shown.map((control) => <span key={control.id} className="et-slot">{control.node}</span>)}</div> : null; })}
      <span className="et-spacer" />
      <div className="et-group et-group--end" role="group">
        <span className="et-sep" aria-hidden="true" />
        {canEdit && <Menu label={viewing ? t('ed.tb.viewing') : t('ed.tb.editing')} className="et-btn--mode" trigger={<><EditorIcon name={viewing ? 'eye' : 'pencil'} /><span className="et-label">{viewing ? t('ed.tb.viewing') : t('ed.tb.editing')}</span><EditorIcon name="chevron" size={14} /></>}>{(close) => <>
          <Item active={!viewing} onPick={() => { close(); onViewing(false); }}><EditorIcon name="pencil" size={16} />{t('ed.tb.editing')}</Item>
          <Item active={viewing} onPick={() => { close(); onViewing(true); }}><EditorIcon name="eye" size={16} />{t('ed.tb.viewing')}</Item></>}</Menu>}
        {overflow.length > 0 && <Menu label={t('ed.tb.more')} wide trigger={<EditorIcon name="more" />}>{() => <div className="et-overflow">{overflow.map((group) => <div className="et-overflow__group" key={group.id} role="group">{group.controls.map((control) => <span key={control.id} className="et-slot">{control.node}</span>)}</div>)}</div>}</Menu>}
        <ToolButton icon="chevronUp" label={t('ed.tb.collapse')} onPress={() => onCollapse(true)} />
      </div>
    </div>
    <input ref={imageInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void pickImage(file, false); }} />
    <input ref={replaceInput} type="file" accept="image/*" hidden onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void pickImage(file, true); }} />
    {linkOpen && <div className="et-linkfloat"><LinkBox api={api.current as DocEditorApi} onClose={() => { setLinkOpen(false); api.current?.focus(); }} requested /></div>}
  </div>;
}
