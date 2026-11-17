# 1.16 · Database gallery views

## Goal

Add a visual card layout for structured records while keeping table and status board views available.

## Delivered

- Added Gallery as a database view layout and persisted it in saved views.
- Displayed record names, up to four additional properties, and last-updated dates on cards.
- Added an ivory and bronze gallery presentation with responsive card columns.
- Added migration `20261117000500_database_gallery_views`.

## Review notes

- Gallery cards use the Name property when present, otherwise the first text property, then the first available property.
- Cards show current database values and respond to the active text filter and sort order.
- The gallery does not change stored records; edits remain available in Table view.
