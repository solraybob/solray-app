# Solray native shells (Capacitor)

This document covers everything needed to build the iOS and Android
native apps from this repo. The web app at `app.solray.ai` remains the
canonical product; the native apps are thin Capacitor shells that load
that URL and add native-only features (push notifications, in-app
purchases, voice recording). There is no widget or Live Activity target.

For the step-by-step iOS release (build 11 onward) follow
`CAPACITOR_RUNBOOK.md`; this file is the general reference.

## One-time setup (per machine)

You need a Mac with Xcode for iOS builds. Android builds work on
Mac, Linux, or Windows.

```bash
# Install Capacitor CLI globally so `npx cap` resolves quickly
npm install -g @capacitor/cli   # optional; npm-installed local binary works too

# At the repo root (solray-app/)
npm install
```

You also need:

- **Xcode** (latest stable from the Mac App Store)
- **Apple Developer Program** membership ($99/year) signed in to Xcode
- **Android Studio** (free) for the Android emulator + signing tools
- **Java 17** (Android Studio bundles this)
- **CocoaPods** (`sudo gem install cocoapods`)

## Native projects

`ios/` and `android/` already exist and are committed. Do NOT run
`npx cap add` again; it would recreate the projects and lose signing,
entitlements, the privacy manifest and build settings. Propagate changes
to `capacitor.config.ts` or plugins with `npx cap sync`.

Capacitor is pinned to 6.2.2 (core, cli, ios, android). The Capacitor 8
upgrade needed for Android API 36 is a separate, planned step.

## Day-to-day flow

```bash
# After any change to the web build or capacitor config:
npx cap sync                    # both platforms
# or per platform:
npx cap sync ios
npx cap sync android

# Open in the native IDE for builds + simulator runs:
npx cap open ios                # opens Xcode
npx cap open android            # opens Android Studio
```

The web app itself is loaded over the network from `https://app.solray.ai`
(see `capacitor.config.ts` `server.url`). You do NOT need to run
`next build` to update the native shell — every web deploy is
immediately reflected in the native apps on next launch.

## Native-only assets that need attention

### App icons

Replace the default Capacitor icon set with Solray's:

- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` — 18 PNGs
  in specific sizes. Easiest: use `npx capacitor-assets generate` after
  placing a single 1024×1024 source at `resources/icon.png`.
- **Android**: `android/app/src/main/res/mipmap-*/` — same idea, and
  `capacitor-assets` auto-generates these from the same source.

### Splash screen

Currently configured to forest-deep `#050f08` background with no logo.
For a polished look, drop a 2732×2732 splash at `resources/splash.png`
and re-run `npx capacitor-assets generate`.

## Push notifications

### iOS (APNs)

- The project has the Push Notifications entitlement (development for
  Debug, production for Release) and AppDelegate forwards the APNs token
  to Capacitor. Enable Push Notifications on the `ai.solray.app` App ID
  and regenerate the **Solray App Store** profile (runbook section 4).
- No Background Modes: the daily push is an ordinary alert.
- The app never asks at sign-up. After a first Oracle reply, or Today on a
  later day, a short sheet on Today offers the daily note; Yes shows the
  system prompt. When permission is already granted the current token is
  bound on every launch, login and resume via `POST /push/native-subscribe`.
  Logout calls `POST /push/native-unsubscribe`. A device token has one
  owner in `native_push_tokens`; binding it again moves it.
- Backend variables (`solray-ai/ai/push_apns.py`): `APNS_AUTH_KEY`,
  `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, optional `APNS_HOST`.
  TestFlight and App Store builds use production APNs (the default host).
  Only Xcode development builds get sandbox tokens.
- The daily teaser wording lives in `solray-ai/ai/push_copy.py`.

### Android (FCM)

Off for now. The web app does not prompt or register on Android because
the backend has no FCM sender. Turning it on needs: a Firebase project
with `google-services.json` at `android/app/google-services.json`
(gitignored), the Google Services Gradle plugin, an FCM sender in the
backend, and adding "android" to `PUSH_PLATFORMS` in `lib/native-push.ts`.

## App identifiers

| Platform | Identifier         | Display name |
|----------|--------------------|--------------|
| iOS      | `ai.solray.app`    | Solray       |
| Android  | `ai.solray.app`    | Solray       |

Pick a different identifier per environment if you want a separate
"Solray Dev" build that can install alongside the production one — e.g.
`ai.solray.app.dev` for staging.

## Submission

### App Store (iOS)

1. App Store Connect → My Apps → "+" → New App.
2. Fill out metadata (privacy policy URL, support URL, marketing URL,
   age rating, category: Lifestyle).
3. Subscriptions are sold with Apple In-App Purchase (`solray_monthly`,
   `solray_yearly`; see `lib/play-billing.ts` and runbook section 8).
   Solray does not qualify for the Reader App entitlement and does not
   link out to web payment from the app.
4. Archive in Xcode, Distribute App, upload to App Store Connect.
5. Submit for review.

### Google Play

1. Play Console → Create app.
2. Fill out the data safety form (point to https://solray.ai/legal).
3. Generate an upload keystore (`keytool -genkey ...`); store it OFF
   the repo. Configure `android/app/build.gradle` with `signingConfig`.
4. Build a signed App Bundle (`./gradlew bundleRelease` or via Android
   Studio: Build → Generate Signed Bundle).
5. Upload the .aab to Play Console internal testing track first, then
   promote to production once tested.

## Updating the apps without store resubmission

Because we use `server.url` mode, every web deploy reaches native
users automatically on next app launch. The exceptions that DO require
a store resubmission:

- Changes to `capacitor.config.ts`
- New native plugins added/removed
- Native code changes (Swift/Kotlin)
- Asset changes (icons, splash, entitlements)

In all of those cases, run `npx cap sync` and rebuild for the relevant
platform.
