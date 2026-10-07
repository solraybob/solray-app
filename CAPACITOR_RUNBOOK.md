# Capacitor iOS build: runbook

How to go from this repo to an App Store build of the Solray iOS shell.
Written for build 11 (version 1.0.1, October 2026). Follow it in order on
the Mac. Nothing here can be done from a sandbox.

The iOS project already exists in `ios/` and is committed. Never run
`npx cap add ios` again: it would recreate the project and throw away the
signing, entitlements, privacy manifest and build settings.

What the shell is: a Capacitor 6.2.2 app that loads `https://app.solray.ai`
in a WebView (see `capacitor.config.ts`). Web fixes reach members on the
next launch without a store build. A store build is needed only for native
changes: `capacitor.config.ts`, plugins, Swift, Info.plist, entitlements,
icons, splash, privacy manifest.

---

## 0. Prerequisites

1. **Xcode 26 or newer, building with the iOS 26 SDK or newer.** Apple
   rejects uploads built with older SDKs. Check: Xcode, About Xcode, and
   `xcodebuild -showsdks` lists iphoneos26.x.
2. Apple Developer Program membership for Bobby ehf. (team `P59RJ93DU3`),
   signed in to Xcode: Xcode, Settings, Accounts.
3. CocoaPods (`sudo gem install cocoapods`, then `pod --version`).
4. Node 18 or newer (Capacitor 6).

---

## 1. Pull and install

```bash
cd ~/.openclaw/workspace/solray-complete/solray-app
git pull
npm install
```

Confirm Capacitor is 6.2.2 (6.2.1 has the remote-content-at-app-origin
flaw):

```bash
npx cap --version            # 6.2.2
npm ls @capacitor/ios @capacitor/core
```

---

## 2. Sync the native project

```bash
npx cap sync ios
```

This regenerates `ios/App/App/capacitor.config.json` and `config.xml`,
copies `public/` (the offline page), and runs `pod install`, which moves
the pods to Capacitor 6.2.2. The committed `ios/App/Podfile.lock` still
says `Capacitor (6.2.1)` and `CapacitorCordova (6.2.1)` (pod install cannot
run outside a Mac). Required before archiving: after the sync,
`grep -E "Capacitor(Cordova)? \(" ios/App/Podfile.lock` must show 6.2.2 for
both, then commit the updated `ios/App/Podfile.lock`. Do not archive while
it says 6.2.1.

`./RUN_IOS_BUILD.sh` does steps 1 and 2 plus the version checks below and
opens Xcode. It never commits or pushes.

---

## 3. Open in Xcode and check the target

```bash
npx cap open ios
```

App target, General and Build Settings:

- Bundle identifier `ai.solray.app`
- Version (MARKETING_VERSION) `1.0.1`, Build (CURRENT_PROJECT_VERSION) `11`
  in both Debug and Release
- iPhone only (TARGETED_DEVICE_FAMILY 1), iPhone orientation Portrait only
- Code Signing Entitlements: Debug `App/App.entitlements`
  (`aps-environment` development), Release `App/AppRelease.entitlements`
  (`aps-environment` production)
- `PrivacyInfo.xcprivacy` is in the App group and in Build Phases, Copy
  Bundle Resources

---

## 4. Push Notifications capability and profiles

1. developer.apple.com, Certificates, Identifiers & Profiles,
   Identifiers, `ai.solray.app`: tick **Push Notifications**, Save.
2. Profiles: edit **Solray App Store** (App Store distribution profile
   used by the Release config), Save, Download, double-click to install.
   The profile must be regenerated after enabling push or the archive
   will fail with an `aps-environment` entitlement mismatch.
3. In Xcode, Signing & Capabilities: Debug uses automatic signing and
   should show the Push Notifications capability; Release uses the
   manual **Solray App Store** profile. If Xcode says the profile does
   not include the push entitlement, download profiles again (Settings,
   Accounts, Download Manual Profiles).
4. Do NOT add Background Modes / Remote notifications. The daily push is
   an ordinary alert; background mode is not needed and invites review
   questions.

The APNs key (.p8) is already configured on Railway. Backend variables,
read by `solray-ai/ai/push_apns.py`:

| Variable | Value |
|---|---|
| `APNS_AUTH_KEY` | full contents of `AuthKey_XXXXXXXXXX.p8`, including the BEGIN and END lines (multiline, or with `\n` escapes) |
| `APNS_KEY_ID` | the 10 character Key ID |
| `APNS_TEAM_ID` | `P59RJ93DU3` |
| `APNS_BUNDLE_ID` | `ai.solray.app` |
| `APNS_HOST` | leave unset for production (`https://api.push.apple.com`) |

APNs environments:

- **TestFlight and App Store builds use PRODUCTION APNs.** The production
  backend must stay on the default host.
- Only a build run from Xcode onto a device with development signing
  gets a sandbox token. Test those against a separate backend with
  `APNS_HOST=https://api.sandbox.push.apple.com`. If a sandbox token
  reaches production, APNs answers `BadDeviceToken` and the backend
  deletes that token row by itself.

---

## 5. Device test (development build)

1. Plug in an iPhone, Developer Mode on, select it in Xcode, Cmd+R.
2. Sign in. There should be NO notification prompt at sign-up.
3. Get one Oracle reply in chat, then open Today. After a couple of
   seconds a short sheet offers the daily note. Tap Yes, then Allow.
