# 1.18 · Database CSV import and export

## Goal

Let workspace members import and export structured database records using CSV.

## Delivered

- Added browser-side CSV export for currently visible (filtered and sorted) records.
- Added quoted-field CSV parsing and typed import handling for text, status, number, checkbox, and date properties.
- Added an authenticated bulk import endpoint with workspace scoping, row validation, and a 500-row limit.
- Added spreadsheet formula-injection mitigation during export.
- Added documentation for property headers and relation-field limitations.

## Review notes

- Use database property names as the CSV header row; imported columns may be a subset of the database properties.
- Relation fields are omitted from export and rejected on import; create those links after importing records.
- Imports over 500 rows or 1.5 MB are rejected, and invalid rows fail the whole import.
