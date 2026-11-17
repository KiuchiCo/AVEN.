# Section 1.34 · Workspace invitations and people

**Milestone:** Phase 2 · Team workspaces  
**Suggested commit:** `feat: add workspace invitations and people`

## Delivered

- Added a People page with current workspace members and pending invitations.
- Owners and administrators can invite a verified email as Administrator, Manager, Member, or Guest.
- Invitations produce a shareable link that expires after seven days. AVEN stores only the SHA-256 token hash and shows the raw token once.
- Invitation acceptance requires sign-in/account setup with the exact email address the invitation was sent to. The invite can be accepted only once; administrators can revoke pending invitations.
- Accepting an invite creates the workspace membership and activity record in one transaction. The newly joined workspace becomes the user's active workspace on the next workspace load.
- Fixed session bootstrap so repeat sign-ins preserve existing roles instead of changing a member back to Owner. It reports the active workspace and member count.
- Added migration `20261117001400_workspace_invitations`.
- No email delivery service is configured; copy the generated link and share it directly with the invitee.

## Setup and review

1. Apply the migration and regenerate Prisma:

   ```sh
   npm run db:migrate:dev
   npm run db:generate
   ```

2. Restart the API and web app, sign in as the workspace owner, and open **People**.
3. Invite an email and copy the one-time link. Confirm the invitation appears as pending.
4. Open the link while signed out, sign in or create an AVEN account with the invited email, and accept it.
5. Confirm the new member and assigned role appear in People, and the invitee's next workspace load opens the shared workspace.
6. Try a different email, a reused link, and a revoked link. Each should be rejected.
7. Confirm a regular Member cannot create or revoke invitations.

## Local checks

```sh
npm run db:validate
npm run typecheck
npm run build --workspace @aven/api
npm run build --workspace @aven/web -- --webpack
```

Stage and commit when ready:

```sh
git add README.md apps/api/prisma/schema.prisma apps/api/prisma/migrations/20261117001400_workspace_invitations/migration.sql apps/api/src/auth/auth.service.ts apps/api/src/productivity/members.controller.ts apps/api/src/productivity/invitations.controller.ts apps/api/src/productivity/workspace-invitations.service.ts apps/api/src/productivity/productivity.module.ts apps/web/app/globals.css apps/web/app/workspace/layout.tsx apps/web/app/workspace/workspace-shell.tsx apps/web/app/workspace/workspace-navigation.ts apps/web/app/workspace/members apps/web/app/invite docs/sections/34-workspace-invitations.md
git commit -m "feat: add workspace invitations and people"
git push origin main
```
