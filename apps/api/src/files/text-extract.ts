import { BadRequestException } from '@nestjs/common';
import { OFFICE_EXTENSIONS, officeToText } from './office-text.js';
import { PdfError, pdfToText } from './pdf-text.js';

export const KNOWLEDGE_TEXT_LIMIT = 20_000;
export const READABLE_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'html', 'htm', 'log'] as const;
const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function extension(name: string) { return name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''; }

/** Text of a web page: scripts and styles dropped, block tags become line breaks, common entities decoded. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|section|article|li|tr|h[1-6]|ul|ol|table|blockquote)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/g, (entity) => entities[entity] ?? entity);
}

/**
 * Turns an uploaded file into plain text for a Knowledge entry. Text formats and Word, PowerPoint and Excel (zip+XML) files are read (nothing is guessed from
 * other binary files such as PDFs), and the result is cut to what a Knowledge entry can hold.
 */
export function extractText(name: string, mimeType: string, bytes: Buffer): { text: string; truncated: boolean } {
  const ext = extension(name);
  if ((OFFICE_EXTENSIONS as readonly string[]).includes(ext)) {
    const raw = officeToText(ext, bytes);
    if (raw === null) throw new BadRequestException(`That ${ext.toUpperCase()} file couldn’t be read. It may be damaged or password-protected.`);
    return finish(raw);
  }
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    let raw: string;
    try { raw = pdfToText(bytes); } catch (error) { throw new BadRequestException(error instanceof PdfError ? error.message : 'That PDF couldn’t be read.'); }
    if (!raw.trim()) throw new BadRequestException('There is no readable text in that PDF. It may be a scan or made of images.');
    return finish(raw);
  }
  const readable = (READABLE_EXTENSIONS as readonly string[]).includes(ext) || mimeType.startsWith('text/') || mimeType === 'application/json';
  if (!readable) throw new BadRequestException(`AVEN can read text files (${READABLE_EXTENSIONS.map((e) => `.${e}`).join(', ')}). Word (.docx), PowerPoint (.pptx) and Excel (.xlsx) files can be read too. Text-based PDFs can be read too. Scanned PDFs and older .doc/.xls files can’t be read yet.`);
  if (bytes.includes(0)) throw new BadRequestException('That file looks like binary data, not text.');
  let text = bytes.toString('utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (ext === 'html' || ext === 'htm' || mimeType === 'text/html') text = htmlToText(text);
  else if (ext === 'json' || mimeType === 'application/json') { try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep the raw text */ } }
  return finish(text);
}

function finish(input: string): { text: string; truncated: boolean } {
  let text = input.replace(/\r\n?/g, '\n');
  text = text.split('\n').map((line) => line.replace(/[ \t]+$/g, '')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new BadRequestException('There is no readable text in that file.');
  if (text.length <= KNOWLEDGE_TEXT_LIMIT) return { text, truncated: false };
  return { text: text.slice(0, KNOWLEDGE_TEXT_LIMIT).trimEnd(), truncated: true };
}

/** "Quarterly Plan.v2.md" becomes "Quarterly Plan.v2". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[A-Za-z0-9]{1,8}$/, '').replace(/[_]+/g, ' ').trim();
  return (base || name).slice(0, 200);
}
