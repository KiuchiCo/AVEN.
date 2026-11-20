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
| [1.23 · Workspace search](docs/sections/23-workspace-search.md) | Search saved workspace content across core modules | Complete |
| [1.24 · Task ownership and workload](docs/sections/24-task-ownership-workload.md) | Assign tasks to workspace members and view open workload | Complete |
| [1.25 · Unified calendar views](docs/sections/25-unified-calendar-views.md) | Browse scheduled events and task deadlines by month or agenda | Complete |
| [1.26 · Workspace activity feed](docs/sections/26-workspace-activity.md) | Record and browse changes across core workspace workflows | Complete |
| [1.27 · Inbox action center](docs/sections/27-inbox-action-center.md) | Triage overdue, upcoming, and high-priority tasks | Complete |
| [1.28 · Project workspace suite](docs/sections/28-project-workspace-suite.md) | Bring project delivery, timeline, linked records, activity, and manual budget into one workspace | Complete |
| [1.29 · Task dependencies](docs/sections/29-task-dependencies.md) | Sequence project tasks with safe prerequisite links and completion checks | Complete |
| [1.30 · Documents Studio](docs/sections/30-documents-studio.md) | Add structured block editing, autosave, outline, comments, history, and task creation | Complete |
| [1.36 · Multi-workspace switcher and settings](docs/sections/36-workspace-switcher.md) | Switch, create, and rename personal and shared workspaces | Complete |
| [1.37 · Calendar event management](docs/sections/37-calendar-event-management.md) | Edit and remove scheduled events and filter calendar items | Complete |
| [1.38 · Team updates in the Inbox](docs/sections/38-team-inbox-notifications.md) | Per-member notifications, read state, dismissal, and activity links | Complete |
| [1.39 · Workspace Knowledge Hub](docs/sections/39-workspace-knowledge-hub.md) | Shared reference library connected to search and AVEN Intelligence | Complete |
| [1.40 · Recurring calendar events](docs/sections/40-recurring-calendar-events.md) | Daily, weekly, and monthly series with timezone-aware occurrences | Complete |
| [1.41 · Calendar planning and workspace search](docs/sections/41-calendar-planning-search.md) | Day/week planning, categorized events, project links, iCalendar export, and broader search | Complete |
| [1.42 · Guest read-only access](docs/sections/42-guest-read-only-access.md) | Enforce read-only Guest permissions across workspace APIs | Complete |
| [1.43 · Task status automations](docs/sections/43-task-status-automations.md) | Run workspace rules on task status changes and review execution history | Complete |
| [1.44 · Knowledge connections and history](docs/sections/44-knowledge-connections-history.md) | Link references to workspace records and restore earlier versions | Complete |
| [1.45 · Knowledge search and filters](docs/sections/45-knowledge-search-filters.md) | Search and filter the Knowledge Hub with workspace-aware paging | Complete |
| [1.46 · Reusable project templates](docs/sections/46-reusable-project-templates.md) | Save existing project setups and launch new projects with starter tasks and milestones | Complete |
| [1.47 · Project template editing and usage](docs/sections/47-project-template-editing-usage.md) | Edit reusable checklists and see template usage counts and recency | Complete |
| [1.48 · Task batch actions and CSV](docs/sections/48-task-batch-csv.md) | Update task priorities and assignments in batches; import and export task CSV files | Complete |
| [1.49 · Task collaboration](docs/sections/49-task-collaboration.md) | Discuss tasks with comments and mentions, ordered checklists, and followers | Complete |
| [1.50 · Task notification targets](docs/sections/50-task-notification-targets.md) | Show collaboration notifications only to followers and mentioned members | Complete |
| [1.51 · Task follower updates](docs/sections/51-task-follower-updates.md) | Notify followers about task edits, prerequisite changes, and batch updates | Complete |
| [1.52 · Task comment lifecycle](docs/sections/52-task-comment-lifecycle.md) | Notify followers of edited/deleted comments and newly added mentions | Complete |
| [1.53 · Task assignment notifications](docs/sections/53-task-assignment-notifications.md) | Notify previous and new assignees about assignment changes | Complete |
| [1.54 · Task activity timeline](docs/sections/54-task-activity-timeline.md) | Show task edits, assignment changes, discussion, and checklist activity together | Complete |
| [1.55 · Checklist ordering and activity](docs/sections/55-checklist-order-and-activity.md) | Reorder checklist items and record rename, removal, and ordering changes | Complete |
| [1.56 · Task activity details](docs/sections/56-task-activity-details.md) | Identify checklist items and show comment previews in task activity | Complete |
| [1.57 · Task discussion search](docs/sections/57-task-discussion-search.md) | Search task comments and change their display order | Complete |
| [1.58 · Comment mention picker](docs/sections/58-comment-mention-picker.md) | Select comment mentions with accessible checkboxes and a clear limit | Complete |
| [1.59 · Inline comment editing](docs/sections/59-inline-comment-editing.md) | Edit comment text and mentions in place with validation | Complete |
| [1.60 · Comment permalinks](docs/sections/60-comment-permalinks.md) | Copy direct links to individual task comments | Complete |
| [1.61 · Task discussion filters](docs/sections/61-task-discussion-filters.md) | Filter comments by author and current-user mentions | Complete |
| [1.62 · Task activity filters](docs/sections/62-task-activity-filters.md) | Filter task updates, discussion, and checklist activity | Complete |
| [1.63 · Live task activity refresh](docs/sections/63-live-task-activity-refresh.md) | Refresh task activity after collaboration changes and tab return | Complete |
| [1.64 · Task duplication](docs/sections/64-task-duplication.md) | Duplicate tasks with their checklists and project context | Complete |
| [1.65 · Bulk task duplication](docs/sections/65-bulk-task-duplication.md) | Duplicate up to 100 selected tasks and their checklists atomically | Complete |
| [1.66 · Bulk task planning](docs/sections/66-bulk-task-planning.md) | Update selected task status, priority, assignee, and due date safely | Complete |
| [1.67 · Saved task views](docs/sections/67-saved-task-views.md) | Filter, search, sort, and save workspace task-board views in the browser | Complete |
| [1.68 · Bulk task labels](docs/sections/68-bulk-task-labels.md) | Add, remove, or replace labels across selected tasks without overwriting unrelated labels | Complete |
| [1.69 · Workspace label management](docs/sections/69-workspace-label-management.md) | Inspect label usage, rename or merge labels, and remove them workspace-wide | Complete |
| [1.70 · Shared task views](docs/sections/70-shared-task-views.md) | Share saved task filters across workspace members and devices | Complete |

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

