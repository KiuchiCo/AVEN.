# AVEN. operations: monitoring, deployment runbook and rollback

For setting AVEN. up the first time, see [DEPLOYMENT.md](DEPLOYMENT.md). This page is for running it: knowing when it is unhealthy, deploying a new version, and going back when a deployment goes wrong. None of the steps here are run by the repository's code; they are for the person operating the servers.

## 1. What is watched

| Signal | Where | Notes |
|---|---|---|
| Is the API up | `GET /api/v1/health` | Liveness. Never touches the database, so a database outage does not get the API restarted. |
| Can it reach the database | `GET /api/v1/health/ready` | Readiness: point the load balancer here. 503 when the database does not answer. Reveals nothing but `ready`. |
| Metrics | `GET /api/v1/metrics` with `Authorization: Bearer $METRICS_TOKEN` | Prometheus text format. Off (401 for everyone) until `METRICS_TOKEN` (24+ characters) is set. Scrape it from inside your network. |
| Errors | An error tracker, when `ERROR_TRACKING_DSN` is set | Any Sentry-compatible DSN. Server exceptions (5xx), failed background jobs, failed calls to outside services and browser errors are sent with a scrubbed message and stack and a few tags. Never bodies, headers, cookies, tokens or user content. Unset means nothing is sent and nothing depends on a tracker. |
| Logs | stdout/stderr, one JSON object per line in production | `time`, `level`, `context`, `requestId`, `message`. Secrets, emails and share/invitation tokens are redacted. Every response carries `x-request-id`; search the logs for it to follow one request. |

Settings (all optional): `ERROR_TRACKING_DSN`, `ERROR_TRACKING_ENVIRONMENT` (default `NODE_ENV`), `APP_RELEASE` (any label, e.g. the git commit; it appears on every error report), `NEXT_PUBLIC_APP_RELEASE` (the same label for browser reports, baked in at build time), `METRICS_TOKEN`.

### Metrics

`http_requests_total{method,route,status}` and `http_request_duration_seconds` (by route *pattern*, never by real address), `db_query_duration_seconds`, `db_ping_seconds`, `db_connection_failures_total`, `auth_failures_total{reason}`, `rate_limit_rejections_total{scope}`, `rate_limit_store_failures_total{mode}`, `background_job_failures_total{job}` (workflow-runner, calendar-sync, email-summary, push, …), `integration_failures_total{integration}` (stripe, anthropic, email, calendar, s3, push, clerk, embeddings, web-search), `file_upload_failures_total`, `ai_request_failures_total{kind}`, `client_errors_total`, `error_reports_total`, `account_exports_total`, `account_deletions_total`, and, with `REALTIME_BUS=postgres`, `realtime_bus_connected` (1/0), `realtime_events_published_total`, `realtime_events_received_total`, `realtime_publish_failures_total`, `realtime_bus_reconnects_total`, `realtime_duplicates_total`, `realtime_oversize_events_total`. Counters reset when the process restarts; use `rate()`/`increase()`.

### Suggested alerts

| Alert | Condition (PromQL) | First look |
|---|---|---|
| API unreachable | the readiness probe fails for 2 minutes | §3 and §4 |
| Error rate | `sum(rate(http_requests_total{status="5xx"}[5m])) / sum(rate(http_requests_total[5m])) > 0.02` for 5 m | error tracker, logs by `requestId` |
| Slow API | `histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2` for 10 m | database load, `db_query_duration_seconds` |
| Database | `increase(db_connection_failures_total[5m]) > 0` or `db_ping_seconds > 0.5` | database host, connection limits |
| A job keeps failing | `increase(background_job_failures_total[15m]) > 3` | logs for that `job` |
| An outside service is failing | `increase(integration_failures_total[10m]) > 5` by `integration` | that provider's status page |
| Sign-in trouble | `rate(auth_failures_total{reason="invalid"}[5m])` far above normal | Clerk status; an attack shows as a spike with `rate_limit_rejections_total` |
| Live-event bus down | `realtime_bus_connected == 0` for 2 minutes, or `increase(realtime_publish_failures_total[5m]) > 0` | the database connection used for LISTEN; people on other instances do not hear each other until it reconnects |
| Rate-limit store down | `increase(rate_limit_store_failures_total[5m]) > 0` | with `RATE_LIMIT_STORE=postgres`, the database; sensitive routes answer 503 meanwhile |

