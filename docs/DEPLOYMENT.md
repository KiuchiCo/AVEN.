# Deploying AVEN

AVEN is two Node processes and a PostgreSQL 17 database: the web app (`apps/web`, Next.js) and the API (`apps/api`, NestJS). Node 24 or newer is required.

## 1. Configuration

Copy `.env.example` to `.env` once and fill it in. Never copy it over an existing `.env`. Required in production:

| Setting | Why |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `WEB_ORIGIN` | The public web address, e.g. `https://app.example.com` (also used in emails and billing redirects) |
| `NEXT_PUBLIC_API_BASE_URL` | Public API address including `/api/v1`. It is baked in when the web app is built |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_ISSUER` | Sign-in. Use a production Clerk instance, not a development one |
| `TRUST_PROXY` | Number of proxies in front of the API (usually `1`). Without it every visitor looks like the proxy's address and shares one rate limit |

Optional features switch on when their keys are present: `ANTHROPIC_API_KEY` (AVEN Intelligence), `EMAIL_API_KEY` + `EMAIL_FROM` (invitations and notification emails), `STRIPE_*` (paid plans). With no key, the feature says it is off rather than pretending.

The API refuses to start with an invalid configuration and says which setting is wrong.

## 2. Build and run

```bash
npm ci
npm run db:generate
npm run db:migrate:deploy       # applies pending migrations; safe to repeat
npm run build                   # builds both apps
npm run start --workspace @aven/api    # node apps/api/dist/main.js
npm run start --workspace @aven/web    # next start
```

Run migrations before starting the new API version, on every release. Migrations only add to the database; AVEN never deletes user content when a plan changes.

Put both behind HTTPS (a reverse proxy or your platform's load balancer). The API sends HSTS and the web app does too, in production only.

## 3. Health checks

- `GET /api/v1/health` is liveness: the process is up. Use it to decide when to restart.
- `GET /api/v1/health/ready` is readiness: the database answers (503 if not). Use it for load balancing.

Neither needs a sign-in and neither is rate limited. The API shuts down cleanly on SIGTERM (it closes database connections).

## 4. One API instance, for now

Two things live in the API process's memory, so run **one** API instance until they are moved:

- Live messaging updates only reach people connected to the same process (`apps/api/src/messaging/channel-events.ts`; swap in Postgres `LISTEN/NOTIFY` or Redis).
- Rate limit counters are per process.

Workflows, email summaries and scheduled work run inside the API process too. If you ever run more than one, set `WORKFLOWS_DISABLED=true` on all but one. Claiming of due work uses `FOR UPDATE SKIP LOCKED`, so a duplicate would not run a step twice.

## 5. Files

Uploads are stored on local disk in `STORAGE_DIR` (default under `apps/api`). Use a persistent volume. There is no S3 driver yet; the storage layer is an interface (`StorageDriver`) so one can be added without touching callers.

## 6. Backups and restore

Back up the database and `STORAGE_DIR` together, on a schedule (daily is a sensible start):

```bash
DATABASE_URL=postgresql://... ./scripts/backup.sh /var/backups/aven   # keeps 14 days; KEEP_DAYS to change
rsync -a "$STORAGE_DIR/" /var/backups/aven-files/
```

Restore into an empty database, then start the API:

```bash
gunzip -c aven-20260101T020000Z.sql.gz | psql "postgresql://.../aven"
```

Practise a restore into a scratch database before you need one. A backup you have never restored is a guess.

## 7. Payments

Create three monthly prices in Stripe (A$9.99, A$19.99, A$29.99 per seat) and set `STRIPE_PRICE_PLUS|PRO|BUSINESS`. Add a webhook endpoint at `POST <api>/api/v1/billing/webhook` for `checkout.session.completed`, `customer.subscription.*` and `invoice.*`, and set `STRIPE_WEBHOOK_SECRET`. Plan limits can be tuned without code through `BILLING_PLAN_OVERRIDES`.

## 8. Security notes

- Every request is tied to a Clerk identity and checked against workspace membership on the server; guests are read-only everywhere. Other workspaces' data returns 404.
- The API sends `nosniff`, `frame-ancestors 'none'` and related headers. The web app sends `nosniff`, `X-Frame-Options: DENY`, a referrer policy and a permissions policy. It does not yet send a Content-Security-Policy: Clerk loads scripts and frames from its own domains, so a correct policy needs testing against your Clerk instance.
- `apps/api/test/integration/auth-coverage.test.mjs` walks every route the API registers. It checks that anonymous requests get 401 (except the three documented public routes), that a signed-in non-member gets 404 on every workspace route, and that a guest is refused on every route that changes something. A new route that forgets its access check fails this test.
- A person can hold at most five live message connections open at once.
- Outgoing webhooks from workflows refuse private and internal addresses (checked after DNS resolution, no redirects). `WORKFLOW_ALLOW_PRIVATE_WEBHOOKS` is refused in production.
- Stripe webhooks are verified by signature with a five-minute replay window; each event is applied once.
- Keep `.env` out of version control and rotate any key that has been pasted anywhere public.
