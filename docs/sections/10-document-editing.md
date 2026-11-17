# Section 1.10 · Document editing

**Milestone:** Phase 2.1 · Persistent document writing  
**Suggested commit:** `feat: add persistent document editing`  
**Status:** Implemented; verify with a live Clerk session and PostgreSQL database.

## What this section adds

- An authenticated document update endpoint for title and content.
- Workspace membership checks and workspace-scoped document updates.
- Inline editing on saved document cards, with cancel and save actions.
- Loading and error feedback from the existing Documents screen.
- Updated timestamps continue to be managed by Prisma, so saved edits sort and display as recent changes.

## API

```text
PATCH /api/v1/workspaces/:workspaceId/documents/:documentId
```

The API validates the UUIDs, verifies the current user belongs to the workspace, limits titles to 200 characters and content to 20,000 characters, and updates only a document in that workspace.

## Review checklist

- [x] Edit and save an existing document title or content.
- [x] Cancel an edit without changing the saved version.
- [x] Scope document updates to the active workspace.
- [ ] Verify edits persist across reloads with live Clerk and PostgreSQL services.
