# Section 1.28 · Project workspace suite

## Goal

Give each project a dedicated home that gathers delivery status, scheduled work, related documents, project history, and budget tracking in one place.

## Delivered

- Add a project workspace route at `/workspace/projects/:projectId`, linked from each project in the Projects list.
- Show task completion, open work, milestones, and the project deadline in an overview.
- Surface upcoming project tasks and allow their status to be changed from the overview.
- Build a chronological timeline from existing task due dates and dated project milestones.
- Collect documents linked to the project and provide routes to the existing document area.
- Filter workspace activity to the project and its linked tasks, calendar events, documents, and milestones.
- Add optional project budget total and spent amounts, stored as integer cents and displayed in AUD.
- Allow the budget to be updated manually from project creation and the project workspace.
- Add responsive layouts that follow AVEN's existing ivory, bronze, and sage visual language.

## Scope notes

Budget tracking is a manual summary. It does not connect to accounting, banking, or payment providers. The timeline shows dated tasks and milestones; it does not model task dependencies. Documents remain managed through the existing Documents section.

## Data change

The migration adds nullable `budgetTotalCents` and a `budgetSpentCents` integer defaulting to zero on projects. Deploy migrations and regenerate the Prisma client before starting the API:

```bash
npm run db:migrate:deploy
npm run db:generate
```

## Review

1. Open Projects and choose **Open project workspace** on a project.
2. Review the Overview, Timeline, Documents, Activity, and Budget tabs.
3. Change a task status in the overview and confirm it persists.
4. Enter a project budget and spent amount, save, then reload the page.
5. Check that the project overview adapts to a narrow screen.

Suggested commit message: `feat: add dedicated project workspaces`
