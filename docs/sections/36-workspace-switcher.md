# Section 1.36 · Multi-workspace switcher and settings

## Goal

Make personal and shared workspaces usable side by side. Members can switch among workspaces they belong to, create a shared workspace, and let its owner rename it. The selected workspace is persisted as a preference; the API always validates membership before serving workspace data.

## Delivered

- Added authenticated API endpoints to list a user's workspace memberships, create a shared workspace with the creator as owner, and rename a workspace as its owner.
- Logged workspace creation and rename events in the workspace activity feed.
- Added an HTTP-only active-workspace preference cookie. A stale or unauthorized workspace choice falls back to a workspace the user belongs to during session bootstrap.
- Replaced the static workspace label with an interactive workspace switcher and shared workspace creation form.
- Added workspace settings with owner-only rename controls and role/member/type details.
- No database migration is needed; existing workspace, membership, and activity tables cover this slice.

## Verification

From the repository root:

```bash
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
git diff --check
```

## Commit and push

```bash
git add apps/api/src/auth/auth.service.ts apps/api/src/auth/session.controller.ts apps/web/app/api/active-workspace/route.ts apps/web/app/globals.css apps/web/app/workspace/layout.tsx apps/web/app/workspace/workspace-shell.tsx apps/web/app/workspace/workspace-switcher.tsx apps/web/app/workspace/settings/page.tsx docs/sections/36-workspace-switcher.md README.md
git commit -m "feat: add multi-workspace switching and settings"
git push origin main
```
