# Section 1.44 · Knowledge connections and history

Knowledge references can now link to one project, document, and task in the same workspace. The Knowledge Hub editor provides optional selectors for each record, and reference cards show links to the selected records.

Edits to a reference's title, notes, source URL, tags, or linked records save a snapshot of the previous version. The History panel lists snapshots with their author and date. Restoring an earlier version first saves the current state, then restores the selected snapshot, so the action is reversible. Pin and archive changes do not create content snapshots.

The API checks that every linked record belongs to the selected workspace. Guests may view linked records and history, but workspace write permissions still apply to edits and restores.

## Migration and local setup

Apply the additive migration and regenerate Prisma Client from the repository root:

```bash
npm run db:migrate:deploy
npm run db:generate
```

Restart the API and web development servers after generation.

## Verification

```bash
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

In the Knowledge Hub, create a reference and attach a project, document, and/or task. Edit its title or notes, open **History**, and restore the earlier version. The linked records should be workspace-local and the restored content should be visible after the list reloads.

## Commit and push

```bash
git add README.md docs/sections/44-knowledge-connections-history.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261118203000_knowledge_connections_history apps/api/src/productivity/knowledge.service.ts apps/api/src/productivity/knowledge.controller.ts apps/web/app/workspace/knowledge/knowledge-hub.tsx apps/web/app/globals.css
git commit -m "feat: connect knowledge to workspace records"
git push origin main
```
