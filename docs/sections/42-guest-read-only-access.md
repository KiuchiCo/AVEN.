# Section 1.42 · Guest read-only access

## Delivered

- Enforced Guest read-only access in the API, rather than relying on hidden browser controls.
- Guests can browse projects, tasks, documents, databases, calendar entries, Knowledge, search results, activity, and Intelligence briefings.
- Guest write attempts are rejected for project and task changes, task dependencies, document edits and comments, database records and views, calendar events, Knowledge items, and Intelligence project plans.
- Workspace rename remains owner-only. Invitation and member administration continues to follow the existing owner/administrator policies.
- Guests can still update their own activity read receipts and dismiss their own notifications because those actions affect only their personal Inbox state.
- The workspace shell hides the general Create menu for Guests and explains their access level.
- No database migration is required.

## Verification

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

Review by signing in with a Guest invitation. Browse each section, then attempt a write through its normal controls or API. The API should return `403 Forbidden`; non-Guest roles should retain their existing workflows.

## Suggested commit

```bash
git add README.md apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/databases.service.ts apps/api/src/productivity/knowledge.service.ts apps/api/src/productivity/intelligence.service.ts apps/web/app/workspace/workspace-shell.tsx apps/web/app/globals.css docs/sections/42-guest-read-only-access.md
git commit -m "feat: enforce guest read-only workspace access"
git push origin main
```
