"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ShareOffscreenWrapper, SoulsInviteCard } from "@/components/ShareCard";
import { apiFetch } from "@/lib/api";
import BirthTimeFoldSheet from "@/components/BirthTimeFoldSheet";
import { recordSharingPermission } from "@/lib/saved-people-sync";
import { tx } from "@/lib/astro-i18n";
import { Wordmark } from "@/components/Wordmark";
import { BondCard } from "./BondCard";
import { SoulActions } from "./SoulActions";
import { PartnerPicker } from "./PartnerPicker";
import { PermissionSheet } from "./PermissionSheet";
import { AddPersonSheet } from "./AddPersonSheet";
import type { useSoulsState } from "../_hooks/useSoulsState";
import type { useSoulsPeople } from "../_hooks/useSoulsPeople";
import type { useSoulsBond } from "../_hooks/useSoulsBond";

export function renderSouls(pageCtx: ReturnType<typeof useSoulsState> & ReturnType<typeof useSoulsPeople> & ReturnType<typeof useSoulsBond>) {
  const {
    activeSoul, addPersonOpen, bondLens, bondPartners, confirmSavedBirthTime, connectedSouls,
    connectionCards, errorMessage, handleInviteResponse, handleInviteShare, handlePersonAdded,
    handlePersonRemove, handleSearch, handleSendInvite, inviteInfo, inviteSent, inviteShareRef,
    inviteSharing, lang, loadError, loading, myAvatar, myUsername, openSoloReading,
    partnerPickerOpen, pendingInvites, permissionAsk, readTheBond, readingBond, retryingLoad, router,
    savedFoldAsk, savedPeople, searchDone, searchFailed, searchOpen, searchQuery, searchResults,
    searching, sendingInvite, setActiveSoul, setAddPersonOpen, setBondLens, setBondPartners,
    setConnectedSouls, setLoadAttempt, setPartnerPickerOpen, setPeopleSyncNonce, setPermissionAsk,
    setRetryingLoad, setSavedFoldAsk, setSearchOpen, shareError, shareOk, t, token
  } = pageCtx;
  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* mundane's .head, the one the Mirror and Now already use: the mark
            on the left, the actions as 17px line glyphs on the right, one rule
            under it, then the small label line. The accent eyebrow and the
            centred title were a second and a third header on one screen. */}
        <div className="w-full max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
          <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
            <span className="flex items-center" style={{ marginRight: -8 }}>
              {shareOk && <button
                onClick={handleInviteShare}
                aria-label={t("souls.share_invitation")}
                title={t("souls.share_invitation")}
                disabled={inviteSharing}
                className="sol-ico disabled:opacity-50"
              >
                {inviteSharing ? (
                  <span
                    className="inline-block w-3 h-3 border-2 rounded-full animate-spin"
                    style={{ borderColor: "currentColor", borderTopColor: "transparent" }}
                  />
                ) : (
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10.5V16a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 16 16v-5.5" />
                    <path d="M13 5.5 10 2.5 7 5.5M10 2.5v10" />
                  </svg>
                )}
              </button>}
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {t("souls.your_field")}
          </p>
          {shareError && (
            <p role="status" className="font-body" style={{ fontSize: 13, marginTop: 8, color: "rgb(var(--rgb-text-muted))" }}>
              {t("common.share_failed")}
            </p>
          )}
        </div>

        <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-6 space-y-6 animate-fade-in">
          {/* The intro is prose, so it is set as prose: the Oracle's answer
              measurements, left, capped at 26em. It was a centred 900-weight
              block with its own divider, which read as a second headline. */}
          <p
            className="font-body"
            style={{ fontSize: 17, lineHeight: 1.62, color: "rgb(var(--rgb-text-secondary))", maxWidth: "26em", marginTop: 2 }}
          >
            {t("souls.intro")}
          </p>

          {loadError && (
            <div style={{ borderTop: "1px solid rgb(var(--rgb-border))", paddingTop: 16 }}>
              <p className="font-body" style={{ fontSize: 15, lineHeight: 1.55, color: "rgb(var(--rgb-ember))", marginBottom: 14 }}>
                {t("souls.error_field")}
              </p>
              <button
                onClick={() => { setRetryingLoad(true); setLoadAttempt((n) => n + 1); }}
                disabled={retryingLoad}
                className="w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase font-bold disabled:opacity-50"
                style={{ background: "transparent", color: "rgb(var(--rgb-text-secondary))", border: "1px solid rgb(var(--rgb-border))" }}
              >
                {retryingLoad ? t("common.loading") : t("common.retry")}
              </button>
            </div>
          )}

          {errorMessage && !loadError && (
            <p className="font-body" role="status" style={{ fontSize: 15, lineHeight: 1.55, color: "rgb(var(--rgb-ember))" }}>
              {errorMessage}
            </p>
          )}

          {/* Hero: Read the Bond */}
          <BondCard
            myName={myUsername || null}
            myAvatar={myAvatar}
            partners={bondPartners}
            lens={bondLens}
            onPickPartner={() => {
              if (savedPeople.length === 0 && connectedSouls.length === 0) {
                setAddPersonOpen(true);
              } else {
                setPartnerPickerOpen(true);
              }
            }}
            onRemovePartner={(i) => setBondPartners(prev => prev.filter((_, idx) => idx !== i))}
            onChangeLens={(l) => {
              setBondLens(l);
              // Trim to one person when leaving family
              if (l !== "family" && bondPartners.length > 1) {
                setBondPartners(prev => prev.slice(0, 1));
              }
            }}
            onRead={readTheBond}
            reading={readingBond}
          />


          {/* CONNECTIONS. mundane's .pair grid of .card.small, which is how it
              lays out a set of equal things:
                .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}
                .card.small{padding:14px 15px;border-radius:18px;display:flex;
                  flex-direction:column;gap:7px;align-items:flex-start;text-align:left}
                .card.small b{font-size:15.5px;font-weight:700;letter-spacing:-.015em}
                .card.small em{font-size:12px;color:var(--ink3)}
                .card .cdot{width:11px;height:11px;border-radius:50%;
                  border:1.5px solid rgba(34,32,28,.24);background:none}
              The people you are connected with and the people you have saved,
              one list. They were three separate sections with a search field
              and an invite card between them. */}
          {loading ? (
            <div className="flex justify-center pt-8">
              <LoadingSpinner size="md" />
            </div>
          ) : (
            <>
              {/* Requests still need an answer, so they stay above, quietly. */}
              {pendingInvites.length > 0 && (
                <div>
                  <p
                    className="font-body uppercase"
                    style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))", marginBottom: 10 }}
                  >
                    {t("souls.pending_requests")}
                  </p>
                  <div className="space-y-2">
                    {pendingInvites.map(invite => (
                      <div
                        key={invite.invite_id}
                        className="flex items-center gap-3"
                        style={{
                          background: "rgb(var(--rgb-card))",
                          border: "1px solid rgb(var(--rgb-border))",
                          borderRadius: 18,
                          padding: "12px 15px",
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-body text-text-primary truncate" style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em" }}>
                            {invite.requester.name}
                          </p>
                          <p className="font-body truncate" style={{ fontSize: 12, color: "rgb(var(--rgb-text-muted))", marginTop: 3 }}>
                            {invite.requester.sun_sign ? `☉ ${tx(invite.requester.sun_sign, lang)}` : t("souls.wants_to_connect")}
                          </p>
                        </div>
                        <button
                          onClick={() => handleInviteResponse(invite.invite_id, true)}
                          className="font-body shrink-0"
                          style={{
                            border: "1.5px solid rgb(var(--rgb-text-primary))", borderRadius: 999,
                            background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))",
                            fontSize: 13, fontWeight: 700, padding: "8px 16px",
                          }}
                        >
                          {t("souls.accept")}
                        </button>
                        <button
                          onClick={() => handleInviteResponse(invite.invite_id, false)}
                          aria-label={t("souls.decline")}
                          className="sol-ico shrink-0"
                          style={{ width: 28, height: 28 }}
                        >
                          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                            <path d="M5 5l10 10M15 5L5 15" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p
                  className="font-body uppercase"
                  style={{ fontSize: 11.5, letterSpacing: "0.2em", fontWeight: 700, color: "rgb(var(--rgb-text-muted))" }}
                >
                  {t("souls.connections")}
                </p>

                {connectionCards.length > 0 ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                    {connectionCards.map((c) => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={c.onOpen}
                        className="active:scale-[0.98] transition-transform"
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          textAlign: "left",
                          gap: 7,
                          padding: "14px 15px",
                          borderRadius: 18,
                          background: "rgb(var(--rgb-card))",
                          border: "1px solid rgb(var(--rgb-border))",
                          boxShadow: "0 8px 20px rgb(var(--rgb-scrim) / .06)",
                          minWidth: 0,
                        }}
                      >
                        {c.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={c.photo}
                            alt=""
                            style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }}
                          />
                        ) : (
                          <span
                            aria-hidden
                            style={{
                              width: 11, height: 11, borderRadius: "50%", boxSizing: "border-box", flex: "0 0 auto",
                              border: "1.5px solid rgb(var(--rgb-text-primary) / .24)",
                              background: c.connected ? "rgb(var(--rgb-amber))" : "none",
                              borderColor: c.connected ? "rgb(var(--rgb-amber))" : "rgb(var(--rgb-text-primary) / .24)",
                              marginTop: 5, marginBottom: 5,
                            }}
                          />
                        )}
                        <b
                          className="font-heading text-text-primary"
                          style={{
                            fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em",
                            display: "block", width: "100%", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {c.name}
                        </b>
                        <em
                          className="font-body"
                          style={{
                            fontStyle: "normal", fontSize: 12, color: "rgb(var(--rgb-text-muted))",
                            display: "block", width: "100%", overflow: "hidden",
                            textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}
                        >
                          {c.detail}
                        </em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-secondary))", marginTop: 12, maxWidth: "26em" }}>
                    {t("souls.no_connections")}
                  </p>
                )}

                {/* Finding someone new is an action, not a section with a title
                    and a field sitting open on the page. */}
                <button
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  className="font-body"
                  style={{
                    background: "none", border: "none", padding: "14px 0 0",
                    fontSize: 13, color: "rgb(var(--rgb-text-muted))",
                    textDecoration: "underline", textUnderlineOffset: 3,
                    textDecorationColor: "rgb(var(--rgb-text-primary) / .2)",
                  }}
                >
                  {t("souls.find_a_soul")}
                </button>

                {searchOpen && (
                  <div style={{ marginTop: 12 }}>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder={t("souls.search_placeholder")}
                      autoFocus
                      className="w-full font-body text-text-primary"
                      style={{
                        background: "rgb(var(--rgb-card))",
                        border: "1px solid rgb(var(--rgb-border))",
                        borderRadius: 18,
                        padding: "13px 15px",
                        fontSize: 15,
                      }}
                    />
                    {searching && (
                      <div className="pt-3 flex justify-center"><LoadingSpinner size="sm" /></div>
                    )}
                    {!searching && searchFailed && (
                      <p role="alert" className="font-body pt-3" style={{ fontSize: 14, color: "rgb(var(--rgb-ember))" }}>
                        {t("souls.search_failed")}
                      </p>
                    )}
                    {!searching && searchDone && !searchFailed && searchResults.length === 0 && (
                      <p className="font-body pt-3" style={{ fontSize: 14, color: "rgb(var(--rgb-text-muted))" }}>
                        {t("souls.no_users_found")}
                      </p>
                    )}
                    {searchResults.length > 0 && (
                      <div className="space-y-2" style={{ marginTop: 10 }}>
                        {searchResults.map(user => (
                          <div
                            key={user.id}
                            className="flex items-center gap-3"
                            style={{
                              background: "rgb(var(--rgb-card))",
                              border: "1px solid rgb(var(--rgb-border))",
                              borderRadius: 18,
                              padding: "12px 15px",
                            }}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-body text-text-primary truncate" style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-.015em" }}>
                                {user.name}
                              </p>
                              <p className="font-body truncate" style={{ fontSize: 12, color: "rgb(var(--rgb-text-muted))", marginTop: 3 }}>
                                {[user.sun_sign ? `☉ ${tx(user.sun_sign, lang)}` : null, user.username ? `@${user.username}` : null].filter(Boolean).join("  ·  ")}
                              </p>
                            </div>
                            <button
                              onClick={() => { if (!inviteSent.has(user.username)) handleSendInvite(user.username); }}
                              disabled={sendingInvite === user.username || inviteSent.has(user.username)}
                              className="font-body shrink-0 disabled:opacity-40"
                              style={{
                                border: "1.5px solid rgb(var(--rgb-text-primary))", borderRadius: 999,
                                background: "none", color: "rgb(var(--rgb-text-primary))",
                                fontSize: 13, fontWeight: 700, padding: "8px 16px",
                              }}
                            >
                              {sendingInvite === user.username
                                ? "…"
                                : inviteSent.has(user.username)
                                ? t("souls.sent")
                                : t("souls.connect")}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Soul action sheet */}
        {activeSoul && (
          <SoulActions
            soul={activeSoul}
            onClose={() => setActiveSoul(null)}
            onSoloReading={() => openSoloReading(activeSoul)}
            onViewProfile={() => {
              // The /profile/[id] page handles both public (full chart)
              // and private (name + photo only) cases via the
              // /users/:id/public-profile endpoint.
              router.push(`/profile/${activeSoul.soul.id}`);
              setActiveSoul(null);
            }}
            onRemove={async () => {
              const gone = activeSoul;
              await apiFetch(`/souls/${gone.connection_id}`, { method: "DELETE" }, token);
              // The server ends every connection row between the two of
              // you, so drop them all (either direction) from the list.
              setConnectedSouls((prev) => prev.filter(
                (c) => c.connection_id !== gone.connection_id && c.soul.id !== gone.soul.id,
              ));
              setBondPartners((prev) => prev.filter(
                (p) => !(p.kind === "connection" && p.connection.soul.id === gone.soul.id),
              ));
              setActiveSoul(null);
            }}
          />
        )}

        {/* Group session share sheet */}

        {/* Partner picker sheet */}
        {partnerPickerOpen && (
          <PartnerPicker
            savedPeople={savedPeople}
            connections={connectedSouls}
            onPick={(p) => {
              if (bondLens === "family") {
                // In family mode: add to the group (max 5 people + you = 6 total)
                setBondPartners(prev => prev.length < 5 ? [...prev, p] : prev);
              } else {
                setBondPartners([p]);
              }
              setPartnerPickerOpen(false);
            }}
            onAddNew={() => {
              setPartnerPickerOpen(false);
              setAddPersonOpen(true);
            }}
            onRemoveSaved={handlePersonRemove}
            onConfirmSaved={(p) => { setPartnerPickerOpen(false); void confirmSavedBirthTime(p); }}
            onClose={() => setPartnerPickerOpen(false)}
          />
        )}

        {/* Add-person sheet */}
        {permissionAsk && (
          <PermissionSheet
            people={permissionAsk}
            onCancel={() => setPermissionAsk(null)}
            onConfirm={() => {
              recordSharingPermission(permissionAsk.map((p) => p.id));
              setPermissionAsk(null);
              // People kept only on this device can now be saved to the account.
              setPeopleSyncNonce((n) => n + 1);
              void readTheBond();
            }}
          />
        )}

        {addPersonOpen && (
          <AddPersonSheet
            onClose={() => setAddPersonOpen(false)}
            onAdded={handlePersonAdded}
          />
        )}

        {savedFoldAsk && (
          <BirthTimeFoldSheet
            options={savedFoldAsk.options}
            body={t("souls.birth_check_body")}
            hint={t("souls.birth_check_hint")}
            onChoose={(f) => { savedFoldAsk.resolve(f); setSavedFoldAsk(null); }}
            onCancel={() => { savedFoldAsk.resolve(null); setSavedFoldAsk(null); }}
          />
        )}

      </div>

      {/* Off-screen Souls invite share card. Captured by html2canvas
          when the user taps the share icon in the SOULS header. The
          inviter name resolves to the auth context name first, then
          username as fallback, then a neutral "Someone" so the card
          never renders blank. */}
      <ShareOffscreenWrapper containerRef={inviteShareRef}>
        <SoulsInviteCard data={{ code: inviteInfo?.code }} />
      </ShareOffscreenWrapper>
    </ProtectedRoute>
  );
}
