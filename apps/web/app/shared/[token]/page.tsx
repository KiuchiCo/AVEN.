import { RichText } from '../../workspace/documents/[documentId]/editor-ui';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { pickLanguage, translate, type LanguageCode } from '../../i18n/core';
import type { Key } from '../../i18n/en';
import { PrintButton } from './PrintButton';

export const dynamic = 'force-dynamic';
/** A shared link is opened by people outside the workspace, so the page speaks their browser's language. */
const readerLanguage = async (): Promise<LanguageCode> => pickLanguage((await headers()).get('accept-language'));
export async function generateMetadata(): Promise<Metadata> {
  return { title: translate(await readerLanguage(), 'sh.pageTitle'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

const api = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Block = { type: string; text: string; checked?: boolean; rows?: string[][]; image?: string | null; level?: number; indent?: number; tab?: number; href?: string; tabs?: string[]; meta?: string; layout?: { align?: 'center' | 'right' | 'justify'; spacing?: number; font?: 'sans' | 'serif' | 'mono'; size?: number } };
const fonts = { sans: 'var(--aven-interface-font)', serif: 'var(--aven-display-font)', mono: "ui-monospace, 'SF Mono', Menlo, monospace" } as const;
type Shared = { title: string; updatedAt: string; allowDownload: boolean; allowPrint: boolean; blocks: Block[] };

async function load(token: string): Promise<Shared | null> {
  try {
    const response = await fetch(`${api}/shared/documents/${encodeURIComponent(token)}`, { cache: 'no-store' });
    return response.ok ? await response.json() as Shared : null;
  } catch { return null; }
}

/** For content inside a tabs block: the tab's name above the first block of each tab. */
function tabLabels(blocks: Block[], t: T): (string | null)[] {
  let tabs: { depth: number; titles: string[]; shown: number } | null = null;
  return blocks.map((block) => {
    const depth = block.indent ?? 0; let label: string | null = null;
    if (tabs && depth <= tabs.depth) tabs = null;
    if (tabs && depth > tabs.depth && (block.tab ?? 0) !== tabs.shown) { tabs.shown = block.tab ?? 0; label = tabs.titles[tabs.shown] || t('sh.tab', { n: tabs.shown + 1 }); }
    if (block.type === 'TABS') tabs = { depth, titles: block.tabs ?? [], shown: -1 };
    return label;
  });
}

/** The API names withheld blocks in English (share-rules.ts); each known name has its own translated sentence. */
const restricted: Record<string, Key> = { 'A linked page': 'sh.r.page', 'An attached file': 'sh.r.file', 'A video': 'sh.r.video', 'An audio file': 'sh.r.audio', 'A database': 'sh.r.database', 'A database view': 'sh.r.view' };
type T = (key: Key, values?: Record<string, string | number>) => string;
const plain = (text: string) => text.replace(/\*\*|~~|\+\+|==|`|\{(?:bg-)?[a-z]+:|\}/g, '');

/** The document, as a reader sees it: the same inline formatting as the editor, no controls of any kind. */
function Blocks({ blocks, t }: { blocks: Block[]; t: T }) {
  // A numbered item counts up through the run of numbered items at its own depth.
  const numbers = blocks.map((block, index) => { if (block.type !== 'NUMBERED') return 0; let n = 1; for (let i = index - 1; i >= 0; i -= 1) { const before = blocks[i]; if ((before.indent ?? 0) < (block.indent ?? 0)) break; if ((before.indent ?? 0) === (block.indent ?? 0)) { if (before.type !== 'NUMBERED') break; n += 1; } } return n; });
  const headings = blocks.filter((block) => block.type.startsWith('HEADING_') && block.text.trim());
  const labels = tabLabels(blocks, t);
  return <>{blocks.map((block, index) => {
    const depth = block.indent ?? 0; const look = block.layout;
    const built = { ...(depth ? { marginLeft: `${depth * 22}px` } : {}), ...(look?.align ? { textAlign: look.align } : {}), ...(look?.spacing ? { lineHeight: look.spacing } : {}), ...(look?.font ? { fontFamily: fonts[look.font] } : {}), ...(look?.size ? { fontSize: `${look.size}px` } : {}) };
    const style = Object.keys(built).length ? built : undefined;
    const label = labels[index] ? <h4 className="shared-doc__tab" style={style}>{labels[index]}</h4> : null;
    const number = numbers[index];
    const body = (() => {
      switch (block.type) {
        case 'HEADING_1': return <h2 id={`h-${index}`} style={style}><RichText text={block.text} /></h2>;
        case 'HEADING_2': return <h3 id={`h-${index}`} style={style}><RichText text={block.text} /></h3>;
        case 'HEADING_3': return <h4 id={`h-${index}`} style={style}><RichText text={block.text} /></h4>;
        case 'HEADING_4': return <h5 id={`h-${index}`} style={style}><RichText text={block.text} /></h5>;
        case 'EQUATION': case 'MERMAID': return <pre style={style}><code>{block.text}</code></pre>;
        case 'TOGGLE': return block.level ? <h3 style={style} className="shared-doc__toggle"><RichText text={block.text} /></h3> : <p style={style} className="shared-doc__toggle"><strong><RichText text={block.text} /></strong></p>;
        case 'BULLET': return <p className="shared-doc__item" style={style}><span aria-hidden="true">{['•', '–', '·'][depth % 3]}</span><span><RichText text={block.text} /></span></p>;
        case 'NUMBERED': return <p className="shared-doc__item" style={style}><span aria-hidden="true">{number}.</span><span><RichText text={block.text} /></span></p>;
        case 'TODO': return <p className="shared-doc__item" style={style}><input type="checkbox" checked={Boolean(block.checked)} disabled aria-label={block.checked ? t('sh.done') : t('sh.notDone')} /><span><RichText text={block.text} /></span></p>;
        case 'QUOTE': return <blockquote style={style}><RichText text={block.text} /></blockquote>;
        case 'CODE': return <pre style={style}><code>{block.text}</code></pre>;
        case 'CALLOUT': return <aside className="shared-doc__callout" style={style}><RichText text={block.text} /></aside>;
        case 'DIVIDER': return <hr />;
        case 'TABLE': return <div className="shared-doc__table" style={style}><table><tbody>{(block.rows ?? []).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>;
        case 'MEETING': return <section className="shared-doc__meeting" style={style}><h3>{block.text || t('sh.meeting')}</h3>{block.meta && <p><em>{block.meta}</em></p>}</section>;
        case 'BOOKMARK': return <p style={style}>{block.href ? <a href={block.href} target="_blank" rel="noopener noreferrer nofollow">{block.text}</a> : block.text}</p>;
        case 'TOC': return headings.length ? <nav className="shared-doc__toc" aria-label={t('sh.contents')}><strong>{t('sh.contents')}</strong>{headings.map((heading) => { const at = blocks.indexOf(heading); return <a key={at} href={`#h-${at}`} style={{ marginLeft: `${(Number(heading.type.slice(-1)) - 1) * 16}px` }}>{plain(heading.text)}</a>; })}</nav> : null;
        case 'RESTRICTED': return <p className="shared-doc__restricted" style={style}>{restricted[block.text] ? t(restricted[block.text]) : t('sh.restricted', { what: block.text })}</p>;
        case 'IMAGE': {
          if (!block.image) return null;
          const src = `${api?.replace(/\/api\/v1$/, '')}${block.image}`;
          // eslint-disable-next-line @next/next/no-img-element -- a public share image, loaded straight from the API
          return <figure style={style}><img src={src} alt={block.text} />{block.text && <figcaption>{block.text}</figcaption>}</figure>;
        }
        default: return <p style={style}><RichText text={block.text} /></p>;
      }
    })();
    return <div key={index} className="shared-doc__block">{label}{body}</div>;
  })}</>;
}

