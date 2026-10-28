"use client";

/**
 * /profile/settings, the gear-icon home for everything personal.
 *
 * Sections, top → bottom:
 *   1. Avatar, upload + replace your photo (PATCH /users/photo)
 *   2. Identity, name, @username             (PATCH /users/profile)
 *   3. Visibility, public/private toggle       (PATCH /users/profile is_public)
 *   4. Theme, dark/light mode             (localStorage + ThemeProvider)
 *   5. Birth, date, time, city            (PATCH /users/birth, regenerates blueprint)
 *   4e. Memory, the Oracle's memory switch + Clear memory
 *       (GET/PUT /users/me/consents/personalization_memory, DELETE /memory)
 *   6. Subscription, link to /subscribe
 *   7. Sign out
 *
 * The page deliberately uses one column of generous-spaced rows rather
 * than dense grouped cards: settings is a place where users want to
 * read each line once and feel they understood it. Compactness here
 * costs trust.
 */

import { useSettingsState } from "./_hooks/useSettingsState";
import { useSettingsActions } from "./_hooks/useSettingsActions";
import { renderSettings } from "./_components/SettingsView";


export default function SettingsPage() {
  const settingsState = useSettingsState();
  const settingsActions = useSettingsActions(settingsState);
  return renderSettings({ ...settingsState, ...settingsActions });
}
