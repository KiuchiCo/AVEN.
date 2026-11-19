export type DocumentBlock = { id: string; type: 'PARAGRAPH' | 'HEADING_1' | 'HEADING_2' | 'BULLET' | 'NUMBERED' | 'QUOTE' | 'TODO'; text: string; checked: boolean };

const MAX_BLOCKS = 200;
const MAX_TEXT = 2000;
const MAX_CONTENT = 100_000;

/** Converts simple Markdown-style text (what the assistant writes) into the document editor's blocks. */
export function textToBlocks(text: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  const push = (type: DocumentBlock['type'], value: string, checked = false) => {
    const clean = value.trim().slice(0, MAX_TEXT);
    if (clean && blocks.length < MAX_BLOCKS) blocks.push({ id: crypto.randomUUID(), type, text: clean, checked });
  };
  let paragraph: string[] = [];
  const flush = () => { push('PARAGRAPH', paragraph.join(' ')); paragraph = []; };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    let match: RegExpExecArray | null;
    if (!line) flush();
    else if ((match = /^#\s+(.*)$/.exec(line))) { flush(); push('HEADING_1', match[1]); }
    else if ((match = /^#{2,6}\s+(.*)$/.exec(line))) { flush(); push('HEADING_2', match[1]); }
    else if ((match = /^[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line))) { flush(); push('TODO', match[2], match[1] !== ' '); }
    else if ((match = /^[-*•]\s+(.*)$/.exec(line))) { flush(); push('BULLET', match[1]); }
    else if ((match = /^\d+[.)]\s+(.*)$/.exec(line))) { flush(); push('NUMBERED', match[1]); }
    else if ((match = /^>\s?(.*)$/.exec(line))) { flush(); push('QUOTE', match[1]); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

/** Encodes blocks for storage, dropping trailing blocks if the document would exceed the size limit. */
export function encodeBlocks(blocks: DocumentBlock[]): string {
  let kept = blocks;
  let encoded = JSON.stringify({ format: 'aven-doc-v1', blocks: kept });
  while (encoded.length > MAX_CONTENT && kept.length > 1) { kept = kept.slice(0, Math.floor(kept.length * 0.9)); encoded = JSON.stringify({ format: 'aven-doc-v1', blocks: kept }); }
  return encoded;
}

/** A sensible document title: the first heading, else the first line, trimmed to 80 characters. */
export function titleFromText(text: string, fallback = 'AVEN Intelligence note'): string {
  const first = text.split('\n').map((line) => line.replace(/^#+\s*/, '').replace(/^[-*>\s]+/, '').trim()).find(Boolean);
  return (first ?? fallback).slice(0, 80);
}
