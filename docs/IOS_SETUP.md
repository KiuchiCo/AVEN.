# iOS setup

Requirements: macOS, Xcode with an iOS platform, Node 20+, CocoaPods not needed (Swift Package Manager via Capacitor).

```bash
npm install
npm run build:ios --prefix apps/mobile          # unsigned simulator build, development env
open apps/mobile/ios/App/App.xcodeproj
```
In Xcode choose the **App** scheme and an iPhone simulator, then Run. The development build loads `http://localhost:3000` (run the web app with `npm run dev`); for another host set `AVEN_APP_URL`.

Staging / production simulator builds:
```bash
AVEN_STAGING_URL=https://staging.example.com npm run build:ios:staging --prefix apps/mobile
AVEN_PRODUCTION_URL=https://app.example.com npm run build:ios:production --prefix apps/mobile
```
Re-sync after changing environment: `npm run sync[:staging|:production] --prefix apps/mobile`.

## Device builds (you must provide)
- An Apple Developer team: set `DEVELOPMENT_TEAM`, build with `SIGN=1`. No certificates are included.
- Push: enable Push Notifications, create an APNs `.p8` key, set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (and `APNS_BUNDLE_ID`) on the API. The entitlement is `aps-environment=development`; change to `production` for release.
- Clerk: add the app's origin to your Clerk instance. Google/Apple OAuth inside a web view is blocked by Google; use email sign-in or add a native OAuth flow.
