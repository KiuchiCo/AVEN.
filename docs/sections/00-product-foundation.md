# Section 00 · Product foundation

**Status:** In progress  
**Suggested commit:** `docs: define AVEN product foundation`

## Product

AVEN is a connected productivity workspace for organising work and life. Its core areas are projects, documents, databases, calendar, and AVEN Intelligence.

**Product promise:** Your entire world, organised.

## Principles

- Build a working application, not a set of disconnected mockups.
- Keep workspace information connected across modules.
- Make the interface calm, legible, and consistent.
- Keep users in control of consequential actions.
- Make each delivery small enough to review and record in Git.

## Product direction

The broader product direction established so far includes:

- **Projects:** overview, tasks, board, timeline and dependencies, milestones, workload, documents, budget, and activity.
- **Documents:** a workspace editor connected to projects and other records.
- **Databases:** structured tables, views, filters, formulas, and relationships.
- **Calendar:** unified calendars, task deadlines, time blocking, recurring events, and external calendar connections.
- **AVEN Intelligence:** create, analyse, research, organise, and execute approved actions using permitted workspace information.
- **Later platform work:** automation workflows, connected knowledge and whiteboards, and mobile and desktop experiences.

## Delivery order

1. Product foundation and application shell.
2. Authentication, accounts, and workspace membership.
3. Projects and task workflows.
4. Documents.
5. Databases.
6. Calendar.
7. AVEN Intelligence.
8. Integrations, automation, and additional platforms.

This order gives AVEN a usable foundation before introducing modules that depend on shared accounts and workspace data.

## First usable release

The first release should let a user enter a workspace, navigate the main areas, and manage a small project with tasks. Documents, databases, calendar, and intelligence can then connect to the same workspace model as they are built.

## Decisions still open

The frontend, backend, database, and recommended identity provider are recorded in the architecture and section decisions. Review the identity recommendation before integration. Hosting and production email delivery remain open. Keep secrets in environment configuration and out of Git.

## Record of sections

Update the section table in the root README as each brief is implemented and reviewed. Keep one focused commit per section when practical so the Git history shows how AVEN was built.
