# AVEN.

**Your entire world, organised.**

AVEN is a productivity workspace that brings projects, documents, databases, calendar, and AI assistance into one connected application. This repository is being built in small, reviewable sections so each milestone can be committed and pushed independently.

## Project sections

| Section | Focus | Status |
| --- | --- | --- |
| [00 · Product foundation](docs/sections/00-product-foundation.md) | Product principles and first-release scope | Complete |
| [1.1 · Application shell](docs/sections/01-application-shell.md) | Responsive navigation and dashboard starting point | Complete |
| [1.2 · Monorepo tooling](docs/sections/02-monorepo-tooling.md) | Web/API workspace and development tooling | Complete |
| [1.3 · PostgreSQL and Prisma](docs/sections/03-postgres-prisma.md) | Local database and migrations | Complete |
| [1.4 · Identity decision](docs/sections/04-identity-decision.md) | Clerk identity-provider decision | Complete |
| [1.5 · Sign-in and personal workspace](docs/sections/05-auth-workspace.md) | Authentication and personal workspace bootstrap | Complete |
| [1.6 · Product shell](docs/sections/06-product-shell.md) | Authenticated AVEN navigation and pages | Complete |
| [1.7 · Projects and tasks](docs/sections/07-projects-and-tasks.md) | Persistent project and task workflows | Complete |
| [1.8 · Connected records](docs/sections/08-connected-records.md) | Project documents and task-linked calendar | Complete |
| [1.9 · Live Home and My Tasks](docs/sections/09-live-home-and-my-tasks.md) | Workspace metrics and task list | Complete |
| [1.10 · Document editing](docs/sections/10-document-editing.md) | Persistent document editing | Complete |
| [1.11 · Basic databases](docs/sections/11-basic-databases.md) | Workspace tables and structured records | Complete |
| [1.12 · Custom database properties](docs/sections/12-custom-database-properties.md) | Add typed columns to workspace databases | Complete |
| [1.13 · Database filtering and sorting](docs/sections/13-database-filter-sort.md) | Search and order database rows | Complete |
| [1.14 · Saved database views](docs/sections/14-saved-database-views.md) | Save, restore, and remove a database filter and sort configuration | Complete |
| [1.15 · Database board views](docs/sections/15-database-board-views.md) | Group records into status columns and save the layout | Complete |
| [1.16 · Database gallery views](docs/sections/16-database-gallery-views.md) | Browse structured records as saved, scannable cards | Complete |
| [1.17 · Relational database fields](docs/sections/17-database-relations.md) | Link records across databases with workspace-scoped references | Complete |
| [1.18 · Database CSV import and export](docs/sections/18-database-csv.md) | Move scalar database records in and out as CSV | Complete |
| [1.19 · Database calendar views](docs/sections/19-database-calendar.md) | Place dated records on a browsable month grid | Complete |
| [1.20 · Advanced database views](docs/sections/20-advanced-database-views.md) | Add compact List, dated Timeline, and grouped Chart layouts | Complete |
| [1.21 · Project schedules and task controls](docs/sections/21-project-schedules-task-controls.md) | Manage project lifecycle, due dates, task priorities, and overdue work | Complete |
| [1.22 · Project milestones and progress](docs/sections/22-project-milestones-progress.md) | Track dated project checkpoints and completion progress | Complete |

The fuller product direction and implementation principles are in [the product foundation](docs/sections/00-product-foundation.md).
The shared visual language is documented in the [AVEN design system](docs/AVEN-DESIGN-SYSTEM.md).
The staged technical architecture is in the [foundation plan](docs/architecture/00-foundation-plan.md).

## Working on a section

Sections are designed to be small enough to review before you publish them. For each one:

1. Review the section brief and the changes in the working tree.
2. Run the section's verification steps.
3. Commit with the suggested message in that brief, then push your branch.

Suggested first commit: `docs: define AVEN product foundation`

Suggested shell commit: `feat: add responsive AVEN application shell`

The current tooling milestone is documented in [Section 1.2 · Monorepo tooling](docs/sections/02-monorepo-tooling.md).
The local PostgreSQL and Prisma setup is documented in [Section 1.3 · Persistence](docs/sections/03-postgres-prisma.md).
The identity provider recommendation is documented in [Section 1.4 · Identity decision](docs/sections/04-identity-decision.md).
The first Clerk sign-in and personal workspace slice is in [Section 1.5 · Sign-in and personal workspace](docs/sections/05-auth-workspace.md).
The authenticated product shell is documented in [Section 1.6 · Product shell](docs/sections/06-product-shell.md).

The first persistent productivity slice is documented in [Section 1.7 · Projects and tasks](docs/sections/07-projects-and-tasks.md).

Documents and task-linked calendar events are documented in [Section 1.8 · Connected records](docs/sections/08-connected-records.md).

The live workspace dashboard and My Tasks flow are documented in [Section 1.9 · Live Home and My Tasks](docs/sections/09-live-home-and-my-tasks.md).

Persistent document editing is documented in [Section 1.10 · Document editing](docs/sections/10-document-editing.md).

## Current state

As of Section 1.22, AVEN has a Next.js and NestJS application with Clerk sign-in, personal workspaces, workspace-scoped projects and tasks, editable documents, calendar events, and databases with Table, List, Board, Gallery, Calendar, Timeline, and Chart layouts. Database records support custom typed properties, relation fields, saved views, filtering, sorting, and CSV import/export. Projects and tasks support editable lifecycle, due dates, priority controls, priority filtering, and overdue cues; projects also show task completion progress and support dated milestones. This is still an early Phase 2 product: the broader brief's real-time collaboration, full document editor, integrations, AI system, mobile/desktop apps, offline sync, and several advanced workflows remain future work. The original design preview is preserved in the web app's `public` folder. See the [foundation plan](docs/architecture/00-foundation-plan.md) for the phased checklist.

## Local development

Requires Node.js 24.15.0 or newer and npm. From the repository root:

```bash
npm install
cp .env.example .env
npm run db:up
npm run db:migrate:deploy
npm run db:generate
npm run dev
```

The local database commands require Docker Desktop. See [Section 1.3 · PostgreSQL and Prisma](docs/sections/03-postgres-prisma.md) for migration details and API startup instructions.

Open `http://localhost:3000`. The root route currently redirects to the preserved dashboard preview. In a second terminal, start the API with `npm run dev:api`; its scaffold health route is `http://localhost:4000/api/v1/health`.
