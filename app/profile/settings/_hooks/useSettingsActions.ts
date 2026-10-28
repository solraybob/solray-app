"use client";

import { memberErrorText } from "@/lib/member-error";
import { beginUnfinishedWork, registerUnfinishedWork } from "@/lib/draft-guard";
import { useEffect, useRef, useState } from "react";
import { apiFetch, ApiError, isUnderMinimumAgeError } from "@/lib/api";
import { clearChartDerivedCaches, syncBirthRevision } from "@/lib/chart-revision";
import { captureAccount, isStaleAccountError, type AccountGuard } from "@/lib/account-session";
import { sendBirthRequest, storedBirthTimeCheck, type BirthFold, type FoldChoice } from "@/lib/birth-time-fold";
import { accountKey } from "@/lib/account-session";
import type { useSettingsState } from "./useSettingsState";

export function useSettingsActions(pageCtx: ReturnType<typeof useSettingsState>) {
  const {
    birthCheck, birthCity, birthDate, birthLat, birthLon, birthStatus, birthTime, deleteBusy,
    deletePassword, loading, logout, name, photo, router, savedBirthRef, setBirthCheck,
    setBirthConfirmed, setBirthError, setBirthStatus, setDeleteBusy, setDeleteError,
    setDeletePassword, setDeleteStoreNote, setPhoto, setPhotoError, setPhotoStatus, t, token
  } = pageCtx;
  const onPhotoSelected = async (file: File) => {
    if (!token) return;
    // The account this photo belongs to, captured as it is chosen: reading
    // and decoding take time, and the account may change meanwhile. Then
    // nothing is sent, shown or cached (Codex out12-5 #3).
    const acct = captureAccount();
    // Reading and resizing the photo is not a request yet: the update
    // reload waits for it until the upload ends (lib/draft-guard).
    const done = beginUnfinishedWork();
    setPhotoStatus("saving");
    setPhotoError(null);
    const prevPhoto = photo;
    // Any failure (unreadable file, undecodable image, upload error) clears
    // the saving state and leaves a retryable message.
    const failPhoto = () => {
      done();
      if (!acct.live) return;
      setPhoto(prevPhoto);
      setPhotoStatus("error");
      setPhotoError(t("settings.photo_failed"));
      setTimeout(() => setPhotoStatus("idle"), 2200);
    };
    // Resize to 384x384 JPEG ~80q before upload, matches the existing
    // /users/photo size budget (under 2MB) and keeps avatars crisp on retina.
    const reader = new FileReader();
    reader.onerror = failPhoto;
    reader.onabort = failPhoto;
    reader.onload = () => {
      if (!acct.live) { done(); return; }
      const img = new Image();
      img.onerror = failPhoto;
      img.onload = async () => {
        if (!acct.live) { done(); return; }
        try {
          const canvas = document.createElement("canvas");
          const SIZE = 384;
          canvas.width = SIZE;
          canvas.height = SIZE;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Canvas context unavailable");
          // Cover-style crop (square center)
          const min = Math.min(img.width, img.height);
          const sx = (img.width - min) / 2;
          const sy = (img.height - min) / 2;
          ctx.drawImage(img, sx, sy, min, min, 0, 0, SIZE, SIZE);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          setPhoto(dataUrl);
          await apiFetch("/users/photo", {
            method: "PATCH",
            body: JSON.stringify({ photo: dataUrl }),
          }, token, { generation: acct.generation });
          // Signed out (or another account) while it was on its way: this
          // photo belongs to nobody on this device now.
          if (!acct.live) { done(); return; }
          // Sync to local cache so profile page picks it up immediately
          try {
            localStorage.setItem(accountKey("solray_avatar"), dataUrl);
            const cached = localStorage.getItem(accountKey("solray_blueprint"));
            if (cached) {
              const bp = JSON.parse(cached);
              bp._profile_photo = dataUrl;
              localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify(bp));
            }
          } catch {}
          done();
          setPhotoStatus("saved");
          setTimeout(() => setPhotoStatus("idle"), 1800);
        } catch (err) {
          done();
          if (isStaleAccountError(err) || !acct.live) return;
          failPhoto();
        }
      };
      img.src = reader.result as string;
    };
    try {
      reader.readAsDataURL(file);
    } catch {
      failPhoto();
    }
  };

  // The "which one was it" question for a birth time that happened twice.
  const [foldAsk, setFoldAsk] = useState<{ options: FoldChoice[]; resolve: (f: BirthFold | null) => void } | null>(null);
  // A birth-time question open mid-save: the update reload waits for the
  // member's answer (lib/draft-guard).
  const foldOpenRef = useRef(false);
  foldOpenRef.current = foldAsk !== null;
  useEffect(() => registerUnfinishedWork(() => foldOpenRef.current), []);
  const askFold = (options: FoldChoice[]) =>
    new Promise<BirthFold | null>((resolve) => setFoldAsk({ options, resolve }));

  // After a successful PATCH /users/birth: drop every chart-derived cache,
  // refresh the local blueprint cache, and take the new clock-change check
  // and saved birth details from the server.
  //
  // `acct` is the account the save was made under. The member may sign out
  // (and another sign in) while the PATCH or /users/me is on its way; then
  // this throws StaleAccountError before touching anything the next account
  // reads, so A's chart can never land in B's blueprint cache.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storeBirthResult = async (res: any, acct: AccountGuard) => {
    acct.check();
    // Every chart computed from the old birth details is now wrong:
    // astrocartography, cycles, forecasts, the week, compatibility.
    clearChartDerivedCaches();
    // Refresh the local blueprint cache from authoritative server data.
    // We DO NOT inject local React state (name/username/photo) here , 
    // an earlier draft did, and it could overwrite the cached identity
    // fields with unsaved form input.
    //
    // Order of preference for the identity fields:
    //   1. Fresh /users/me response (best, known committed values)
    //   2. Whatever was in the previous cache (preserves last-known-good
    //      when /users/me fails on a network blip)
    //   3. Empty (only when there's no cache and no network response , 
    //      effectively the "first save ever" path)
    //
    // The blueprint payload itself ALWAYS gets written; that's the whole
    // point of the call and is authoritative regardless.
    try {
      if (res?.blueprint) {
        // Offline is fine (the previous cache keeps the identity fields);
        // a changed account is not.
        const me = await apiFetch("/users/me", {}, token, { generation: acct.generation }).catch((e: unknown) => {
          if (isStaleAccountError(e)) throw e;
          return null;
        });
        acct.check();
        if (me) {
          syncBirthRevision(me);
          setBirthCheck(storedBirthTimeCheck(me));
          const mp = me.profile || {};
          savedBirthRef.current = {
            date: mp.birth_date || "", time: mp.birth_time || "", city: mp.birth_city || "",
            lat: mp.birth_lat ?? null, lon: mp.birth_lon ?? null,
          };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let prev: any = null;
        try {
          const raw = localStorage.getItem(accountKey("solray_blueprint"));
          prev = raw ? JSON.parse(raw) : null;
        } catch {}
        const bp = res.blueprint;
        bp._cache_version = 4;
        bp._name         = me?.profile?.name           ?? prev?._name           ?? "";
        bp._username     = me?.profile?.username       ?? prev?._username       ?? "";
        bp._profile_photo= me?.profile?.profile_photo  ?? prev?._profile_photo  ?? null;
        bp._cachedAt = Date.now();
        acct.check();
        localStorage.setItem(accountKey("solray_blueprint"), JSON.stringify(bp));
      }
    } catch (e) {
      if (isStaleAccountError(e)) throw e;
    }
  };

  const saveBirth = async () => {
    if (!token) return;
    if (!birthDate || !birthTime) {
      setBirthError(t("settings.birth_date_time_required"));
      setBirthStatus("error");
      setTimeout(() => setBirthStatus("idle"), 2200);
      return;
    }
    // Birth-data updates recompute the user's full chart. We refuse to
    // submit a city string that hasn't been resolved to coordinates,
    // because backend geocoding can be slow or fail and we'd rather
    // catch the ambiguity here than silently corrupt the chart.
    if (birthCity.trim() && (birthLat == null || birthLon == null)) {
      setBirthError(t("settings.birth_city_select_hint"));
      setBirthStatus("error");
      setTimeout(() => setBirthStatus("idle"), 3200);
      return;
    }
    setBirthStatus("saving");
    setBirthError(null);
    // The account this save belongs to, captured before the PATCH.
    const acct = captureAccount();
    try {
      const body: Record<string, unknown> = {
        birth_date: birthDate,
        birth_time: birthTime,
        birth_city: birthCity || undefined,
      };
      if (birthLat != null) body.birth_lat = birthLat;
      if (birthLon != null) body.birth_lon = birthLon;
      // A birth time in the hour the clocks went back happened twice: the
      // member says which one and the same change is sent again with it.
      // One that never happened (clocks went forward) comes back to fix.
      const outcome = await sendBirthRequest(
        (fold) => apiFetch("/users/birth", {
          method: "PATCH",
          body: JSON.stringify(fold ? { ...body, birth_time_fold: fold } : body),
        }, token, { generation: acct.generation }),
        askFold,
      );
      acct.check();
      if (outcome.status === "cancelled") {
        setBirthStatus("idle");
        return;
      }
      if (outcome.status === "nonexistent") {
        setBirthError(t("birth_fold.nonexistent"));
        setBirthStatus("error");
        return;
      }
      const res = outcome.value;
      await storeBirthResult(res, acct);
      setBirthStatus("saved");
      setTimeout(() => setBirthStatus("idle"), 1800);
    } catch (e: unknown) {
      // Signed out meanwhile: this save belongs to nobody on this device.
      if (isStaleAccountError(e)) return;
      // Under 16 by the new date: the server refuses and the chart stays.
      const msg = isUnderMinimumAgeError(e)
        ? t("settings.birth_under_age")
        : memberErrorText(e, t, "settings.could_not_save", { byStatus: { 400: "settings.birth_invalid", 422: "settings.birth_invalid" } });
      setBirthError(msg);
      setBirthStatus("error");
    }
  };

  // An existing member whose saved birth time happened twice: ask which
  // occurrence it was (the same chooser as signup) and confirm it with the
  // saved details, unchanged, plus birth_time_fold.
  const confirmBirthFold = async () => {
    const saved = savedBirthRef.current;
    if (!token || !saved || birthCheck.status !== "ambiguous" || birthStatus === "saving") return;
    const acct = captureAccount();
    const fold = await askFold(birthCheck.options);
    if (!fold || !acct.live) return;
    setBirthStatus("saving");
    setBirthError(null);
    try {
      const body: Record<string, unknown> = {
        birth_date: saved.date,
        birth_time: saved.time,
        birth_city: saved.city || undefined,
        birth_time_fold: fold,
      };
      if (saved.lat != null) body.birth_lat = saved.lat;
      if (saved.lon != null) body.birth_lon = saved.lon;
      const res = await apiFetch("/users/birth", { method: "PATCH", body: JSON.stringify(body) }, token, { generation: acct.generation });
      await storeBirthResult(res, acct);
      setBirthCheck((c) => ({ ...c, fold, needsConfirmation: false }));
      setBirthConfirmed(true);
      setBirthStatus("saved");
      setTimeout(() => setBirthStatus("idle"), 1800);
    } catch (e: unknown) {
      if (isStaleAccountError(e)) return;
      setBirthError(memberErrorText(e, t, "settings.could_not_save", { byStatus: { 400: "settings.birth_invalid", 422: "settings.birth_invalid" } }));
      setBirthStatus("error");
    }
  };

  // Arriving from the gentle prompt (/profile/settings?birth=confirm): open
  // the chooser once, as soon as the saved check is known.
  const autoAskedRef = useRef(false);
  useEffect(() => {
    if (autoAskedRef.current || loading) return;
    if (!birthCheck.needsConfirmation || birthCheck.status !== "ambiguous") return;
    let wanted = false;
    try { wanted = new URLSearchParams(window.location.search).get("birth") === "confirm"; } catch { /* ignore */ }
    if (!wanted) return;
    autoAskedRef.current = true;
    void confirmBirthFold();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, birthCheck]);

  const handleSignOut = () => {
    logout();
    router.replace("/login");
  };

  // Account deletion. Inline confirm, never window.confirm (native dialogs
  // block the webview automation and look foreign in the app). The member
  // re-enters their password, which the server checks before deleting, so a
  // phone left unlocked cannot erase the account.
  const handleDeleteAccount = async () => {
    if (!token || !deletePassword || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const res = await apiFetch("/users/me", {
        method: "DELETE",
        body: JSON.stringify({ confirm: "DELETE", password: deletePassword }),
      }, token, { keepSessionOn401: true });
      setDeletePassword("");
      if (res?.store_managed) {
        // Apple / Google keep billing until the member cancels there. Say
        // so before signing out; the member leaves with the Done button.
        setDeleteStoreNote(true);
        setDeleteBusy(false);
        return;
      }
      logout();
      router.replace("/login");
    } catch (e: unknown) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        setDeleteError(t("settings.delete_wrong_password"));
      } else {
        setDeleteError(memberErrorText(e, t, "settings.delete_failed"));
      }
      setDeleteBusy(false);
    }
  };

  const initials = (name || "S").charAt(0).toUpperCase();

  return {
    confirmBirthFold, foldAsk, handleDeleteAccount, handleSignOut, initials, onPhotoSelected,
    saveBirth, setFoldAsk
  };
}
