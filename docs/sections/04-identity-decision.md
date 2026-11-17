# Section 1.4 · Identity provider decision

**Status:** Ready for review  
**Suggested commit:** `docs: decide managed identity for AVEN`

## Decision

Use Clerk as AVEN's managed identity provider for the first authenticated release. Keep identity authentication in Clerk and keep application users, workspaces, workspace roles, invitations, and authorization in AVEN's PostgreSQL database.

This is a provider recommendation, not an integration. Do not add credentials, auth packages, or sign-in routes until this record is reviewed and the Clerk development instance is configured.

## Why

AVEN is an early product with a Next.js frontend and separate NestJS API. A managed provider avoids implementing and operating password storage, email verification, account recovery, multi-factor authentication, and session security while leaving product data and workspace permissions in AVEN's database.

Clerk has a first-party Next.js SDK, email verification flows, multi-factor options, and short-lived signed session JWTs. Its backend SDK can verify tokens using the instance's JWKS. Clerk also provides organizations, invitations, and roles, but AVEN will not use those as its workspace authorization source because the product already has its own `Workspace` and `WorkspaceMember` records. [Clerk sign-up and sign-in options](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options), [session token verification](https://clerk.com/docs/guides/sessions/manual-jwt-verification), [Organizations](https://clerk.com/docs/guides/organizations/overview)

## Alternatives considered

| Option | Fit for AVEN | Decision |
| --- | --- | --- |
| Clerk | Strong Next.js integration; managed email verification and MFA; backend token verification. AVEN can keep workspace data and authorization in PostgreSQL. Production MFA requires a paid plan, so check pricing before launch. | Recommend for the first release. |
| Auth0 | Mature OIDC provider with Organizations, invitations, and MFA. Its organization invitation flow and Management API add setup and server-side integration that AVEN does not need while its own workspace model is authoritative. | Keep as a fallback if enterprise SSO or customer identity requirements become central. [Auth0 organization invitations](https://support.auth0.com/center/s/article/Auth0-Organization-Invitation-Configuration) |
| Amazon Cognito | Provides OIDC tokens and MFA, with AWS-managed user pools and usage-based tiers. Its user pools do not replace AVEN's workspace/membership model; provisioning, invitations, and role mapping still need AVEN work. | Prefer if deployment later commits to AWS and cost or AWS integration outweighs the simpler Next.js setup. [Cognito authentication](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication.html), [Cognito MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html) |
| Build authentication inside NestJS | Full control of account/session storage and portability, but AVEN would own password security, verification and recovery email, MFA, abuse protection, session revocation, and security operations. | Defer; too much security-sensitive work for the first release. |

## Required implementation boundaries

- Clerk is the authority for authentication credentials and sign-in state. AVEN never stores passwords, MFA secrets, or recovery codes.
- The API accepts only verified Clerk session tokens. Validate signature, issuer, expiry, and authorized party using Clerk's backend SDK/JWKS. Reject pending or incomplete sessions.
- Treat the stable identity pair (`issuer`, `subject`) as the external identity key. Do not identify or merge users by email alone; email can change and a provider may hold more than one address.
- Add the provider subject to AVEN's `User` record in a later migration, with a unique constraint. The current `User.email` field is profile/contact data, not a login key.
- After token verification, map the external subject to an internal AVEN user. Load workspace memberships and enforce the AVEN role on every API request. Never trust a client-supplied workspace ID or a provider organization claim as proof of membership.
- AVEN's database remains authoritative for `WorkspaceMember` roles, personal workspace creation, invitations, and resource access. Provider organization roles are not used for product authorization.
- Keep tokens out of local storage. Use the supported Next.js session/cookie flow and send a short-lived bearer token for cross-origin API calls; configure allowed origins explicitly.
- Require email verification before creating a usable AVEN user or accepting a workspace invitation. Implement workspace invites as AVEN records tied to a verified recipient address; consume each invite once and expire it.
- Enable TOTP and backup recovery codes for MFA. MFA is available for development, but Clerk documents that production MFA requires a paid plan; confirm plan and pricing before production. Avoid SMS as the only second factor. [Clerk MFA options and plan note](https://clerk.com/docs/guides/configure/auth-strategies/sign-up-sign-in-options)
- Keep the database usable if the provider changes: retain AVEN-owned workspaces and user IDs, and store the external identity mapping separately from domain records.

## Consequences and follow-up

- Before the auth implementation milestone, create a Clerk development instance and configure separate development/production keys. Store keys in `.env`, never in Git or the client bundle.
- Add a unique `issuer`/`subject` mapping migration and a signed webhook for provider profile changes/deletions. Make webhook handling idempotent; use verified request identity as the guard when provisioning a user.
- Implement sign-in/up UI in the AVEN visual system, an auth guard in Next.js, NestJS token verification, first-login personal workspace creation, and API authorization tests as one later vertical slice.
- Configure production domains, email deliverability, MFA policy, deletion behavior, recovery, rate limits, and incident access before launch.
- Recheck Clerk's plan limits, production MFA price, and contractual/data residency requirements before launch; these are time-sensitive and outside this architecture choice.

## Review checklist

- [x] Choose managed identity rather than custom password/session storage.
- [x] Select a provider recommendation and record alternatives.
- [x] Keep AVEN workspace membership and authorization as the product source of truth.
- [x] Record token verification, identity mapping, MFA, and email verification requirements.
- [ ] Review the Clerk recommendation and approve the provider before integration.