## 2. Deploying a new version

1. **Check what is changing.** `git log <deployed>..<new> --stat`. Read every new file in `apps/api/prisma/migrations/`. A migration that only adds tables, columns or indexes is *safe to roll back past*. One that drops or renames something, or makes a column required, is not (see §4).
2. **Back up.** `DATABASE_URL=… BACKUP_GPG_RECIPIENT=<key> ./scripts/backup.sh /var/backups/aven`, and copy `STORAGE_DIR` (or confirm the object-store bucket has versioning). Note the backup file name in the deployment record.
3. **Record the current release** (git commit and build ids), so you know what to go back to.
4. **Build.** `npm ci && npm run db:generate && npm run build` from the repository root. Set `APP_RELEASE` to the commit.
5. **Apply migrations** with the new code present: `npm run db:migrate:deploy` (it only applies what is pending, and stops on the first error). If it fails, nothing after it ran: stop and go to §4.
6. **Start the new API, then the web app.** Wait for `GET /api/v1/health/ready` to answer 200 before sending traffic to it. With more than one API instance, replace them one at a time.
7. **Verify** (§5).

## 3. Going back after a failed deployment

Decide quickly which of these you are in. When unsure, do (a) first: it is always safe.

**(a) Roll the application back (nothing in the database changed, or the migrations were additive).**
1. Redeploy the previous build of the API and web app (the artifacts or commit you recorded in step 3). Do **not** run any migration "down": Prisma has none, and the previous version works with the extra tables or columns an additive migration left behind.
2. Restore the previous environment variables if they changed (§6).
3. Run §5.

**(b) A migration failed half way.** `prisma migrate deploy` stops at the first failure and marks that migration as failed; part of it may already have been applied, so inspect the database before going on. Run `npx prisma migrate status` from `apps/api`: it names the failed migration. Fix the cause (usually data that violates a new constraint) on a restored copy first. Once the database is back to the state before that migration (by hand, or by restoring as in (c)), run `npx prisma migrate resolve --rolled-back <name>` and deploy again. Roll the application back as in (a) meanwhile.

**(c) A destructive or data-changing migration went through and the data is now wrong.** Application rollback is not enough. Put the site in maintenance (stop the API; the web app will show its offline page), restore the database from the backup taken in step 2 into a **new, empty database**, point `DATABASE_URL` at it, redeploy the previous build, then run §5. Keep the damaged database untouched until you have confirmed the restore: it may hold work done after the backup, which must be reconciled by hand. Never restore over the live database. Files: restore `STORAGE_DIR` from the same moment, or rely on bucket versioning.

```bash
createdb aven_restore
# plain backup:   gunzip -c aven-<timestamp>.sql.gz | psql "postgresql://…/aven_restore"
# encrypted one:  gpg --decrypt aven-<timestamp>.sql.gz.gpg | gunzip | psql "postgresql://…/aven_restore"
```

**Practise (c) on a scratch database before you need it.** A backup that has never been restored is a guess.

## 4. Database migration considerations

- Migrations are forward-only and applied in order by name. Never edit or delete a migration that has been applied anywhere: add a new one.
- Prefer *expand then contract*: ship the migration that adds the new column or table with the code that can work with or without it; remove the old one in a later release, once nothing running uses it. That is what keeps application rollback (a) possible.
- The `rate_limits` migration (table `rate_limit_buckets`) is additive and only used when `RATE_LIMIT_STORE=postgres`.
- Before a risky migration, rehearse it: restore the latest backup into a scratch database and run `npm run db:migrate:deploy` against it, timing it.

