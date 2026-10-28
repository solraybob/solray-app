"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { apiFetch } from "@/lib/api";
import { openAiConsentSheet } from "@/lib/ai-consent";
import LanguagePicker from "@/components/LanguagePicker";
import { setAnalyticsOptedOut } from "@/lib/analytics";
import BirthWheels from "@/components/BirthWheels";
import { PageHead, PageTitle, InkButton, HairlineButton } from "@/components/PageHead";
import BirthTimeFoldSheet from "@/components/BirthTimeFoldSheet";
import { Section, FieldRow, SaveButton, Toggle, ThemeButton, formatConsentDate } from "./settings-ui";
import type { useSettingsState } from "../_hooks/useSettingsState";
import type { useSettingsActions } from "../_hooks/useSettingsActions";

export function renderSettings(pageCtx: ReturnType<typeof useSettingsState> & ReturnType<typeof useSettingsActions>) {
  const {
    ageRestricted, aiConsent, aiError, aiStatus, aiWithdrawOpen, analyticsOff, birthCheck, birthCity,
    birthConfirmed, birthDate, birthError, birthStatus, birthTime, city, cityInputRef, cityListRef,
    confirmBirthFold, confirmClearMemory, deleteBusy, deleteError, deleteOpen, deletePassword,
    deleteStoreNote, foldAsk, handleDeleteAccount, handleSignOut, hiveConsent, hiveError, hiveStatus,
    identityError, identityStatus, initials, isPublic, lang, loadError, loading, logout,
    memoryClearOpen, memoryClearStatus, memoryError, memoryLoadFailed, memoryOn, memoryStatus, name,
    onPhotoSelected, photo, photoError, photoInputRef, photoStatus, pickCity, router, saveBirth,
    saveIdentity, setAiError, setAiWithdrawOpen, setAnalyticsOff, setBirthCity, setBirthDate,
    setBirthLat, setBirthLon, setBirthTime, setDeleteError, setDeleteOpen, setDeletePassword,
    setFoldAsk, setLoadAttempt, setMemoryClearOpen, setMemoryClearStatus, setMemoryError, setName,
    setTheme, setUsername, switchState, t, theme, toggleHiveConsent, toggleMemory, toggleVisibility,
    token, username, visibilityError, visibilityStatus, withdrawAiConsent
  } = pageCtx;
  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {foldAsk && (
          <BirthTimeFoldSheet
            options={foldAsk.options}
            onChoose={(f) => { foldAsk.resolve(f); setFoldAsk(null); }}
            onCancel={() => { foldAsk.resolve(null); setFoldAsk(null); }}
          />
        )}
        {/* Header: the one look. Back to the profile in the right slot. */}
        <PageHead
          label={t("profile.section_label")}
          right={
            <button
              onClick={() => router.push("/profile")}
              aria-label={t("settings.back_to_profile")}
              className="font-body uppercase font-bold flex items-center gap-1"
              style={{ fontSize: 12, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-secondary))", minHeight: 44 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
              {t("common.back")}
            </button>
          }
        />

        {loading ? (
          <div className="max-w-lg mx-auto px-5 pt-12">
            <div className="h-1 w-32 skeleton-shimmer rounded-full" />
          </div>
        ) : loadError ? (
          <div className="max-w-lg mx-auto px-5">
            <PageTitle title={t("settings.load_error_title")} sub={t("settings.load_error_body")} />
            <InkButton onClick={() => setLoadAttempt((n) => n + 1)}>{t("common.retry")}</InkButton>
          </div>
        ) : (
          <div className="max-w-lg mx-auto px-5 page-enter">
            <PageTitle title={t("common.settings")} />

            {/* ── 1. Avatar ──────────────────────────────────────────────── */}
            <Section
              label={t("settings.profile_photo")}
              status={photoStatus}
              hint={t("settings.profile_photo_hint")}
            >
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="relative shrink-0"
                  style={{ width: 72, height: 72 }}
                  aria-label={t("settings.change_photo")}
                >
                  {photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt={t("settings.photo_alt")}
                      className="w-full h-full rounded-full object-cover border border-forest-border"
                    />
                  ) : (
                    <div className="w-full h-full rounded-full border border-forest-border flex items-center justify-center font-heading text-text-primary" style={{ fontSize: 26, fontWeight: 900 }}>
                      {initials}
                    </div>
                  )}
                  <span
                    className="absolute -bottom-1 -right-1 rounded-full flex items-center justify-center"
                    style={{ width: 22, height: 22, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
                    aria-hidden
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                      <circle cx="12" cy="13" r="4"/>
                    </svg>
                  </span>
                </button>
                <div className="flex-1">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="font-body text-[15px] text-text-secondary hover:text-text-primary transition-colors underline underline-offset-4"
                  >
                    {photo ? t("settings.replace_photo") : t("settings.upload_photo")}
                  </button>
                </div>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    // Reset so picking the same file again retries.
                    e.target.value = "";
                    if (f) onPhotoSelected(f);
                  }}
                />
              </div>
              {photoError && (
                <p role="alert" className="font-body text-[14px] mt-3" style={{ color: "rgb(var(--rgb-ember))" }}>
                  {photoError}
                </p>
              )}
            </Section>

            {/* ── 2. Identity ───────────────────────────────────────────── */}
            <Section
              label={t("settings.identity")}
              status={identityStatus}
              error={identityError}
            >
              <div className="space-y-4">
                <FieldRow label={t("common.name")}>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                    placeholder={t("settings.name_placeholder")}
                  />
                </FieldRow>
                <FieldRow label={t("common.username")}>
                  <div className="flex items-baseline gap-1">
                    <span className="font-body text-[17px] text-text-secondary">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/^@/, ""))}
                      className="flex-1 font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                      placeholder={t("settings.username_placeholder")}
                      autoCapitalize="none"
                      autoCorrect="off"
                    />
                  </div>
                </FieldRow>
                <div className="flex justify-end pt-2">
                  <SaveButton onClick={saveIdentity} status={identityStatus} />
                </div>
              </div>
            </Section>

            {/* ── 3. Visibility ─────────────────────────────────────────── */}
            <Section
              label={t("settings.profile_visibility")}
              status={visibilityStatus}
              error={visibilityError}
              hint={isPublic
                ? t("settings.visibility_public_hint")
                : t("settings.visibility_private_hint")}
            >
              {/* One fixed label, and the switch is on when the profile is
                  private: on = Private, so what the switch shows and what
                  the label says always agree. */}
              <Toggle
                label={t("settings.private_switch")}
                checked={!isPublic}
                onChange={(priv) => toggleVisibility(!priv)}
                disabled={visibilityStatus === "saving"}
                srLabel={isPublic ? t("settings.private_state_off") : t("settings.private_state_on")}
              />
            </Section>

            {/* ── 4. Theme ──────────────────────────────────────────────── */}
            <Section
              label={t("settings.theme")}
              hint={theme === "light"
                ? t("settings.theme_light_hint")
                : t("settings.theme_dark_hint")}
            >
              <div className="flex gap-2">
                <ThemeButton active={theme === "dark"}  onClick={() => setTheme("dark")}  label={t("settings.theme_dark")}  />
                <ThemeButton active={theme === "light"} onClick={() => setTheme("light")} label={t("settings.theme_light")} />
              </div>
            </Section>

            {/* ── 4a. Language ─────────────────────────────────────────── */}
            <Section
              label={t("settings.language_section")}
              hint={t("settings.language_hint")}
            >
              <LanguagePicker layout="list" />
            </Section>

            {/* ── 4b. Analytics privacy ────────────────────────────────── */}
            <Section
              label={t("settings.analytics")}
              hint={analyticsOff
                ? t("settings.analytics_off_hint")
                : t("settings.analytics_on_hint")}
            >
              <Toggle
                label={analyticsOff ? t("common.off") : t("common.on")}
                srLabel={switchState(t("settings.analytics"), !analyticsOff)}
                checked={!analyticsOff}
                onChange={async (next) => {
                  // next=true means analytics is ON, opt-out is FALSE
                  const optOut = !next;
                  setAnalyticsOff(optOut);
                  setAnalyticsOptedOut(optOut);
                  // Mirror to the server so the flag persists across devices
                  if (token) {
                    try {
                      await apiFetch("/users/analytics-opt-out", {
                        method: "PATCH",
                        body: JSON.stringify({ opt_out: optOut }),
                      }, token);
                    } catch {
                      // Local flag is the immediate authority; server sync
                      // is best-effort. If it fails, the user's choice on
                      // this device still holds.
                    }
                  }
                }}
              />
            </Section>

            {/* ── 4c. The Collective ───────────────────────────────────── */}
            <Section
              label={t("settings.collective")}
              status={hiveStatus}
              error={hiveError}
              hint={hiveConsent
                ? t("settings.collective_on_hint")
                : t("settings.collective_off_hint")}
            >
              <Toggle
                label={hiveConsent ? t("common.on") : t("common.off")}
                srLabel={switchState(t("settings.collective"), hiveConsent)}
                checked={hiveConsent}
                onChange={toggleHiveConsent}
                disabled={hiveStatus === "saving"}
              />
            </Section>

            {/* ── 4d. Third-party AI ───────────────────────────────────── */}
            <Section
              label={t("settings.ai_consent_section")}
              status={aiStatus}
              error={aiError}
              hint={ageRestricted ? undefined : aiConsent.version && !aiConsent.required
                ? t("settings.ai_consent_on_hint")
                : t("settings.ai_consent_off_hint")}
            >
              {ageRestricted ? (
                <p className="font-body" style={{ fontSize: 16, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                  {t("settings.ai_consent_age_restricted")}
                </p>
              ) : (
              <div className="space-y-3">
                <p className="font-body text-[17px] text-text-primary">
                  {aiConsent.version && !aiConsent.required
                    ? (aiConsent.at
                        ? t("settings.ai_consent_given_on").replace("{date}", formatConsentDate(aiConsent.at, lang))
                        : t("settings.ai_consent_given"))
                    : t("settings.ai_consent_not_given")}
                </p>
                {aiConsent.version && !aiConsent.required ? (
                  !aiWithdrawOpen ? (
                    <HairlineButton onClick={() => { setAiWithdrawOpen(true); setAiError(null); }}>
                      {t("settings.ai_consent_withdraw")}
                    </HairlineButton>
                  ) : (
                    <div className="space-y-3">
                      <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                        {t("settings.ai_consent_withdraw_body")}
                      </p>
                      <HairlineButton
                        onClick={withdrawAiConsent}
                        loading={aiStatus === "saving"}
                        style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                      >
                        {t("settings.ai_consent_withdraw_confirm")}
                      </HairlineButton>
                      <HairlineButton onClick={() => setAiWithdrawOpen(false)} disabled={aiStatus === "saving"}>
                        {t("common.cancel")}
                      </HairlineButton>
                    </div>
                  )
                ) : (
                  <HairlineButton onClick={() => openAiConsentSheet()}>
                    {t("settings.ai_consent_give")}
                  </HairlineButton>
                )}
              </div>
              )}
            </Section>

            {/* ── 4e. Memory ───────────────────────────────────────────── */}
            <Section
              label={t("settings.memory_section")}
              status={memoryStatus}
              error={memoryError}
            >
              <div className="space-y-4">
                <div>
                  <Toggle
                    label={memoryOn ? t("common.on") : t("common.off")}
                    srLabel={memoryOn === null ? undefined : switchState(t("settings.memory_section"), memoryOn)}
                    checked={memoryOn === true}
                    onChange={toggleMemory}
                    disabled={memoryOn === null || memoryStatus === "saving"}
                  />
                  {/* What the switch does sits right under it; clearing
                      memory is a separate action that follows. */}
                  {!memoryError && (memoryOn !== null || memoryLoadFailed) && (
                    <p className="mt-3 font-body text-[15px] leading-relaxed text-text-muted">
                      {memoryOn === null
                        ? t("settings.memory_load_failed")
                        : memoryOn ? t("settings.memory_on_hint") : t("settings.memory_off_hint")}
                    </p>
                  )}
                </div>
                <div className="space-y-3" style={{ paddingTop: 12, borderTop: "1px solid rgb(var(--rgb-border) / 0.6)" }}>
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                    {memoryClearStatus === "saved" ? t("settings.memory_cleared") : t("settings.memory_clear_hint")}
                  </p>
                  {memoryClearOpen ? (
                    <div className="space-y-3">
                      <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                        {t("settings.memory_clear_body")}
                      </p>
                      <HairlineButton
                        onClick={confirmClearMemory}
                        loading={memoryClearStatus === "saving"}
                        style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                      >
                        {t("settings.memory_clear_confirm")}
                      </HairlineButton>
                      <HairlineButton onClick={() => setMemoryClearOpen(false)} disabled={memoryClearStatus === "saving"}>
                        {t("common.cancel")}
                      </HairlineButton>
                    </div>
                  ) : (
                    <HairlineButton onClick={() => { setMemoryClearOpen(true); setMemoryClearStatus("idle"); setMemoryError(null); }}>
                      {t("settings.memory_clear")}
                    </HairlineButton>
                  )}
                </div>
              </div>
            </Section>

            {/* ── 5. Birth details ─────────────────────────────────────── */}
            <Section
              label={t("settings.birth_details")}
              status={birthStatus}
              error={birthError}
              hint={t("settings.birth_details_hint")}
            >
              <div className="space-y-4">
                {/* Saved birth time on a clock-change night: asked once. */}
                {birthCheck.needsConfirmation && birthCheck.status === "ambiguous" && (
                  <div className="space-y-3" id="birth-confirm">
                    <p className="font-body" style={{ fontSize: 16, lineHeight: 1.6, color: "rgb(var(--rgb-text-primary))" }}>
                      {t("birth_check.settings_ambiguous")}
                    </p>
                    <HairlineButton onClick={() => { void confirmBirthFold(); }} disabled={birthStatus === "saving"}>
                      {t("birth_check.settings_choose")}
                    </HairlineButton>
                  </div>
                )}
                {birthCheck.needsConfirmation && birthCheck.status === "nonexistent" && (
                  <p id="birth-confirm" className="font-body" style={{ fontSize: 16, lineHeight: 1.6, color: "rgb(var(--rgb-text-primary))" }}>
                    {t("birth_check.settings_nonexistent")}
                  </p>
                )}
                {birthConfirmed && !birthCheck.needsConfirmation && (
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                    {t("birth_check.confirmed")}
                  </p>
                )}
                {/* The birth moment as one instrument, mundane's wheel.
                    Two native pickers made a birth into two unrelated form
                    fields, and on a phone each one opened a modal of its own. */}
                <BirthWheels
                  date={birthDate}
                  time={birthTime}
                  onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
                />
                <FieldRow label={t("common.city")}>
                  <div className="relative">
                    <input
                      ref={cityInputRef}
                      value={birthCity}
                      onChange={(e) => {
                        setBirthCity(e.target.value);
                        setBirthLat(null);
                        setBirthLon(null);
                      }}
                      onKeyDown={(e) => { city.onKeyDown(e, pickCity); }}
                      onFocus={() => birthCity.length >= 2 && city.setOpen(city.suggestions.length > 0)}
                      role="combobox"
                      aria-autocomplete="list"
                      aria-expanded={city.open && city.suggestions.length > 0}
                      aria-controls="settings-city-list"
                      aria-activedescendant={city.active >= 0 ? `settings-city-${city.active}` : undefined}
                      className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                      placeholder={t("settings.city_placeholder")}
                      autoCapitalize="words"
                    />
                    {city.loading && (
                      <span className="absolute right-1 top-1 text-[14px] text-text-muted">{t("settings.searching")}</span>
                    )}
                    {city.open && city.suggestions.length > 0 && (
                      <div
                        ref={cityListRef}
                        role="listbox"
                        id="settings-city-list"
                        className="absolute left-0 right-0 mt-1 bg-forest-card border border-forest-border rounded-xl overflow-hidden z-10 shadow-xl"
                      >
                        {city.suggestions.map((s, i) => (
                          <button
                            key={s.display}
                            id={`settings-city-${i}`}
                            type="button"
                            role="option"
                            aria-selected={i === city.active}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickCity(s)}
                            className={`block w-full text-left px-3 py-2 font-body text-[17px] text-text-primary hover:bg-forest-border/40 transition-colors${i === city.active ? " bg-forest-border/40" : ""}`}
                            style={{ minHeight: 44 }}
                          >
                            {s.display}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </FieldRow>
                <div className="flex justify-end pt-2">
                  <SaveButton onClick={saveBirth} status={birthStatus} />
                </div>
              </div>
            </Section>

            {/* ── 6. Subscription ──────────────────────────────────────── */}
            <Section label={t("settings.subscription")} hint={t("settings.subscription_hint")}>
              <button
                onClick={() => router.push("/subscribe")}
                className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                style={{ color: "rgb(var(--rgb-text-primary))" }}
              >
                {t("common.manage_subscription")}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </Section>

            {/* ── 6a. Legal and support ───────────────────────────────────
                App Review looks for the privacy policy and a support route
                inside the app. These open in the system browser on native
                (solray.ai is deliberately outside the WebView allow-list). */}
            <Section label={t("settings.legal_section")}>
              <div className="space-y-3">
                <a
                  href="https://solray.ai/legal"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.terms_privacy")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
                <a
                  href="https://solray.ai/support"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.support")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
                <a
                  href="https://solray.ai/account-deletion"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-body text-[17px] font-medium hover:opacity-80 transition-opacity flex items-center gap-2"
                  style={{ color: "rgb(var(--rgb-text-primary))" }}
                >
                  {t("settings.deletion_info")}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </a>
              </div>
            </Section>

            {/* ── 7. Sign out ──────────────────────────────────────────── */}
            <div className="py-6">
              <HairlineButton onClick={handleSignOut}>{t("common.sign_out")}</HairlineButton>
            </div>

            {/* ── 8. Delete account ────────────────────────────────────── */}
            <Section label={t("settings.delete_section")} hint={deleteOpen ? undefined : t("settings.delete_hint")}>
              {deleteStoreNote ? (
                <div className="space-y-4">
                  <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>
                    {t("settings.delete_done_store")}
                  </p>
                  <HairlineButton onClick={() => { logout(); router.replace("/login"); }}>
                    {t("common.done")}
                  </HairlineButton>
                </div>
              ) : !deleteOpen ? (
                <HairlineButton
                  onClick={() => { setDeleteOpen(true); setDeletePassword(""); setDeleteError(null); }}
                  style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                >
                  {t("settings.delete_button")}
                </HairlineButton>
              ) : (
                <div className="space-y-4">
                  <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-primary))" }}>
                    {t("settings.delete_confirm_body")}
                  </p>
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))" }}>
                    {t("settings.delete_password_prompt")}
                  </p>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(null); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDeleteAccount(); }}
                    placeholder={t("settings.delete_password_placeholder")}
                    autoComplete="current-password"
                    aria-label={t("settings.delete_password_prompt")}
                    className="w-full font-body text-[17px] text-text-primary bg-transparent border-b border-forest-border/60 focus:border-text-primary pb-1.5 transition-colors"
                  />
                  {deleteError && (
                    <p role="alert" className="font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-ember))" }}>{deleteError}</p>
                  )}
                  <HairlineButton
                    onClick={handleDeleteAccount}
                    loading={deleteBusy}
                    disabled={!deletePassword}
                    style={{ color: "rgb(var(--rgb-ember))", borderColor: "rgb(var(--rgb-ember) / .5)" }}
                  >
                    {t("settings.delete_confirm_button")}
                  </HairlineButton>
                  <HairlineButton onClick={() => { setDeleteOpen(false); setDeletePassword(""); setDeleteError(null); }} disabled={deleteBusy}>
                    {t("common.cancel")}
                  </HairlineButton>
                </div>
              )}
            </Section>

          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