As of Section 1.77, AVEN has a Next.js and NestJS application with Clerk sign-in, personal and shared workspace membership, expiring one-time invitation links bound to the invited verified email, and workspace member/invitation management. Workspace owners can change teammate roles or remove members; membership changes are recorded in workspace activity. Projects and tasks are workspace-scoped. Task boards support shared workspace views with text search, status, priority, assignee, label, and due-date filters, plus title, priority, and due-date sorting. Task views can be applied, cleared, and deleted. Task details support member comments with search, author and mention filters, sorting, inline editing, and direct comment links; checkbox-based teammate mentions capped at 20 recipients; ordered checklists with move controls; a filterable task activity timeline that refreshes after collaboration changes and when returning to the tab; single and bulk task duplication with copied ordered checklists and project context; bulk status, priority, assignee, due-date, and label planning with dependency checks, automations, and follower notifications; workspace labels can be reviewed by usage, renamed, merged, or removed across tasks with follower notifications; task followers; and recipient-scoped Inbox notifications for discussion and task changes. Checklist additions, renames, completions, removals, and reorderings appear in task activity with item names; comment activity includes short previews. Activity strings are normalized and capped to the database column size. Comment authors can edit their text and mentions or remove their comments; followers are notified of comment changes, and newly added mentions are notified when a comment is edited. Previous and new task assignees receive assignment notifications, including for batch reassignment. The Documents Studio supports structured blocks, autosave, outlines, comments, manual version history and task creation from to-do blocks. Databases include Table, List, Board, Gallery, Calendar, Timeline, and Chart layouts, custom typed properties, relations, validated read-only formulas, a visual relation map, saved views, filtering, sorting, and CSV import/export. Task CSV exports include stable task, project, and assignee IDs; imports can either create copies or safely update matching tasks and create new rows. AVEN Intelligence provides a workspace-scoped weekly briefing with factual task and project deadline signals, priority focus, calendar context, and a retrieval assistant that searches saved workspace information. The assistant is backed by a real model through the Anthropic API when `ANTHROPIC_API_KEY` is set (see below); the briefing and outline tools stay rules-based, and without a key the assistant says it is off rather than pretending. The Intelligence workspace can also turn a reviewed outline into a project with tasks and milestones, saved atomically and logged to workspace activity. Projects and tasks support editable lifecycle, due dates, priority controls, priority filtering, and overdue cues; projects also show task completion progress, dated milestones, a dedicated project workspace with delivery overview, task and milestone timeline, linked documents, related activity, and manual budgets in AUD, plus same-project task prerequisites that can be managed from project and task detail pages, filtered and surfaced on the task board, prevent dependency cycles, and block premature task completion. Project workspaces also surface a dependency-aware ready queue with actionable start controls and blocked-task explanations. Project templates preserve and recreate their task prerequisite graphs, with validation against invalid indexes, self-links, and cycles. Task and milestone dates in templates are reusable day offsets recalculated for each new project. Workspace search covers project and task names/descriptions, document titles/content, database names, and recent database records. Tasks can be assigned to workspace members, with an open workload summary by assignee. The calendar combines scheduled events and open task deadlines in day, week, month, and agenda views; events support recurrence, category, all-day status, notes, locations, project links, and iCalendar export. A workspace activity feed records and filters project, task, milestone, document, and calendar changes. The Inbox triages overdue, near-term, and high-priority tasks alongside targeted teammate updates. This is still an early Phase 2 product: character-level co-editing, mobile/desktop apps and offline sync remain future work. The original design preview is preserved in the web app's `public` folder. See the [foundation plan](docs/architecture/00-foundation-plan.md) for the phased checklist.

