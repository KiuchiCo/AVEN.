# Section 1.32 · Workspace Intelligence

**Milestone:** Phase 2 · Workspace context and guidance  
**Suggested commit:** `feat: add workspace intelligence briefing`

## Delivered

- Added an authenticated `GET /api/v1/workspaces/:workspaceId/intelligence/briefing` endpoint, scoped to current workspace membership.
- Added a live briefing with counts for open and overdue tasks, deadlines in the next 7 days, active projects, calendar events, documents, and databases.
- Added factual signals for overdue work, upcoming deadlines, and projects on hold, plus a prioritised focus list and the coming week's events.
- Replaced the empty Intelligence route with a responsive AVEN Intelligence workspace.
- Added an “Ask AVEN” panel that answers common deadline and schedule questions from the briefing and searches other queries across existing workspace search.
- Linked results and suggestions back to the relevant task, project, calendar, document, or database areas.
- No schema migration or external model configuration is required. This first version is rules-based; it does not send workspace data to an AI provider.

## Review

1. Sign in and open **Intelligence** from the workspace navigation.
2. Confirm the counts reflect the workspace's tasks and projects, and that overdue or upcoming deadline signals match their saved dates.
3. Ask “What needs my attention?” and “What is happening this week?”; check that results link to the matching tasks and calendar items.
4. Ask about a project or document name; confirm the results match workspace search.
5. Sign in as a member of another workspace and confirm its briefing is separate.
6. Test at desktop and mobile widths.

## Local checks

```sh
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Stage and commit when ready:

```sh
git add README.md apps/api/src/productivity/intelligence.controller.ts apps/api/src/productivity/intelligence.service.ts apps/api/src/productivity/productivity.module.ts apps/web/app/workspace/intelligence apps/web/app/workspace/page.tsx 'apps/web/app/workspace/[section]/page.tsx' apps/web/app/globals.css docs/sections/32-workspace-intelligence.md
git commit -m "feat: add workspace intelligence briefing"
git push origin main
```
