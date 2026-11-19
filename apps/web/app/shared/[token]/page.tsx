import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Shared document · AVEN.', robots: { index: false, follow: false }, referrer: 'no-referrer' };

const api = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '');
type Block = { type: string; text: string; checked?: boolean; rows?: string[][]; image?: string | null };
type Shared = { title: string; updatedAt: string; blocks: Block[] };

async function load(token: string): Promise<Shared | null> {
  try {
    const response = await fetch(`${api}/shared/documents/${encodeURIComponent(token)}`, { cache: 'no-store' });
    return response.ok ? await response.json() as Shared : null;
  } catch { return null; }
}

function Blocks({ blocks }: { blocks: Block[] }) {
  // A numbered item counts up through the run of numbered items before it.
  const numbers = blocks.map((block, index) => { let n = 0; for (let i = index; i >= 0 && blocks[i].type === 'NUMBERED'; i -= 1) n += 1; return block.type === 'NUMBERED' ? n : 0; });
  return <>{blocks.map((block, index) => {
    const number = numbers[index];
    switch (block.type) {
      case 'HEADING_1': return <h2 key={index}>{block.text}</h2>;
      case 'HEADING_2': return <h3 key={index}>{block.text}</h3>;
      case 'BULLET': return <p key={index} className="shared-doc__item"><span aria-hidden="true">•</span>{block.text}</p>;
      case 'NUMBERED': return <p key={index} className="shared-doc__item"><span aria-hidden="true">{number}.</span>{block.text}</p>;
      case 'TODO': return <p key={index} className="shared-doc__item"><input type="checkbox" checked={Boolean(block.checked)} disabled aria-label={block.checked ? 'Done' : 'Not done'} />{block.text}</p>;
      case 'QUOTE': return <blockquote key={index}>{block.text}</blockquote>;
      case 'CODE': return <pre key={index}><code>{block.text}</code></pre>;
      case 'CALLOUT': return <aside key={index} className="shared-doc__callout">{block.text}</aside>;
      case 'DIVIDER': return <hr key={index} />;
      case 'TABLE': return <div key={index} className="shared-doc__table"><table><tbody>{(block.rows ?? []).map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c}>{cell}</td>)}</tr>)}</tbody></table></div>;
      case 'IMAGE': {
        if (!block.image) return null;
        const src = `${api?.replace(/\/api\/v1$/, '')}${block.image}`;
        // eslint-disable-next-line @next/next/no-img-element -- a public share image, loaded straight from the API
        return <figure key={index}><img src={src} alt={block.text} />{block.text && <figcaption>{block.text}</figcaption>}</figure>;
      }
      default: return <p key={index}>{block.text}</p>;
    }
  })}</>;
}

export default async function SharedDocumentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await load(token);
  return <main className="shared-doc">
    <header><span className="shared-doc__brand">AVEN.</span><span>Shared with you · read only</span></header>
    {shared ? <article><h1>{shared.title}</h1><Blocks blocks={shared.blocks} /><footer>Last updated {new Date(shared.updatedAt).toISOString().slice(0, 10)}</footer></article>
      : <article><h1>This link is no longer available</h1><p>It may have been turned off or expired. Ask the person who sent it for a new one.</p></article>}
  </main>;
}
