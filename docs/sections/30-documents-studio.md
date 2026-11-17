# Section 1.30 · Documents Studio

## Goal

Make documents a practical writing space that connects structured content to project work and keeps a recoverable editing history.

## Delivered

- Add a dedicated editor route for every saved document.
- Support paragraph, two heading levels, bulleted and numbered items, to-do, quote, code, callout, and divider blocks.
- Add, reorder, change type, and remove blocks; persist the structured block format in the existing document content field.
- Continue opening older plain-text documents by treating their existing content as the first paragraph.
- Autosave title and block changes with a visible save state and a manual save action.
- Build a document outline from headings.
- Convert a to-do block into a workspace task, linking it to the document's project when one exists.
- Add document comments with resolve and reopen controls.
- Add labelled manual versions, a recent history list, and restore that first captures the current document.
- Route document creation and search results directly to the editor; show readable block text in document previews and search excerpts.
- Keep autosave out of the activity feed while recording comments and version actions.

## Scope notes

This is a single-user autosaving editor with workspace-level comments and manual snapshots. Live co-editing, block-level anchored comments, inline text formatting, embedded databases, slash menus, and AI writing assistance remain future work. Versions are saved explicitly and before a restore; autosave itself does not create a version for every edit.

## Data change

The migration adds workspace-scoped `document_versions` and `document_comments` tables. Apply migrations and regenerate Prisma Client before starting the API:

```bash
npm run db:migrate:deploy
npm run db:generate
```

## Review

1. Create or open a document and add several block types.
2. Reload after edits and confirm the title, block order, and to-do state persist.
3. Add headings and use the outline to jump between them.
4. Turn a to-do into a task and confirm it appears in My Tasks (and its linked project, if any).
5. Add and resolve a comment.
6. Save a labelled version, make edits, restore that version, and confirm the pre-restore version is also retained.

Suggested commit message: `feat: build AVEN Documents Studio`
