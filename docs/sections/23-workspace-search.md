# 1.23 · Workspace search

This milestone adds an authenticated search surface that makes saved workspace information easier to find and provides a retrieval foundation for AVEN Intelligence.

## Goal

Search across core AVEN records without crossing workspace boundaries.

## Delivered

- Added `GET /api/v1/workspaces/:workspaceId/search?q=...` for projects, tasks, documents, databases, and database records.
- Added a Search page with a debounced query field, result type filters, snippets, and links into the relevant workspace area.
- Added a top bar search entry and `⌘ K` / `Ctrl K` shortcut.
- Kept search behind Clerk authentication and workspace membership checks.
- Updated the README's product state and section index.

## Review notes

- Queries must contain 2 to 100 characters; search returns at most 40 results.
- Database records are searched among the 300 most recently updated records in the workspace. This bounded first version does not yet provide full-text indexing or pagination.
- Search results link to their owning module; direct opening of a specific record from search is a future enhancement.
