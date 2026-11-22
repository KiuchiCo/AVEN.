# Testing AVEN.

## 1. The suites

| What | Command | Needs |
|---|---|---|
| API unit tests | `npm test --workspace @aven/api` | nothing |
| Web logic tests | `npm test --workspace @aven/web` | nothing |
| Web component tests (rendered React in jsdom, with axe accessibility rules) | `npm run test:components --workspace @aven/web` | nothing |
| API integration tests (real app, real PostgreSQL, Clerk's token check replaced by a test header) | `INTEGRATION_DATABASE_URL=postgresql://…/aven_integration npm run test:integration --workspace @aven/api` | a **throwaway**, migrated database |
| Browser tests (real Chrome against a fresh API and web server and a throwaway database) | `npm run test:e2e --workspace @aven/web` | Postgres running, Chrome installed |
| Secret scan | `node scripts/secret-scan.mjs history` (and `working`) | full git history |
| Lint, types, build | `npm run lint`, `npm run typecheck --workspace @aven/api`, `npm run build` | |

Browser tests cover: shared document links and the public API behind them, the signed-out redirect, the landing page, the script policy, installability and offline, **accessibility** (axe, WCAG 2.2 A/AA incl. colour contrast, light and dark; keyboard focus visibility; reduced motion; 200 % text) and **responsive layout** at ten viewport sizes (1920×1080 down to 375×812: no sideways scroll, nothing pushed off-screen, touch targets ≥ 24 px). Component tests cover the shared dialog, form, notice, tab and empty-state pieces, the editor's slash menu, block browser and format bar, the theme and account-data settings cards, and a project dialog, including loading, error, disabled and keyboard behaviour. jsdom has no layout or painting, so contrast and responsive checks run only in the browser suite.

## 2. Signed-in browser tests (real Clerk, development instance)

`apps/web/e2e/tests/authenticated.spec.ts` signs in through Clerk's supported testing mechanism (`@clerk/testing`: the helper asks Clerk's backend API for a one-time sign-in ticket for an existing user, so no password is typed or stored) and then:
- checks signed-out pages and API data are closed, and that signing in and out works;
- loads **every main screen** at 1440, 768 and 390 px wide and checks no sideways scroll and no WCAG 2.2 AA violations;
- creates a project; downloads the data export and opens (and cancels) the account-deletion dialog; changes the theme.

It is **skipped** unless you provide a user, and it refuses a production Clerk key. To run it:

1. In your Clerk **development** instance, create a throwaway user (the user must already exist; the test does not create accounts).
2. Make sure the root `.env` holds the development instance's `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (`npm run test:e2e` passes them on).
3. `E2E_CLERK_USER_EMAIL=throwaway@example.com npm run test:e2e --workspace @aven/web -- authenticated.spec.ts`

Credentials never go in the repository: pass them in the environment only. **These tests have not been run**: no test user or Clerk access was available when they were written, so expect to adjust selectors on the first run.

## 3. What only a person can check in Clerk

Clerk's own screens are third-party, and its testing support cannot drive them. Check by hand on the development instance (use `name+clerk_test@example.com` addresses: Clerk accepts the fixed code `424242` for them):

- Registration, email verification, sign-in, sign-out, "forgot password", session expiry, multi-factor, passkeys.
- In the Clerk dashboard: email verification required; password policy and compromised-password protection; MFA and passkeys offered or required; account lockout and bot protection; session lifetime and inactivity timeout; allowed redirect URLs and origins; a separate **production** instance from development.
- After deleting a test account with `alsoDeleteSignIn`, that user no longer appears in Clerk.

## 4. Known limits

The integration suite replaces Clerk's token check with a test header, so it proves AVEN's permission logic, not Clerk. Live-update fan-out is in memory (one API instance). Color-contrast, keyboard and responsive checks cover the public pages in this repository's own run; the signed-in screens are covered only by the Clerk-backed suite above.