4. Check the backend has the row (one row per device token):
   `SELECT user_id, platform, updated_at FROM native_push_tokens ORDER BY updated_at DESC LIMIT 5;`
5. Sign out: the row for that token disappears. Sign in as another
   account on the same phone: the token now belongs to that account only.
6. Mic: chat, mic icon, Allow, speak, stop, transcription appears.
7. Camera and photo picker for the profile photo: Allow and Deny paths.
8. Rotate the phone: the app stays portrait.

Sending a test push needs the sandbox backend from step 4.

---

## 6. Archive and upload build 11

1. Device picker: **Any iOS Device (arm64)**. Scheme configuration Release.
2. Product, Archive.
3. Organizer, select the archive, **Generate Privacy Report**. Every
   entry should match `ios/App/App/PrivacyInfo.xcprivacy` and the App
   Store Connect privacy labels (section 9). If the report shows a
   required-reason API from a pod with no reason, find which pod uses it
   and declare the real reason; never add a guessed one.
4. Distribute App, App Store Connect, Upload. Let Xcode manage the
   version only if it does not change 1.0.1 (11).
5. Inspect the uploaded build's entitlements in the Organizer
   (`aps-environment` = production).

---

## 7. TestFlight

1. App Store Connect, Solray, TestFlight: wait for build 11 to finish
   processing.
2. Export compliance: the Info.plist already says no non-exempt
   encryption.
3. Install on a phone through TestFlight and repeat section 5 (push now
   uses PRODUCTION APNs, so the production backend can deliver to it).
4. An APNs 200 in the backend log means Apple accepted the push, not that
   the phone showed it. Check the lock screen, the banner in the
   foreground, and that tapping opens Today from a cold start.

---

## 8. Payments in the iOS app

The iOS app sells the membership through **Apple In-App Purchase**
(cordova-plugin-purchase, `lib/play-billing.ts`). There is no Reader App
entitlement and no link out to web payment.

- Products: `solray_monthly` and `solray_yearly`, auto-renewing
  subscriptions in App Store Connect. Prices and the free trial are set
  there, not in this repo.
- `/subscribe` in the native shell shows the store prices and a Subscribe
  button that opens the Apple sheet, plus Restore Purchases.
- The app posts the transaction to `POST /subscribe/apple-verify`; the
  backend verifies it with Apple and grants access. Sandbox purchases are
  accepted for App Review (keep this until the app is approved).
- Card payments (Teya) exist only on the web at solray.ai. Teya hosts are
  not in `allowNavigation`, and the native paywall shows no card option.

Verify on TestFlight with a Sandbox Apple ID: buy monthly, buy yearly,
cancel the sheet, restore on a fresh install, relaunch, and confirm
access survives.

---

## 9. App Store Connect: privacy labels and submission

Privacy labels must agree with `PrivacyInfo.xcprivacy` and
https://solray.ai/legal. Data the app collects, none of it used for
tracking:

| Data | Linked to member | Purpose |
|---|---|---|
| Email address, Name, User ID | yes | App functionality |
| Device ID (push token) | yes | App functionality |
| Photos (optional profile photo) | yes | App functionality |
| Audio (voice messages for transcription) | yes | App functionality |
| Other user content (birth data, chat) | yes | App functionality |
| Purchase history | yes | App functionality |
| Product interaction (first-party events) | yes | Analytics |
| Crash data, Performance data (Sentry) | no | App functionality |

Submission:

1. App Store tab, version 1.0.1, select build 11.
2. Screenshots taken from this build. Do not mention widgets or Live
   Activities (there are none).
3. Review notes: a working review account, the short path through the
   personal chart, the daily reading, the Oracle chat and Souls
   compatibility, what changed since the last rejection, and both
   subscription product ids.
4. Keep the backend up for the whole review.

---

## 10. Android

Not part of build 11. Push is switched off on Android in the web app
until an FCM sender exists on the backend (no prompt, no registration).
Play requires API 36 for updates, which means the Capacitor 8 upgrade
(see the store checklist in the audit, out-6 section F). Do not change
`targetSdkVersion` on its own.

---

## Mic checklist

1. No permission sheet when tapping the mic: `NSMicrophoneUsageDescription`
   is missing from Info.plist (it is present as of build 10).
2. Records but no transcription: check Railway logs for `/chat/transcribe`.
3. Plugin missing: `npx cap sync ios`, then build again.

---

## App Store description (draft)

> Solray is your Higher Self, unlocked.
>
> Living astrology, Human Design, and Gene Keys, read together by an AI
> that knows your exact chart. Every reading is grounded in your birth
> data: not a generic horoscope, but your own sky, spoken to.
>
> What's inside:
>
> - A daily reading for your transits, your energy, your day.
> - Higher Self chat. Speak or type freely. The Oracle remembers your
>   context and holds the thread of your life.
> - Soul connections. Read the dynamic between you and someone close,
>   with both charts in view.
>
> Start with a free trial, then a monthly or yearly membership through
> the App Store. No ads. Cancel any time in your Apple ID settings.
>
> Living by design.

---

## When you're stuck

- "Provisioning profile doesn't include the aps-environment
  entitlement": regenerate **Solray App Store** after enabling push
  (section 4).
- ITMS-91053 (missing API declaration): open the privacy report from the
  archive and declare the real reason for the API it names.
- Upload rejected for SDK version: you are not on Xcode 26 / iOS 26 SDK.
