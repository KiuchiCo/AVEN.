# Section 1.35 · Workspace member management

**Milestone:** Phase 2 · Team roles and membership  
**Suggested commit:** `feat: manage workspace member roles`

## Delivered

- Workspace owners can change a teammate's role to Administrator, Manager, Member, or Guest from the People page.
- Workspace owners can remove a teammate from their workspace. Any tasks assigned to the removed user become unassigned through the existing database relationship.
- Members and administrators cannot change roles or remove people. The workspace owner cannot change their own role, remove themself, or be removed.
- Role changes and removals are written to the workspace activity feed in the same transaction as the membership update.
- No database migration is required.

## Review

1. Sign in as the workspace owner and open **People**.
2. Change a non-owner's role and save; confirm the new role persists after refreshing and the activity entry appears.
3. Sign in as an Administrator and confirm role-management controls are unavailable.
4. Remove a non-owner member and confirm they are removed from People; any assigned tasks become unassigned.
5. Confirm the owner row has no role-change or remove control.

## Local checks

```sh
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Stage and commit when ready:

```sh
git add README.md apps/api/src/productivity/members.controller.ts apps/api/src/productivity/workspace-invitations.service.ts apps/web/app/workspace/members/workspace-members.tsx apps/web/app/globals.css docs/sections/35-workspace-member-management.md
git commit -m "feat: manage workspace member roles"
git push origin main
```
