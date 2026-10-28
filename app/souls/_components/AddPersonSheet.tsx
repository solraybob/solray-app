"use client";

import { memberErrorText } from "@/lib/member-error";
import { useEffect, useState, useRef } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ApiError, detailCode, trackRequest } from "@/lib/api";
import { sendBirthRequest, type BirthFold, type FoldChoice } from "@/lib/birth-time-fold";
import BirthTimeFoldSheet from "@/components/BirthTimeFoldSheet";
import { captureAccount } from "@/lib/account-session";
import { useT } from "@/lib/i18n";
import { errorText } from "@/lib/errors";
import { useCityAutocomplete, type CitySuggestion } from "@/lib/city-search";
import BirthWheels from "@/components/BirthWheels";
import { type SavedPerson } from "../_lib/souls-data";

// ---------------------------------------------------------------------------
// Add-person sheet, collects birth data, calls /souls/calculate-blueprint
// ---------------------------------------------------------------------------

interface AddPersonSheetProps {
  onClose: () => void;
  onAdded: (person: SavedPerson) => void;
}

export function AddPersonSheet({ onClose, onAdded }: AddPersonSheetProps) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [sex, setSex] = useState<"female" | "male" | "">("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [timeUnknown, setTimeUnknown] = useState(false);
  const [birthCity, setBirthCity] = useState("");
  const city = useCityAutocomplete(birthCity);
  const pickCity = (c: CitySuggestion) => {
    setBirthCity(c.display);
    city.settle(c.display);
  };
  const cityInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Another person's birth details leave this device (to Solray to draw the
  // chart, and to its AI providers when the member asks about them), so the
  // member confirms they have that person's permission first.
  const [hasPermission, setHasPermission] = useState(false);
  // The "which one was it" question for a birth time that happened twice.
  const [foldAsk, setFoldAsk] = useState<{ options: FoldChoice[]; resolve: (f: BirthFold | null) => void } | null>(null);
  const askFold = (options: FoldChoice[]) =>
    new Promise<BirthFold | null>((resolve) => setFoldAsk({ options, resolve }));
  // A chart that lands after the sheet closed, or after the account
  // changed, is dropped: it must never be added to anyone's list.
  const sheetMountedRef = useRef(true);
  useEffect(() => {
    sheetMountedRef.current = true;
    return () => { sheetMountedRef.current = false; };
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node) &&
        cityInputRef.current &&
        !cityInputRef.current.contains(e.target as Node)
      ) {
        city.close();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const canSubmit =
    name.trim().length > 0 &&
    (sex === "female" || sex === "male") &&
    birthDate.length === 10 &&
    (timeUnknown || birthTime.length === 5) &&
    birthCity.trim().length > 0 &&
    hasPermission &&
    !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const acct = captureAccount();
    const stillHere = () => acct.live && sheetMountedRef.current;
    try {
      const body = {
        name,
        sex: sex || null,
        birth_date: birthDate,
        birth_time: timeUnknown ? "12:00" : birthTime,
        birth_city: birthCity,
      };
      // A birth time in the hour the clocks went back happened twice: the
      // member says which one and the chart is drawn again with it. One that
      // never happened (clocks went forward) comes back to be corrected.
      const calculate = async (fold: BirthFold | null) => {
        const { ok, status, data } = await trackRequest(async () => {
          const res = await fetch(`${apiUrl}/souls/calculate-blueprint`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fold ? { ...body, birth_time_fold: fold } : body),
          });
          if (!stillHere()) return { ok: false, status: 0, data: null };
          return { ok: res.ok, status: res.status, data: res.ok ? await res.json() : await res.json().catch(() => ({})) };
        });
        if (!stillHere()) return null;
        if (!ok) {
          throw new ApiError(errorText(data?.detail, ""), status, detailCode(data?.detail), data?.detail);
        }
        return data;
      };
      const outcome = await sendBirthRequest(calculate, askFold);
      if (!stillHere()) return;
      if (outcome.status === "cancelled") return;
      if (outcome.status === "nonexistent") {
        setError(t("birth_fold.nonexistent"));
        return;
      }
      const data = outcome.value;
      if (!data) return;
      const person: SavedPerson = {
        id: typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        sex: sex || null,
        birth_date: birthDate,
        birth_time: timeUnknown ? "12:00" : birthTime,
        birth_city: birthCity.trim(),
        profile: {
          sun_sign: data?.profile?.sun_sign ?? null,
          hd_type: data?.profile?.hd_type ?? null,
          hd_profile: data?.profile?.hd_profile ?? null,
        },
        // Persist the FULL blueprint the backend just computed. Without
        // this, the Oracle reads this person from a 3-field summary and
        // ends up asking the user for moon sign, defined centres, etc.
        // We already had the data, we were just throwing it away.
        blueprint: data?.blueprint ?? undefined,
        created_at: Date.now(),
        birth_time_fold: outcome.fold ?? undefined,
      };
      onAdded(person);
    } catch (e: unknown) {
      if (!stillHere()) return;
      const msg = memberErrorText(e, t, "souls.error_read_chart", { byStatus: { 400: "settings.birth_invalid", 422: "settings.birth_invalid" } });
      setError(msg);
    } finally {
      if (sheetMountedRef.current) setSubmitting(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-forest-deep/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-forest-dark border-t border-forest-border rounded-t-3xl px-6 pt-5 pb-16 max-h-[96dvh] overflow-y-auto">
        <div className="w-10 h-1 bg-forest-border rounded-full mx-auto mb-5" />
        <h3 className="font-heading text-text-primary mb-1" style={{ fontSize: "1.2rem", fontWeight: 700 }}>{t("souls.add_someone")}</h3>
        <p className="font-body text-text-secondary text-[15px] mb-5">{t("souls.add_someone_sub")}</p>

        <div className="space-y-4">
          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold">{t("souls.label_name")}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("souls.name_placeholder")}
              className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-mist transition-colors"
            />
          </div>

          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary mb-1 block font-bold">{t("souls.label_gender")}</label>
            <div className="grid grid-cols-2 gap-2">
              {(["female", "male"] as const).map((opt) => {
                const active = sex === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setSex(opt)}
                    className="py-2.5 rounded-xl transition-all font-body text-[15px]"
                    style={{
                      background: active ? "rgba(74,46,158,0.10)" : "transparent",
                      border: active ? "1px solid rgba(74,46,158,0.55)" : "1px solid rgb(var(--rgb-text-primary) / 0.12)",
                      color: active ? "var(--text-primary)" : "var(--text-muted)",
                    }}
                  >
                    {opt === "female" ? t("onboard.female") : t("onboard.male")}
                  </button>
                );
              })}
            </div>
          </div>

          {/* The same instrument the person set their own birth on. Two
              native pickers side by side made someone else's birth into two
              unrelated fields, and opened two modals on a phone. */}
          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold" style={{ display: "block", marginBottom: 8 }}>
              {t("souls.label_birth_date")}
            </label>
            <BirthWheels
              date={birthDate}
              time={birthTime}
              timeDisabled={timeUnknown}
              onChange={(d, tm) => { setBirthDate(d); setBirthTime(tm); }}
              prompt={t("souls.birth_wheel_prompt")}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !timeUnknown;
              setTimeUnknown(next);
              if (next) setBirthTime("12:00");
            }}
            className={`font-body text-[15px] tracking-wider transition-colors -mt-2 ${
              timeUnknown ? "text-indigo" : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {timeUnknown ? t("onboard.time_using_noon") : t("souls.unknown_birth_time")}
          </button>

          <div>
            <label className="font-body text-[14px] tracking-[0.18em] uppercase text-text-secondary font-bold">{t("souls.label_birth_city")}</label>
            <div className="relative">
              <input
                ref={cityInputRef}
                type="text"
                value={birthCity}
                onChange={(e) => setBirthCity(e.target.value)}
                onKeyDown={(e) => { city.onKeyDown(e, pickCity); }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={city.open && city.suggestions.length > 0}
                aria-controls="souls-city-list"
                aria-activedescendant={city.active >= 0 ? `souls-city-${city.active}` : undefined}
                placeholder={t("onboard.city_placeholder")}
                autoComplete="off"
                className="w-full bg-transparent border-b border-forest-border text-text-primary font-body py-2 focus:outline-none focus:border-mist transition-colors"
                style={{ paddingRight: city.loading ? "2rem" : undefined }}
              />
              {city.loading && (
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-text-secondary">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </span>
              )}
              {city.open && city.suggestions.length > 0 && (
                <div
                  ref={suggestionsRef} role="listbox" id="souls-city-list"
                  className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden shadow-xl"
                  style={{
                    background: "rgb(var(--rgb-card))",
                    border: "1px solid rgb(var(--rgb-text-primary) / 0.12)",
                    maxHeight: "14rem",
                    overflowY: "auto",
                  }}
                >
                  {city.suggestions.map((s, i) => (
                    <button
                      key={s.display}
                      id={`souls-city-${i}`}
                      type="button"
                      role="option"
                      aria-selected={i === city.active}
                      className={`w-full text-left px-4 py-2.5 font-body text-[17px] text-text-primary hover:bg-white/5 transition-colors border-b border-forest-border/40 last:border-b-0${i === city.active ? " is-active" : ""}`}
                      style={{ minHeight: 44, ...(i === city.active ? { background: "rgb(var(--rgb-text-primary) / 0.06)" } : {}) }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickCity(s)}
                    >
                      {s.display}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="text-ember text-[15px] font-body">{error}</p>
          )}

          <label className="flex items-start gap-3 cursor-pointer select-none" style={{ minHeight: 44 }}>
            <input
              type="checkbox"
              checked={hasPermission}
              onChange={(e) => setHasPermission(e.target.checked)}
              className="mt-1 w-4 h-4 cursor-pointer flex-shrink-0"
              style={{ accentColor: "rgb(var(--rgb-text-primary))" }}
            />
            <span className="font-body text-[15px] leading-relaxed text-text-secondary">
              {t("souls.permission_confirm").replace("{name}", name.trim() || t("souls.permission_this_person"))}
            </span>
          </label>

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-xl font-body font-semibold text-[17px] tracking-[0.2em] uppercase transition-all disabled:opacity-30"
            style={{
              background: "linear-gradient(135deg, rgb(var(--rgb-mist)), rgb(var(--rgb-mist)))",
              color: "var(--text-primary)",
            }}
          >
            {submitting ? <LoadingSpinner size="sm" /> : t("souls.read_their_chart")}
          </button>
        </div>
      </div>
    </div>
    {/* Above the add-person sheet. */}
    {foldAsk && (
      <BirthTimeFoldSheet
        options={foldAsk.options}
        onChoose={(f) => { foldAsk.resolve(f); setFoldAsk(null); }}
        onCancel={() => { foldAsk.resolve(null); setFoldAsk(null); }}
      />
    )}
    </>
  );
}
