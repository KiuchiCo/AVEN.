# Section 1.3 · PostgreSQL and Prisma foundation

**Status:** Ready for review  
**Suggested commit:** `feat: add PostgreSQL and Prisma foundation`

## Goal

Add a local PostgreSQL service, a versioned relational schema, and the initial Prisma migration. This step creates no demo rows and adds no sign-in or product API behavior.

## Included

- PostgreSQL 17 in a local Docker Compose service with a persistent named volume and health check.
- Prisma ORM 7.10.1 with its PostgreSQL driver adapter and a generated client kept out of Git.
- Initial tables for users, workspaces, memberships, projects, tasks, documents, and calendar events.
- UUID identifiers, workspace foreign keys, role/status enums, timestamps, and initial query indexes.
- A reviewed-from-schema SQL migration and Prisma migration lock file.
- Root `.env.example` values for local development only.

The project now targets Node.js 24 LTS (24.15 or newer), which is supported by the current stable Prisma release and Nest CLI.

## Local setup

Copy the example environment file and start PostgreSQL:

```bash
cp .env.example .env
docker compose up -d postgres
```

Apply the checked-in migration and generate the Prisma client:

```bash
npm run db:migrate:deploy
npm run db:generate
```

For later schema edits, use `npm run db:migrate:dev` to create and apply a named development migration. Stop the local service with `docker compose stop postgres`; the named data volume remains in place.

## Boundaries

Authentication, a Prisma-backed Nest module, seed data, workspace authorization, and domain endpoints are later steps. Every future query must scope records to a workspace and verify membership in the API. A foreign key alone does not enforce tenant authorization or prove that related records belong to the same workspace.

## Review checklist

- `npm run db:validate` accepts the schema.
- `npm run db:generate` creates the ignored client output.
- `npm run build`, `npm run typecheck`, and `npm run lint` pass.
- `npm audit` reports no known vulnerabilities.
- The migration is generated from the schema and contains no seeded records.
- If Docker is installed, `docker compose up -d postgres` and `npm run db:migrate:deploy` complete successfully.

Schema, client-generation, build, typecheck, lint, and dependency checks passed on 17 November 2026. Docker is not installed in the current environment, so applying the migration against a running PostgreSQL server remains for local verification.
