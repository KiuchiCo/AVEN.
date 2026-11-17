# Section 1.39 · Workspace Knowledge Hub

## Goal

Create a shared, searchable library for team references, research notes, and decisions, and make that information available through AVEN's workspace search and retrieval assistant.

## Delivered

- Added workspace-scoped Knowledge items with title, notes, optional source URL, normalized tags, pinning, archive/restore, creator, and timestamps.
- Added authenticated CRUD-style API operations with workspace membership checks and input validation.
- Added the Knowledge navigation page with search, tags, active/archive views, pinning, editing, and reversible archiving.
- Included active Knowledge references in workspace-wide search and AVEN Intelligence's search-backed answers.
- Added Knowledge item counts to the Intelligence context panel and Knowledge changes to the activity feed and team Inbox links.
- Added the `knowledge_items` table with workspace and creator foreign keys and indexes.

## Database migration

Migration is named `20261118170000_workspace_knowledge_hub`. From the repository root:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

The SQL migration is included, so `migrate:deploy` applies it without prompting for a name.

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

## Commit and push

```bash
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118170000_workspace_knowledge_hub/migration.sql apps/api/src/productivity/knowledge.controller.ts apps/api/src/productivity/knowledge.service.ts apps/api/src/productivity/productivity.module.ts apps/api/src/productivity/productivity.service.ts apps/api/src/productivity/intelligence.service.ts apps/web/app/globals.css apps/web/app/workspace/knowledge apps/web/app/workspace/workspace-navigation.ts apps/web/app/workspace/workspace-shell.tsx apps/web/app/workspace/workspace-productivity.tsx apps/web/app/workspace/activity/page.tsx apps/web/app/workspace/intelligence/intelligence-workspace.tsx docs/sections/39-workspace-knowledge-hub.md
git commit -m "feat: add workspace Knowledge hub"
git push origin main
```
