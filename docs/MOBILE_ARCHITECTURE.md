# AVEN mobile architecture (iPhone and iPad)

## Decision
One universal iOS app (`TARGETED_DEVICE_FAMILY = 1,2`, iOS 15+) built with **Capacitor 8**. The shell loads the deployed AVEN web app of one environment (`server.url`); a custom Swift plugin, `AvenNative`, adds device features. Chosen over React Native/Expo/SwiftUI because the whole product (documents, whiteboards, database views, Clerk sign-in) already exists in the Next.js app, and rewriting it natively would fork the product. It is not a plain browser view: the app has its own icon, launch screen, tab bar, native lock, push, share sheet, scanner, deep links and an offline page.

## Layers
- `apps/mobile` – Capacitor project, `ios/App` Xcode project, `scripts/build-ios.mjs`, `capacitor.config.ts` (`resolveServer`).
- Native Swift (`ios/App/App`): `AvenBridgeViewController`, `AvenNativePlugin`, `AppLock`, `Keychain`, `AvenNotificationCenter`, `AppDelegate`, `SceneDelegate`.
- Web (`apps/web/app/mobile`): `native.ts` (plugin bridge, `deviceClass`, `routeForLink`), `mobile-tab-bar.tsx`, `native-events.tsx`; `workspace/settings/device-card.tsx`; CSS in `globals.css`.
- API (`apps/api/src/push`): `NativePushDevice` registry, `ApnsClient`, device endpoints.

## Environments
`AVEN_ENV` = `development` (default; `http://localhost:3000` or `AVEN_APP_URL`), `staging`, `production`. Staging/production require an https URL (`AVEN_APP_URL`, `AVEN_STAGING_URL`/`AVEN_PRODUCTION_URL`) that is not local or private. Bundle ids: `app.aven.mobile.dev`, `.staging`, `app.aven.mobile`. Development builds point at your dev server; release builds never use localhost.

## Authentication
Clerk runs inside the web view as on the website; its session lives in the web view's cookies/storage. No Clerk secret key is in the app. The native Keychain only stores native flags (app lock). Face ID / Touch ID is an extra local lock and never replaces Clerk. Sign-out wipes the Keychain and web data and unregisters the push token.

## Deep links
`aven://<route>` (and the app's own origin) are allow-listed to fixed `/workspace/...` routes (optionally with a UUID); anything else is ignored. Clerk and the API still enforce access. Universal links are plumbing only: they need a domain and an `apple-app-site-association` file (not done).

## Push
iOS registers for APNs; the token is stored per user (max 10 devices, environment-aware). The API signs an ES256 token with the `.p8` key and sends over HTTP/2; dead tokens are removed. Sign-out unregisters through a public, rate-limited endpoint where the token is the proof.

## Layout
Phones (≤820px or Capacitor): bottom tab bar (Home, Inbox, My Tasks, Calendar, More), safe-area padding. iPad: persistent sidebar, no tab bar.