## Platform capabilities

Everything below is real, tested code. Features that need an outside service say plainly when that service is not configured.

- **Files** — uploads with quotas, folders, attachments on tasks and documents, local-disk storage or S3-compatible object storage (`STORAGE_DRIVER=s3`) behind a swappable `StorageDriver`; Word, PowerPoint and Excel files can be read into Knowledge.
- **AVEN Intelligence** — a model-backed assistant (Anthropic) that searches the workspace with tools, cites what it used, and proposes changes that only happen after a person confirms; built-in and custom agents; monthly AI credits; optional web search (Brave Search API, `WEB_SEARCH_API_KEY`).
- **Workflows** — triggers, conditions, branches, delays, notifications, webhooks (SSRF-safe) and AI steps, with retries and a run history.
- **Email** — invitation emails and batched notification summaries through Resend.
- **Plans and billing** — Free, Plus, Pro, Business (per seat) and Enterprise, enforced on the server; Stripe checkout, customer portal and webhooks; usage and limits in Settings. Downgrading never deletes content.
- **Messaging** — channels and direct messages with live updates, unread counts, @mentions that notify through the Inbox, and files shared from the workspace.
- **Live documents** — people with a document open see each other, saves appear live, and simultaneous edits to different blocks are merged (block-level, not character-level co-editing).
- **Sharing and sync** — read-only document links with expiry and revocation; Google Calendar and Outlook sync with encrypted tokens.
- **Analytics, audit log and permissions** — task trends and workload (Pro and above); an exportable audit log and role-based permissions for projects, automations and share links (Business and above).
- **Notifications** — Inbox, batched email, and browser push notifications (VAPID keys, `npm run vapid:generate --workspace @aven/api`).
- **Favourites** — pin projects, documents, databases and whiteboards to the sidebar.
- **Whiteboards** — an infinite canvas with notes, shapes, text, arrows and a pen, autosaved with conflict protection.
- **Timeline** — task start dates and a Gantt-style project chart.
- **Appearance and language** — an editorial light theme by default, optional dark, and menus, Home, Settings, Tasks, Inbox, Activity, Task Labels, Analytics, Whiteboards, Search, Documents, People, Files, Calendar, Messages, Knowledge and automation rules in English, Spanish, French or German (other screens are English for now).
- **Inbox** — updates about the same item are grouped.
- **Operations** — security headers, liveness and readiness checks, graceful shutdown, a backup script, and a [deployment guide](docs/DEPLOYMENT.md).
- **Tests** — unit tests, a committed integration suite (`npm run test:integration`) and a route-by-route access audit that checks anonymous, outsider and guest access on every endpoint.

