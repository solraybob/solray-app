# Solray native shells (Capacitor)

This document covers everything needed to build the iOS and Android
native apps from this repo. The web app at `app.solray.ai` remains the
canonical product; the native apps are thin Capacitor shells that load
that URL and add native-only features (push notifications, the iOS
home-screen widget, Live Activities).

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

## Initialize the native projects (one time)

```bash
# At the repo root
npx cap add ios
npx cap add android
```

This creates `ios/` and `android/` directories. Commit them to git.
After this, every change to the web app or `capacitor.config.ts` should
be propagated to native via `npx cap sync`.

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

1. In Xcode, select the `App` target → Signing & Capabilities → "+ Capability" →
   add **Push Notifications** AND **Background Modes** (check "Remote
   notifications").
2. Apple Developer portal → Certificates → create an APNs Authentication
   Key (.p8 file). Note the Key ID and your Team ID.
3. Upload the .p8 + Key ID + Team ID to whichever push provider the
   backend uses (likely OneSignal, Firebase, or direct APNs HTTP/2).
4. Run a test build on a real iPhone (push doesn't work on the
   simulator). After the user logs in, the app will request notification
   permission; on grant, it registers with APNs and posts the device
   token to `POST /push/native-subscribe`. Confirm a row appears in the
   `native_push_tokens` table.

### Android (FCM)

1. Firebase Console → create a Solray project → add an Android app
   with package name `ai.solray.app`. Download the generated
   `google-services.json` and place it at
   `android/app/google-services.json` (gitignored — DO NOT commit).
2. In `android/app/build.gradle` ensure the Firebase plugins are
   applied (Capacitor's push plugin documentation has the exact lines).
3. Run a test build on a real Android device or emulator. Same flow:
   permission prompt → registration → token POSTed to backend.

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
3. Apply for the **Reader App entitlement** so iOS subscriptions can
   link out to the web for billing instead of being forced through
   Apple In-App Purchase (which takes 30%). Apple takes 2-4 weeks to
   review the entitlement application; file it on day 1.
4. Archive in Xcode → Distribute App → upload to App Store Connect.
5. Submit for review. First-time review usually takes 1-3 days.

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