## 5. After any deployment or rollback: verify

```bash
API=https://api.example.com/api/v1
curl -fsS $API/health                      # {"status":"ok",…}
curl -fsS $API/health/ready                # {"status":"ready",…}  (503 = the database is not reachable)
curl -s -o /dev/null -w '%{http_code}\n' $API/session/me   # 401: signing in is required, and the API is answering
curl -fsS -H "Authorization: Bearer $METRICS_TOKEN" $API/metrics | grep -E '^db_ping_seconds|^http_requests_total' | head
```

Then, in a browser: sign in; open Home, a project, a document and Messages; upload and download a small file; confirm the page shows no banner about being offline. In the error tracker, watch for new issues for ten minutes and compare the 5xx rate with before. In the logs, `level":"error"` lines should be few and explainable. For billing, confirm the next Stripe webhook is accepted (Stripe dashboard → Webhooks → recent deliveries).

## 6. Configuration and secrets recovery

- The complete list of settings is `.env.example` plus the tables in [DEPLOYMENT.md](DEPLOYMENT.md). Keep the *values* in your secrets manager or platform settings, not in the repository, and keep a dated copy of the production set somewhere separate from the servers.
- If the environment is lost: recreate it from that copy. Secrets that cannot be recovered can be re-issued: Clerk keys (Clerk dashboard), Stripe keys and the webhook secret (Stripe dashboard; update the endpoint secret), `EMAIL_API_KEY`, `ANTHROPIC_API_KEY`, S3 keys, VAPID keys (note: new VAPID keys stop existing browser push subscriptions working until people re-subscribe), `METRICS_TOKEN` (any new random string).
- `TOKEN_ENCRYPTION_KEY` encrypts the stored calendar tokens. If it is lost, those tokens cannot be read: people reconnect their calendars. Do not change it casually.
- Rotate any secret you suspect was exposed, then redeploy. Run `node scripts/secret-scan.mjs history` to check the repository itself.

## 7. Restore drill (executed 22 Nov 2026, on a disposable database)

Run against throwaway databases on the development Postgres container (never the working database): `aven_drill` was migrated from empty, filled through the real API with synthetic data (3 users, a team-only project, 40 tasks, 10 documents, 20 messages, 30 database records, 1 file), backed up with the real `scripts/backup.sh`, restored into an empty `aven_drill_restore`, compared, and then an API instance was started on the restored copy. Both databases were dropped afterwards.

| Check | Result |
|---|---|
| Backup | 0.84 s, 25 KB, file mode 600 in a 700 directory, `gzip -t` ok, starts with a `pg_dump` header |
| Restore | 0.57 s, `psql -v ON_ERROR_STOP=1`, 0 errors |
| Tables and rows | 58 tables; 225 rows in total; identical row counts in every table |
| Schema | `pg_dump --schema-only` of both is identical; 171 indexes, 135 foreign keys, 48 unique constraints, 15 enum types, 60 migrations recorded in both |
| Relationships and content | 0 orphaned tasks; an md5 over all task titles and statuses is identical |
| Application on the restored copy | `/health/ready` 200; a member sees 20 of the 40 tasks (the team-only project's half stays hidden), the owner sees all 40, 10 documents, 3 members; a guest's write is refused (403); an outsider is refused (403) |

Limits of this drill: the data set is tiny, so the timings say nothing about a large database; `pg_dump` ran through `docker exec` because this machine has no local client (the script itself is unchanged); the GPG-encrypted option was **not** exercised (GPG is not installed here); file **contents** are not in the database and are not part of this backup, so a restore of file bytes (from `STORAGE_DIR` or the bucket) was not drilled; and nothing here replaces a drill on your real infrastructure with a realistic data size.