Verified only against local stand-ins, because they need your credentials: Stripe, Anthropic, Resend, Google and Microsoft calendars, S3, Brave Search and push services. Each one reports clearly when it is not configured.

Not built yet: character-level co-editing, PDF and legacy .doc/.xls reading, semantic search, translating every screen, shared organisation-level administration, mobile and desktop apps, offline use.

## Local development

Requires Node.js 24.15.0 or newer, npm and Docker Desktop.

**First time only** (from the repository root):

```bash
npm install
cp .env.example .env     # only once: running it again replaces your .env, including your keys
# edit .env: add your Clerk keys and CLERK_ISSUER (see docs/DEPLOYMENT.md)
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

**Every day:**

```bash
npm run db:up        # starts PostgreSQL if it is not running
npm run dev:all      # starts the web app (port 3000) and the API (port 4000) together
```

Run `npm run db:migrate:deploy` and `npm run db:generate` again after pulling changes that add migrations. `npm run dev` starts only the web app and `npm run dev:api` only the API, if you want them in separate terminals.

The local database commands require Docker Desktop. See [Section 1.3 · PostgreSQL and Prisma](docs/sections/03-postgres-prisma.md) for migration details.

### Section notes

Sections 1.36–1.69 cover workspace switching, calendar management, shared Knowledge, recurring events, workspace search, project templates, task collaboration, discussion and activity filters, task duplication and planning, task views, and label management. Section 1.70 moves saved task views into shared workspace storage with authenticated create, update, and delete actions. Section 1.71 adds round-trip task CSV export and import with create or ID-matched update behavior. Section 1.72 surfaces prerequisite and blocking-task relationships on task detail pages with a searchable dependency editor. Section 1.73 adds dependency-state filtering to the task board and saves it in shared task views. Section 1.74 adds a project ready queue, blocked-task explanations, and start actions. Section 1.75 carries task dependency graphs through project template creation, editing, and application. Section 1.76 preserves milestone timing as day offsets. Section 1.77 also preserves task due-date offsets, so template applications recreate the full relative schedule. See the [Section 1.70 notes](docs/sections/70-shared-task-views.md) for migration instructions and the [Section 1.71 notes](docs/sections/71-task-csv-sync.md) for CSV sync instructions and the [Section 1.72 notes](docs/sections/72-task-dependencies-detail.md) for task dependency details and the [Section 1.73 notes](docs/sections/73-task-dependency-filters.md) for filtering and commit instructions and the [Section 1.74 notes](docs/sections/74-project-ready-queue.md) for project readiness details and the [Section 1.75 notes](docs/sections/75-template-dependencies.md) for reusable project sequencing and the [Section 1.76 notes](docs/sections/76-template-milestone-timing.md) for milestone timing details and the [Section 1.77 notes](docs/sections/77-template-task-dates.md) for task due-date offsets.

## Verification and migration checks

Run the repository checks from the root before committing:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run db:validate
```

`npm test` builds the API before running its tests. `npm run test:integration` additionally boots the real API against a migrated PostgreSQL database named by `INTEGRATION_DATABASE_URL` (use a throwaway database, for example `createdb aven_integration` then `DATABASE_URL=… npm run db:migrate:deploy`); it covers workspace isolation, guest access, concurrent edits, files, workflows, the AI assistant and email, and CI runs it on every push. Without that variable the integration tests are skipped. The API tests cover Clerk token verification and workspace access rules; the web tests cover task CSV import and export. `npm run db:validate` checks the Prisma schema without connecting to PostgreSQL.

To inspect which migrations a local database has applied, start Docker Desktop and PostgreSQL, then run `npx prisma migrate status` from `apps/api`. This reports migration state without applying migrations. `npm run db:migrate:deploy` applies pending migrations; keep it as an explicit database-change step after reviewing the migration SQL and confirming the local database is available.

Open `http://localhost:3000`. The root route currently redirects to the preserved dashboard preview. In a second terminal, start the API with `npm run dev:api`; its scaffold health route is `http://localhost:4000/api/v1/health`.
