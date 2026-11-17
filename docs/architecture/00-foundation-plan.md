# AVEN · Foundation architecture and delivery plan

**Milestone:** Phase 1.0 · Architecture and task plan  
**Suggested commit:** `docs: define AVEN foundation architecture`  
**Status:** Ready for review

This plan translates the AVEN master product brief into a staged implementation for the repository as it exists today. It keeps the long-term product direction visible while making the first delivery small enough to review, commit, and push on its own.

## Repository inspection

The repository currently contains a static HTML/CSS/JavaScript dashboard concept and product/design notes. It has no package manager, application framework, backend, database, migrations, or automated checks configured. The dashboard is useful as a visual reference, but it is not persistent application functionality.

## Proposed architecture

Start with a TypeScript monorepo and a modular monolith. Keep the web client and API as separate applications in one repository, with shared packages only where both sides need the same code.

| Area | Initial choice | Reason |
| --- | --- | --- |
| Web | Next.js App Router, React, TypeScript, Tailwind CSS | Matches the brief and supports a responsive product UI with server and client components. |
| API | NestJS, TypeScript | Provides clear modules and dependency boundaries while keeping the first backend a single deployable service. |
| Primary data | PostgreSQL | Relational integrity and transactions suit workspace, project, task, document, and calendar relationships. |
| ORM and migrations | Prisma | A typed schema and migration workflow give the first domain model a consistent source of truth. Use explicit SQL migrations when PostgreSQL features or access policies need them. |
| Authentication | Clerk recommended in [Section 1.4](../sections/04-identity-decision.md), pending review before implementation | The provider handles identity credentials and sessions; AVEN's API and PostgreSQL remain authoritative for workspace membership and permissions. Do not store credentials or add auth dependencies before the recommendation is reviewed. |
| Background jobs, cache, search, files, real-time | Defer until a vertical slice needs each capability | Avoid adding Redis, a queue, object storage, or collaboration infrastructure before there is a real workflow to support. |

The first deployment can run the web app, API, and PostgreSQL together as a modular product. Keep module boundaries in code; do not split them into microservices without measured scaling or team requirements.

## Initial repository shape

```text
apps/
  web/                 Next.js application
  api/                 NestJS API and domain modules
packages/
  design-system/       Shared tokens and reusable UI primitives
  shared-types/        Stable types shared across app boundaries
  shared-utils/        Small environment-neutral helpers
infrastructure/
  database/            Local PostgreSQL and operational configuration
documentation/
  architecture/        Decisions, diagrams, and technical plans
  api/                 API contracts and conventions
  database/            Entity model and migration notes
  product/             Product requirements and delivery milestones
  design-system/       Visual rules and component guidance
```

Keep framework-specific code inside `apps/web` and `apps/api`. Promote code to `packages/` only when it has a real shared use; avoid duplicating database models as hand-maintained API types.

## First data model

The initial vertical slice needs these domain records:

| Entity | Purpose | Key relationships |
| --- | --- | --- |
| User | Authenticated identity and profile | Has memberships and created records |
| Workspace | Personal or organisation boundary | Has members, projects, and documents |
| WorkspaceMember | User's role in one workspace | Joins User and Workspace; unique per pair |
| Project | Shared project container | Belongs to a Workspace; has tasks and documents |
| Task | Work item with status, priority, and dates | Belongs to a Workspace; optionally belongs to Project |
| Document | Editable content linked to workspace work | Belongs to a Workspace; optionally links to Project |
| CalendarEvent | Scheduled item | Belongs to a Workspace; can reference a Task |

Use UUID identifiers, explicit foreign keys, workspace ownership on tenant data, and created/updated timestamps. Add database constraints and indexes for the access patterns when the schema is implemented. Keep specialised data in its domain table; do not put every record into an unstructured generic object table. Shared object identity and relationships can be introduced as a typed layer over domain records when the first cross-module workflows require it.

Initial workspace roles are Owner, Administrator, Manager, Member, and Guest. Membership and workspace isolation must be enforced in the API for every read and write. Database-level policies can be added if the selected deployment model supports them; they do not replace server-side authorization.

## Initial API contracts

