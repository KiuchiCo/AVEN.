# Section 1.5 · Sign-in and personal workspace

**Status:** Ready for review  
**Suggested commit:** `feat: add Clerk sign-in and personal workspace`

## Goal

Let a person create and sign in to an AVEN account, then create their personal workspace and become its Owner. Clerk handles credentials and sessions; the AVEN API verifies those sessions and keeps application users and workspace permissions in PostgreSQL.

## Included

- Clerk's Next.js provider, protected route proxy, sign-in and sign-up routes styled with AVEN's ivory/bronze identity.
- A NestJS bearer-token guard that validates Clerk JWT signature, issuer, expiry, and authorized frontend party.
- An authenticated `POST /api/v1/session/bootstrap` endpoint that requires the provider's primary email to be verified.
- A stable provider (`issuer`, `subject`) mapping on `User`; email is profile data, not the identity key.
- One personal workspace per user, enforced by a unique database constraint, and an Owner membership created in the same transaction.
- An authenticated `/workspace` page that displays the API/database-backed user and workspace. The static mockup remains available at `/prototype.html`.
- Helpful sign-in setup page when Clerk keys have not been configured.

## Configure local credentials

Create a development application in the [Clerk Dashboard](https://dashboard.clerk.com/). Add the following values to the existing root `.env` file; do not overwrite other local settings. See [Clerk's Next.js App Router setup](https://clerk.com/docs/nextjs/getting-started/quickstart) for finding the publishable and secret keys.

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_JWT_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
CLERK_ISSUER=https://your-development-instance.clerk.accounts.dev
```

Use the issuer (`iss`) for the same Clerk development instance. The publishable key is needed when building the web app; `CLERK_SECRET_KEY` stays server-side. `CLERK_JWT_KEY` is a public verification key that the API reads server-side. Never commit `.env` or place the secret key in a `NEXT_PUBLIC_` variable.

Then start the local database, apply migrations, and generate the client:

```bash
npm run db:up
npm run db:migrate:deploy
npm run db:generate
```

Start the API and web app in separate terminals with `npm run dev:api` and `npm run dev`. Visit `http://localhost:3000/sign-up`, verify the email address, and AVEN will create the account's personal workspace on first entry. Clerk production MFA requires a paid plan; review the [identity decision](04-identity-decision.md) before launch.

## Security boundaries

- The API accepts bearer tokens only and verifies them with Clerk's backend SDK before using `sub` or `iss`.
- Email and display name are fetched from Clerk's server API after token verification. Email changes that collide with an existing AVEN account return a conflict; accounts are never merged by email.
- Workspace identity, personal workspace ownership, and membership role are read from AVEN's database. Client-provided workspace IDs and Clerk organization claims do not grant access.
- First-login user, personal workspace, and Owner membership creation occur in one transaction. Database uniqueness plus retry protects repeated and concurrent bootstrap requests.
- Do not add workspace data endpoints until each query enforces membership and workspace scoping.

## Review checklist

- `npm run db:validate` and `npm run db:generate` pass.
- `npm run build`, `npm run typecheck`, and `npm run lint` pass.
- The auth schema migration adds identity mapping and personal-workspace uniqueness without seed records.
- The sign-in pages show an AVEN setup prompt when keys are absent.
- With Clerk development keys and PostgreSQL configured, sign-up, verified-email bootstrap, Owner membership, and returning sign-in work end to end.
- Never commit local Clerk keys or database credentials.

Schema validation, generated-client setup, build, typecheck, lint, and dependency audit passed on 17 November 2026. A live sign-in and migration application require Clerk development keys and a running local PostgreSQL service, which are not configured in this workspace.
