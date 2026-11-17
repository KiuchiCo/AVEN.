# Section 1.11 · Basic workspace databases

**Milestone:** Phase 2 · First structured database records  
**Suggested commit:** `feat: add basic workspace databases`  
**Status:** Complete; local migration applied and record persistence verified.

## What this section adds

- Workspace-scoped database tables with a starter Name and Status property set.
- JSONB-backed records for evolving structured values.
- Authenticated endpoints to list and create databases, add records, and edit records.
- A responsive Databases page with table selection, record creation, and inline editing.
- Membership checks and workspace-scoped updates for every database request.

## API

```text
GET   /api/v1/workspaces/:workspaceId/databases
POST  /api/v1/workspaces/:workspaceId/databases
POST  /api/v1/workspaces/:workspaceId/databases/:databaseId/records
PATCH /api/v1/workspaces/:workspaceId/databases/:databaseId/records/:recordId
```

Records support text, number, boolean, date, and status values. The first version ships with Name and Status properties.

## Apply and review

After pulling this section, run from the repository root:

```bash
npm run db:migrate:deploy
npm run db:generate
```

Then refresh `/workspace/databases` while signed in. Create a table, add a record, edit it, and refresh to confirm it persists.

- [x] Create a database from the Databases page.
- [x] Add a record and confirm it remains after refreshing.

For local Clerk token verification, the API accepts either `CLERK_JWT_KEY` (networkless verification) or `CLERK_SECRET_KEY` (verification through Clerk's Backend API). Keep the secret key only in the server environment.

## Scope boundary

This section does not add filters, sorting, saved views, relations, CSV workflows, or record detail pages. Those can build on the workspace-scoped data model in follow-up sections.