Use versioned JSON endpoints under `/api/v1`. The API owns validation, authorization, and business rules; the web client never connects directly to PostgreSQL.

```text
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:workspaceId
GET    /api/v1/workspaces/:workspaceId/projects
POST   /api/v1/workspaces/:workspaceId/projects
GET    /api/v1/workspaces/:workspaceId/projects/:projectId/tasks
POST   /api/v1/workspaces/:workspaceId/projects/:projectId/tasks
PATCH  /api/v1/workspaces/:workspaceId/tasks/:taskId
GET    /api/v1/workspaces/:workspaceId/documents
POST   /api/v1/workspaces/:workspaceId/documents
```

Every endpoint must validate workspace membership and the requested resource's workspace before returning or changing data. Define shared response/error shapes, pagination, and request validation before expanding the endpoint set. Authentication routes depend on the separate auth decision.

## Phased milestones

Each row is an independent review and Git milestone. Keep each working tree focused so it can be committed and pushed before starting the next row.

| Milestone | Scope | Commit-sized result |
| --- | --- | --- |
| 1.0 · Architecture | This plan, entity outline, API outline, risks, and checklist | Product/engineering decision record |
| 1.1 · Design foundation | Align shared tokens and shell with the master ivory, charcoal, bronze, Playfair Display, and Inter identity | Shared visual rules and first shell polish |
| 1.2 · Monorepo tooling | Workspace package manager, strict TypeScript, lint/format configuration, app folders, and local setup docs | Empty but runnable web/API skeleton |
| 1.3 · Persistence | PostgreSQL local configuration, Prisma schema, initial migration, and seed-free startup | Versioned database foundation |
| 1.4 · Identity decision | Compare managed identity with NestJS-owned sessions against MFA, verification, invitations, security, and cost requirements | Auth ADR before credential flows |
| 1.5 · Workspace vertical slice | Registration/login integration, personal workspace creation, member roles, and isolation | User can enter their own workspace |
| 1.6 · Product shell | Move the current visual prototype into accessible, reusable Next.js components and functional navigation | Real app shell with no fake data presented as live |
| 1.7 · First productivity slice | Projects and tasks persisted through the API with an initial board | Create, update, and view project work after refresh |
| 1.8 · Connected records | Project-linked documents and tasks scheduled as calendar events | First cross-module information flow |

## Technical risks and dependencies

- **Identity and session security:** provider choice affects API token verification, cookies, MFA, recovery, and invitations. Decide before implementing sign-in.
- **Tenant isolation:** every domain query needs workspace scoping and authorization tests. Treat an unscoped query as a security defect.
- **Universal object model:** an overly generic schema can obscure domain constraints; start with relational domain tables and introduce shared object metadata deliberately.
- **Monorepo tooling:** Next.js, NestJS, Prisma, and shared packages need compatible TypeScript and build configuration. Pin resolved dependencies in the lockfile.
- **Local services:** PostgreSQL needs a predictable local setup and a documented migration workflow before persistent features begin.
- **Design continuity:** the current prototype uses sage accents and DM Sans/Manrope. The master brief specifies bronze accents and Playfair Display/Inter. Reconcile these in milestone 1.1 before porting the interface.
- **Scope:** real-time editing, offline sync, Redis, search services, mobile/desktop apps, AI actions, and automations are later phases. Keep their seams in mind without building infrastructure ahead of a working vertical slice.

## Task checklist

- [x] Inspect the existing repository and identify its current technology.
- [x] Record the proposed web, API, data, and monorepo architecture.
- [x] Identify the initial entities and workspace boundary.
- [x] Define the first API surface and authorization rule.
- [x] Break Phase 1 into reviewable milestones.
- [x] Record major technical risks and dependencies.
- [ ] Reconcile the shared visual tokens with the master brand brief.
- [x] Create the monorepo scaffold and development tooling.
- [x] Configure local PostgreSQL and schema migrations.
- [x] Record the recommended authentication provider and security boundaries before login implementation.
- [ ] Build and verify the first persistent workspace/project/task workflow.

## Review notes

This architecture milestone records the proposed stack and delivery shape. The application scaffold, prototype placement, and persistence setup are tracked as separate implementation milestones so each can be reviewed and committed independently.
