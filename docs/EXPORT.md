# Document export (PDF and Word)

`GET /workspaces/:workspaceId/documents/:documentId/export?format=pdf|docx` gives a signed-in member a file made from the **saved** document (the web app saves, and waits for live text to be sent, before it asks). A shared link with downloads allowed has the same thing at `GET /shared/documents/:token/export?format=…`; what a link reader gets is the same restricted view they see on the page.

Code: `apps/api/src/export/`. One model, two writers:

- `document-model.ts` turns saved blocks into export nodes through a registry (`exporters`), one entry per block type. A block type nobody registered still shows its text, or says it is there. Containers (toggle, tabs, meeting notes) export their content in order.
- `docx.ts` writes real Office Open XML with the `docx` library (heading styles, numbering, tables, images, hyperlinks, a page-number footer); everything stays editable.
- `pdf.ts` draws an A4 PDF with `pdfkit` and embedded fonts (Inter, Playfair Display, JetBrains Mono, OFL-licensed, in `apps/api/assets/fonts`).

How each block is exported, and the limits:

| Block | PDF and Word |
| --- | --- |
| Text, headings, lists (nested), to-dos, quotes, callouts, dividers, code, tables, images with captions, links | As themselves. Bold, italic, underline, strike, inline code and text colours are kept; highlights are kept in Word only. |
| Equation | The LaTeX source, centred. It is not typeset. |
| Mermaid | The diagram source in a labelled code block. It is not drawn as a picture. |
| Toggle, tabs, meeting notes, synced block | Opened out: summary, then content; each tab with its name; meeting title, date and attendees, then notes. |
| Database | A table of up to 200 records. Chart views (bar, donut, line, number, dashboard) become the counts behind the chart. |
| File, video, audio, linked page | A line naming it (or that it is not available to this reader). Files are not embedded. |
| Table of contents | Built from the headings. |
| Buttons, breadcrumbs | Left out: they are controls, not content. |

The PDF fonts cover Latin text (including accents). Characters outside them, such as Chinese, Japanese, Arabic or emoji, print as "?" in the PDF; the Word file keeps them. Images are limited to 12 MB each and 40 per document; a damaged image becomes a note. Exports are built in memory, three at a time per API process, with a per-address rate limit.
