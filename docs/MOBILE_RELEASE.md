# Mobile release

Nothing here has been run; it is the checklist.
1. Set production `AVEN_PRODUCTION_URL` (https) and run `build:ios:production` once to confirm it compiles.
2. In Xcode: set the team, bundle id `app.aven.mobile`, entitlement `aps-environment=production`, version and build number.
3. Add Associated Domains (`applinks:<domain>`) and host `apple-app-site-association` if universal links are wanted.
4. Configure API `APNS_*` and deploy the migration (`prisma migrate deploy`).
5. Archive, validate and upload via Xcode Organizer / TestFlight. App Store submission needs privacy answers (Face ID, camera, push) and review notes with a test account.
Never put Clerk secret keys or the `.p8` key in the app.
