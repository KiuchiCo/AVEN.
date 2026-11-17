# Section 1.2 · Monorepo tooling

**Status:** Ready for review  
**Suggested commit:** `feat: scaffold AVEN web and API workspaces`

## Goal

Establish the initial TypeScript monorepo without adding database, authentication, or product-domain behavior. Keep the previously designed dashboard available while the UI is migrated into reusable React components in a later milestone.

## Included

- npm workspaces at the repository root.
- Next.js App Router web app with TypeScript, Tailwind CSS v4, and AVEN design tokens.
- NestJS 12 API app with a versioned health route.
- Strict TypeScript configuration for both apps.
- Node/npm version, ignored build artifacts, and example local environment values.
- Static dashboard preview served from the web app at `/prototype.html`; `/` redirects there for now.

## Deferred

PostgreSQL, Prisma, authentication, workspace data, a shared component library, and production deployment remain separate milestones. The API health endpoint confirms only that the scaffold responds; it does not indicate that product data is connected.

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Start the API in another terminal with `npm run dev:api`, then open `http://localhost:4000/api/v1/health`.

## Review checklist

- `npm run build` completes for both workspaces.
- `npm run typecheck` completes for both workspaces.
- `npm run lint` completes for the web workspace.
- The root web route redirects to the existing dashboard preview at `/prototype.html`.
- The API health route returned `status: "ok"` (`HTTP 200`).
- No credentials or local environment files are committed.

All checks above passed on 17 November 2026. `npm audit` reported no known vulnerabilities.