export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await load(token);
  const language = await readerLanguage();
  const t: T = (key, values) => translate(language, key, values);
  const download = (format: 'pdf' | 'docx') => `${api}/shared/documents/${encodeURIComponent(token)}/export?format=${format}`;
  return <main lang={language} className={`shared-doc${shared && !shared.allowPrint ? ' shared-doc--noprint' : ''}`}>
    <header><span className="shared-doc__brand">AVEN.</span>{shared && <span>{t('sh.readOnly')}</span>}</header>
    {shared ? <article>
      <h1>{shared.title}</h1>
      {(shared.allowDownload || shared.allowPrint) && <div className="shared-doc__actions" role="group" aria-label={t('sh.saveOrPrint')}>
        {shared.allowDownload && <a className="shared-doc__action" href={download('pdf')} download rel="nofollow">{t('sh.pdf')}</a>}
        {shared.allowDownload && <a className="shared-doc__action" href={download('docx')} download rel="nofollow">{t('sh.word')}</a>}
        {shared.allowPrint && <PrintButton label={t('sh.print')} />}
      </div>}
      <Blocks blocks={shared.blocks} t={t} />
      <footer>{t('sh.footer', { date: new Date(shared.updatedAt).toISOString().slice(0, 10) })}</footer>
    </article>
      : <article><h1>{t('sh.goneTitle')}</h1><p>{t('sh.goneText')}</p></article>}
  </main>;
}
