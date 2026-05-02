# Capacitor iOS native build — runbook

End-to-end steps to take Solray from "JS code is ready" to "TestFlight
build with native microphone working." Designed to be followed in
order on a Mac. Ignore the "optional" sections on a first pass.

The frontend code (Capacitor config, native push wiring, native voice
plugin, JS bridges) is already on origin/main. Every step below
happens on the Mac and in Apple/Google portals — none of it can be
done from a sandbox.

Time estimate, first time: **2–4 hours** of focused work for a working
TestFlight build, plus 1–3 days waiting on Apple review for the App
Store push.

---

## 0. Prerequisites (one-time, ~20 min)

1. **Mac with Xcode** (16.x or newer from the Mac App Store).
2. **Apple Developer Program** membership ($99/yr). If you don't
   already have it, sign up at https://developer.apple.com/programs/.
   Apple takes a few hours to a day to provision your account; do
   this NOW so it's ready when you reach step 4.
3. **CocoaPods**: `sudo gem install cocoapods` then `pod --version`.
4. **Sign Xcode in to your Apple Developer account**: Xcode →
   Settings → Accounts → +.

---

## 1. Pull main and install (~5 min)

```bash
cd ~/.openclaw/workspace/solray-complete/solray-app
git pull origin main
npm install
```

