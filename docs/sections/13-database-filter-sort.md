# Section 1.13 · Database filtering and sorting

**Milestone:** Phase 2 · Useful table views  
**Suggested commit:** `feat: add database filtering and sorting`  
**Status:** Implemented; review with a signed-in workspace database.

## What this section adds

- Search across the current database's text, number, status, date, and checkbox values.
- Sort records by any property or by last updated time.
- Choose ascending or descending order, with empty values kept at the bottom.
- Show the number of matching records when a filter is active.

Filtering and sorting run against the records already loaded for the selected database. No migration is required. Saved views and server-side pagination remain follow-up work.

## Review

Add a few records with different values, search for a value, change the sort field and direction, and confirm the rows update without changing stored records.
