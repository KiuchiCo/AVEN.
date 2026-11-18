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

As of Section 1.65, AVEN has a Next.js and NestJS application with Clerk sign-in, personal and shared workspace membership, expiring one-time invitation links bound to the invited verified email, and workspace member/invitation management. Workspace owners can change teammate roles or remove members; membership changes are recorded in workspace activity. Projects and tasks are workspace-scoped. Task details support member comments with search, author and mention filters, sorting, inline editing, and direct comment links; checkbox-based teammate mentions capped at 20 recipients; ordered checklists with move controls; a filterable task activity timeline that refreshes after collaboration changes and when returning to the tab; single and bulk task duplication with copied ordered checklists and project context; task followers; and recipient-scoped Inbox notifications for discussion and task changes. Checklist additions, renames, completions, removals, and reorderings appear in task activity with item names; comment activity includes short previews. Activity strings are normalized and capped to the database column size. Comment authors can edit their text and mentions or remove their comments; followers are notified of comment changes, and newly added mentions are notified when a comment is edited. Previous and new task assignees receive assignment notifications, including for batch reassignment. The Documents Studio supports structured blocks, autosave, outlines, comments, manual version history and task creation from to-do blocks. Databases include Table, List, Board, Gallery, Calendar, Timeline, and Chart layouts, custom typed properties, relations, validated read-only formulas, a visual relation map, saved views, filtering, sorting, and CSV import/export. AVEN Intelligence provides a workspace-scoped weekly briefing with factual task and project deadline signals, priority focus, calendar context, and a retrieval assistant that searches saved workspace information. Its current responses are rules-based and do not send workspace data to an outside AI provider. The Intelligence workspace can also turn a reviewed outline into a project with tasks and milestones, saved atomically and logged to workspace activity. Projects and tasks support editable lifecycle, due dates, priority controls, priority filtering, and overdue cues; projects also show task completion progress, dated milestones, a dedicated project workspace with delivery overview, task and milestone timeline, linked documents, related activity, and manual budgets in AUD, plus same-project task prerequisites that prevent dependency cycles and block premature task completion. Workspace search covers project and task names/descriptions, document titles/content, database names, and recent database records. Tasks can be assigned to workspace members, with an open workload summary by assignee. The calendar combines scheduled events and open task deadlines in day, week, month, and agenda views; events support recurrence, category, all-day status, notes, locations, project links, and iCalendar export. A workspace activity feed records and filters project, task, milestone, document, and calendar changes. The Inbox triages overdue, near-term, and high-priority tasks alongside targeted teammate updates. This is still an early Phase 2 product: broader real-time editing, integrations, model-backed AI actions, mobile/desktop apps, offline sync, and several advanced workflows remain future work. The original design preview is preserved in the web app's `public` folder. See the [foundation plan](docs/architecture/00-foundation-plan.md) for the phased checklist.

## Local development

Sections 1.36–1.39 add workspace switching, calendar event management, per-member team notifications, and a shared Knowledge Hub. Section 1.40 adds timezone-aware recurring calendar events. Section 1.41 adds a day timeline, week view, categorized and all-day events, project-linked scheduling, iCalendar export, and Knowledge/event search filters. Section 1.42 makes Guest access read-only at the API and in the workspace shell. Section 1.43 adds immediate task status rules with priority or activity-note actions and execution history. Section 1.44 connects Knowledge items to projects, documents, and tasks, and adds snapshot history with restore. Section 1.45 adds debounced server-side Knowledge search, project and tag filters, and paginated loading. Section 1.46 adds reusable project templates that copy project descriptions, task details and priorities, and milestone titles into fresh projects. Section 1.47 adds template editing and usage tracking. Section 1.48 adds batch priority and assignment updates plus task CSV import and export. Section 1.49 adds task discussion, mentions, checklists, and followers; Section 1.50 scopes collaboration notifications to their intended recipients; Section 1.51 notifies task followers about task edits and batch updates; Section 1.52 adds notifications for comment edits/deletions and newly added mentions; Section 1.53 notifies task assignees about assignment changes; Section 1.54 adds a single task activity timeline; Section 1.55 adds checklist ordering controls and activity records for checklist lifecycle changes; Section 1.56 adds checklist item names and comment previews to task activity; Section 1.57 adds task discussion search and sorting; Section 1.58 replaces modifier-key mention selection with accessible checkboxes; Section 1.59 adds inline comment editing with mention updates; Section 1.60 adds direct links to individual comments; Section 1.61 adds discussion filters for the current author and mentions; Section 1.62 adds category filters to task activity; Section 1.63 refreshes the activity timeline after local collaboration actions and when the browser tab becomes visible; Section 1.64 adds single-task duplication with checklist copying; and Section 1.65 duplicates up to 100 selected tasks atomically with their checklists. See the [Section 1.65 notes](docs/sections/65-bulk-task-duplication.md) for verification and commit instructions.

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