This installs all the @capacitor/* packages, `capacitor-voice-recorder`,
and the rest. Takes 20–60s on a fresh clone, 5s on subsequent runs.

---

## 2. Add the iOS platform (~3 min, FIRST RUN ONLY)

```bash
npx cap add ios
```

This creates `solray-app/ios/`. Commit it after the first run:

```bash
git add ios
git commit -m "chore(ios): scaffold Capacitor iOS project"
git push
```

(`ios/` is large but committing is the right move — every future Mac
needs the exact same Xcode project state.)

---

## 3. Sync the web build into iOS (~30s)

```bash
npx cap sync ios
```

Runs every time you change `capacitor.config.ts` or add/remove a
plugin. Updates the `Pods/`, copies plugin Info.plist entries, etc.
You'll run this many times.

---

## 4. Microphone Info.plist entry (one-time, ~1 min)

iOS refuses any app that asks for the mic without declaring why.
Open the plist:

```bash
open ios/App/App/Info.plist
```

In Xcode, add a new row to the top-level dictionary:

| Key | Type | Value |
|---|---|---|
| `NSMicrophoneUsageDescription` | String | `Solray uses the microphone so you can speak with the Higher Self instead of typing.` |

Save. Commit:

```bash
git add ios/App/App/Info.plist
git commit -m "ios: declare microphone usage description"
git push
```

---

## 5. Open in Xcode (~30s)

```bash
npx cap open ios
```

Xcode launches with `App.xcworkspace` open. From here on, work in
Xcode + Apple's portals.

---

## 6. Configure signing (one-time, ~10 min)

In Xcode:

1. Select the **App** project in the file tree.
2. Select the **App** target in the targets pane.
3. Click the **Signing & Capabilities** tab.
4. Check **Automatically manage signing**.
5. **Team** dropdown → select your Apple Developer team.
6. **Bundle Identifier** should already be `ai.solray.app` from
   `capacitor.config.ts`. If it's not, change it.

Xcode will provision a development certificate the first time. If it
errors with "Failed to register bundle identifier," go to
https://developer.apple.com/account/resources/identifiers/list,
click +, App IDs, App, register `ai.solray.app`, then retry.

---

## 7. First test build on a real device (~5 min)

1. Plug an iPhone into your Mac.
2. Trust the computer if prompted on the phone.
3. iPhone → Settings → Privacy & Security → Developer Mode → On
   (iOS 16+).
4. In Xcode, top toolbar device picker → select your phone.
5. Cmd+R to build and run.

The app installs and opens. The first launch will:
- Show a brief Capacitor splash
- Load `https://app.solray.ai` inside the WebView
- Prompt for notification permission (if you go to a screen that
  triggers `registerNativePush`)

**Test the mic right now**:
1. Log in.
2. Open chat.
3. Tap the mic icon.
4. iOS shows: "Solray would like to access the microphone." Tap
   Allow.
5. Speak. The input shows "Listening…".
6. Tap mic again to stop. Transcription should appear in the input.

If the mic works in this build, **Phase 1 voice goal is met**. Move
to step 8.

If anything breaks, check Xcode's console output — it shows the
WebView's console logs including the `[solray-mic]` and
`[chat] native voice path failed` lines.

---

## 8. Push notifications setup (one-time, ~30 min)

If you don't need push for the first TestFlight, skip this and
return later. Otherwise:

1. Xcode → App target → Signing & Capabilities → + Capability →
   **Push Notifications** AND **Background Modes** (check Remote
   notifications).
2. Apple Developer portal → Certificates, Identifiers & Profiles →
   Keys → + → check Apple Push Notifications service (APNs) → name
   it "Solray APNs" → Continue → Register → Download the .p8 file
   ONCE (you can't re-download it). Note the Key ID and your Team
   ID.
3. The .p8 + Key ID + Team ID get configured wherever your push
   provider lives. We're sending pushes via direct APNs HTTP/2 from
   the backend. Add to Railway env vars on backend:
   - `APNS_KEY_P8` — the contents of the .p8 file (paste the full
     `-----BEGIN PRIVATE KEY-----` block as a multiline env var)
   - `APNS_KEY_ID` — the 10-character key ID
   - `APNS_TEAM_ID` — your Apple team ID
   - `APNS_BUNDLE_ID` — `ai.solray.app`
   - `APNS_PRODUCTION` — `false` for TestFlight, `true` for App
     Store builds (different APNs endpoints)

(The backend code that actually sends pushes via APNs isn't in this
runbook — that's a separate ticket for when you're ready. For now,
collecting tokens in `native_push_tokens` is the only goal.)

---

## 9. Archive for TestFlight (~10 min)

1. Xcode → top-bar device picker → **Any iOS Device (arm64)**.
2. Xcode menu → **Product** → **Archive**.
3. Build runs ~2–4 minutes.
4. Organizer window opens with the new archive.
5. Click **Distribute App** → **App Store Connect** → **Upload** →
   Next, Next, Upload.
6. Wait ~5–15 min for App Store Connect to finish processing the
   build.

---

## 10. App Store Connect setup (one-time, ~30 min)

If this is the first upload for `ai.solray.app`:

1. App Store Connect → My Apps → + → New App.
2. Platform: iOS. Name: Solray. Primary language: English.
   Bundle ID: `ai.solray.app`. SKU: `solray-001`. User access: Full.
3. Fill out App Information:
   - Privacy Policy URL: `https://solray.ai/legal#privacy`
   - Category: Lifestyle (primary), Health & Fitness (secondary)
   - Age rating: complete the questionnaire (mostly None)
4. Pricing & Availability → Free. The iOS app itself has no payment
   surface (see section 12 for compliance details); subscriptions
   happen on solray.ai in a browser.

---

## 11. TestFlight (~15 min after upload finishes)

1. App Store Connect → My Apps → Solray → TestFlight tab.
2. Wait for the build status to flip from "Processing" to "Ready
   to Submit." Click the build.
3. Fill out Test Information (single sentence is fine).
4. Compliance: select "No" for export compliance (we don't use
   custom encryption beyond standard HTTPS).
5. Add internal testers (your team's Apple ID emails).
6. Internal testers get a TestFlight email immediately. They install
   TestFlight from the App Store, accept the invite, and the build
   appears in TestFlight.

**Test the mic on TestFlight build** — should work the same as the
direct Xcode build.

---

## 12. iOS payment compliance (already wired in code; review before TestFlight)

Solray does NOT qualify for the Apple Reader App entitlement. The
Reader program is for apps whose primary functionality is reading
magazines, newspapers, books, audio, music, or video. Solray is a
generative subscription service (Higher Self chat, daily personalised
readings, charts), which Apple does not classify as "reader" content.

For v1.0 we ship the Spotify / Netflix / Audible / Kindle pattern:
the iOS app has no payment surface at all. New members subscribe on
solray.ai in a browser, then sign in on iOS. Apple permits this for
non-Reader subscription apps under 3.1.3(b) "Multiplatform Services"
as long as no in-app payment CTA exists.

Code in place to enforce this:

- `app/subscribe/page.tsx`: when `isRunningInCapacitor()` is true and
  the user has no subscription, renders `NativeMembershipView` (status
  text, sign out, continue to app). Hides Add payment method, Subscribe
  now, Rejoin Solray, Update payment method buttons across every state
  inside Capacitor. Cancel button stays.
- `components/TrialBanner.tsx`: suppressed entirely inside Capacitor so
  the "Add card" CTA never appears anywhere in the app.
- `capacitor.config.ts`: `securepay.borgun.is` and `securepay.teya.com`
  removed from `allowNavigation`. Even a leaked deep link cannot reach
  the Teya card entry page from inside the WebView.

What this means for users:

- Existing web subscribers: download the iOS app, sign in, full access. Zero friction.
- New iOS-first users: install, register, automatic 5-day trial with no card. After day 5 they hit the NativeMembershipView and learn membership is managed on the web.
- Cancel works inside the app on every platform.

Verify in TestFlight before public submission:

1. Sign in as an existing paid user. Confirm /today loads, chat works, /subscribe shows status (no payment buttons, Cancel visible).
2. Register a new user inside the app. Confirm trial starts. Confirm /subscribe shows NativeMembershipView (no "Begin your journey", no $23 price, no card entry).
3. Force-expire the trial via SQL on Railway. Confirm the app routes to /subscribe and renders NativeMembershipView with sign out and continue-to-app, no payment surface.
4. Walk every protected page (today, chat, chart, souls, profile). No on-page CTA should say "Subscribe" or "Add card" anywhere.

Future option (not v1.0): add Apple StoreKit IAP at $23/mo for new
iOS-first subscribers. Costs 30% on those subscriptions ($16.10 net),
web subscribers stay at full margin. Unlocks "subscribe in app" if
later data shows iOS-first signups losing meaningful conversion to
the web-detour. Worth doing only if iOS becomes a major acquisition
channel.

---

## 13. App Store submission (~30 min)

1. App Store Connect → Solray → App Store tab → + Version → 1.0.0.
2. Fill out:
   - **Description** (4000 chars, draft attached at end of this doc)
   - **Keywords** (100 chars: `astrology, human design, gene keys,
     birth chart, oracle, daily reading, spirituality, natal,
     compatibility, soul`)
   - **Screenshots** (at least 6.5" iPhone — 1284×2778. Take from
     a device running TestFlight build.)
   - **Promotional text** (170 chars, can update without resubmitting)
3. Build → select your TestFlight build.
4. Submit for Review.

First Apple review: 1–3 days. Often there's one round of feedback
(missing screenshot, copy issue, account login for review). Fix and
resubmit, second pass usually < 24 hours.

---

## 14. Android Play Store (parallel track, ~2 hours start to finish)

If you want Android too, do the equivalent in Android Studio:

```bash
npx cap add android
npx cap sync android
npx cap open android
```

Microphone permission for Android: `<uses-permission
android:name="android.permission.RECORD_AUDIO" />` in
`android/app/src/main/AndroidManifest.xml`. Capacitor's voice-recorder
plugin should add this automatically on the next `npx cap sync`.

Build → Generate Signed App Bundle. Upload to Google Play Console.
Review takes 1–3 days, much friendlier than Apple. 15% revenue cut
on first $1M/year.

---

## Mic verification checklist

After step 7 the mic should work. If it doesn't, in order:

1. Did the iOS permission sheet appear when you first tapped the mic?
   - **Yes**, you tapped Allow → recording should start.
   - **Yes**, you tapped Don't Allow → Settings → Solray → Microphone → On, then relaunch the app.
   - **No** sheet appeared → `NSMicrophoneUsageDescription` missing
     from Info.plist. Apple silently rejects mic access without it.
2. Recording starts but transcription never returns → check Railway
   logs for `[chat] /chat/transcribe` requests. Backend may be
   failing on the new audio MIME type (m4a/aac instead of webm).
3. Plugin missing from Xcode workspace → run `npx cap sync ios`
   again; the plugin's pod gets installed.

---

## App Store description (draft)

> Solray is your Higher Self, unlocked.
>
> Living astrology, Human Design, and Gene Keys, read together each
> morning by an AI that knows your exact chart. Every reading is
> grounded in your birth data — not a generic horoscope, but your
> own sky, spoken to.
>
> What's inside:
>
> • Daily personalised forecast — your transits, your energy, your
>   day. No two users get the same reading.
> • Higher Self chat — speak (or type) freely. The Oracle remembers
>   your context across sessions, learns who you are, holds the
>   thread of your life.
> • Soul connections — invite a friend, partner, or family member.
>   Read the dynamic between you with their full chart in view.
> • Five systems, one voice — Western astrology, Vedic asteroid
>   points, numerology, astrocartography, Human Design, and Gene
>   Keys. Synthesised, never name-dropped.
>
> Free for 5 days. After that, Solray is $23 a month. No ads, no
> trackers, no ceremony. Cancel from settings any time.
>
> Living by design.

(Trim to 4000 chars or expand with feature highlights — this is a
clean 800-char baseline that hits the asset description requirement
and reads as a person, not a marketing template.)

---

## When you're stuck

The two most common roadblocks for first-time iOS shippers:

1. **"No signing certificate found"** — your Apple Developer account
   isn't fully provisioned yet (takes a few hours after enrollment),
   or you didn't sign Xcode in to the right Apple ID. Re-check
   Xcode → Settings → Accounts.

2. **"App did not get past TestFlight processing"** — the upload
   succeeded but processing is stuck. Wait 30 minutes. If still
   stuck, archive again and re-upload; a stuck build never recovers
   on its own.

Send any error message back to Claude with the step number and
Claude will diagnose.
