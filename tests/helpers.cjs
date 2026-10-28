// Minimal browser globals for the lib tests: Storage, window events,
// location, and a controllable fetch.
const path = require("path");

class MemStorage {
  constructor() { this.m = new Map(); }
  get length() { return this.m.size; }
  key(i) { return Array.from(this.m.keys())[i] ?? null; }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

function installBrowser() {
  const events = new EventTarget();
  const win = {
    localStorage: new MemStorage(),
    sessionStorage: new MemStorage(),
    location: { pathname: "/today", replaced: null, replace(u) { this.replaced = u; } },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    matchMedia: () => ({ matches: false }),
    navigator: {},
  };
  global.window = win;
  global.localStorage = win.localStorage;
  global.sessionStorage = win.sessionStorage;
  global.CustomEvent = global.CustomEvent || class CustomEvent extends Event {
    constructor(type, init) { super(type); this.detail = init?.detail; }
  };
  return win;
}

/** fetch that waits for the test to resolve each call. */
function deferredFetch() {
  const calls = [];
  global.fetch = (url, init) => new Promise((resolve) => {
    calls.push({ url, init, respond: (status, body) => resolve({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }) });
  });
  return calls;
}

function load(mod) {
  const root = process.env.SOLRAY_TEST_BUILD;
  if (!root) throw new Error("run through tests/run.sh");
  return require(path.join(root, mod));
}

const tick = () => new Promise((r) => setImmediate(r));

// Pages and libs that were split into co-located files. Source checks read
// the entry file followed by its parts, in the order the code used to sit.
const SPLITS = {
  "app/chat/page.tsx": [
    "app/chat/page.tsx",
    "app/chat/_lib/chat-helpers.ts",
    "app/chat/_components/MessageContent.tsx",
    "app/chat/_hooks/useChatState.ts",
    "app/chat/_hooks/useChatOpening.ts",
    "app/chat/_hooks/useChatSessions.ts",
    "app/chat/_hooks/useChatSend.ts",
    "app/chat/_hooks/useChatVoice.ts",
    "app/chat/_components/ChatView.tsx",
    "app/chat/_components/ChatMessages.tsx",
    "app/chat/_components/ChatComposer.tsx",
    "app/chat/_components/ChatHistorySheet.tsx",
    "app/chat/_components/ThinkingIndicator.tsx"
  ],
  "app/souls/page.tsx": [
    "app/souls/page.tsx",
    "app/souls/_lib/souls-data.ts",
    "app/souls/_components/SoulActions.tsx",
    "app/souls/_hooks/useSoulsState.ts",
    "app/souls/_hooks/useSoulsPeople.ts",
    "app/souls/_hooks/useSoulsBond.ts",
    "app/souls/_components/SoulsView.tsx",
    "app/souls/_components/BondCard.tsx",
    "app/souls/_components/PartnerPicker.tsx",
    "app/souls/_components/PermissionSheet.tsx",
    "app/souls/_components/AddPersonSheet.tsx",
    "app/souls/_components/SoulCard.tsx"
  ],
  "app/today/page.tsx": [
    "app/today/page.tsx",
    "app/today/_lib/today-data.ts",
    "app/today/_components/PlanetCard.tsx",
    "app/today/_components/SkeletonToday.tsx",
    "app/today/_components/TheDay.tsx",
    "app/today/_components/SkyNowFold.tsx",
    "app/today/_components/Deck.tsx",
    "app/today/_components/PendingTodayState.tsx",
    "app/today/_components/BreakthroughModal.tsx",
    "app/today/_components/SkyEchoModal.tsx",
    "app/today/_components/LunarMomentModal.tsx",
    "app/today/_components/BirthdayModal.tsx",
    "app/today/_hooks/useTodayState.ts",
    "app/today/_hooks/useTodayData.ts",
    "app/today/_components/TodayView.tsx",
    "app/today/_components/MoonCycleBar.tsx"
  ],
  "app/profile/page.tsx": [
    "app/profile/page.tsx",
    "app/profile/_lib/profile-data.ts",
    "app/profile/_components/icons.tsx",
    "app/profile/_components/SoulMapRadarChart.tsx",
    "app/profile/_components/NatalAspects.tsx",
    "app/profile/_components/CollapsibleSection.tsx",
    "app/profile/_components/ProfileSkeleton.tsx",
    "app/profile/_components/BlueprintSections.tsx",
    "app/profile/_lib/blueprint-chart.ts"
  ],
  "app/subscribe/page.tsx": [
    "app/subscribe/page.tsx",
    "app/subscribe/_components/PendingTrialView.tsx",
    "app/subscribe/_components/ResendVerification.tsx",
    "app/subscribe/_components/PlanPicker.tsx",
    "app/subscribe/_components/subscribe-ui.tsx",
    "app/subscribe/_components/NativeMembershipView.tsx",
    "app/subscribe/_components/TrialOffer.tsx"
  ],
  "app/profile/settings/page.tsx": [
    "app/profile/settings/page.tsx",
    "app/profile/settings/_components/settings-ui.tsx",
    "app/profile/settings/_hooks/useSettingsState.ts",
    "app/profile/settings/_hooks/useSettingsActions.ts",
    "app/profile/settings/_components/SettingsView.tsx"
  ],
  "lib/chat-sync.ts": [
    "lib/chat-sync.ts",
    "lib/chat-sync/store.ts",
    "lib/chat-sync/marks.ts",
    "lib/chat-sync/status.ts",
    "lib/chat-sync/push.ts",
    "lib/chat-sync/pull.ts"
  ]
};

/** Source text of a repo file; a split file reads as its entry plus parts. */
function splitSource(rel) {
  const fs = require("fs");
  const root = path.join(__dirname, "..");
  const files = (SPLITS[rel] || [rel]).filter((f) => f === rel || fs.existsSync(path.join(root, f)));
  return files.map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n");
}

module.exports = { installBrowser, deferredFetch, load, tick, MemStorage, splitSource, SPLITS };
