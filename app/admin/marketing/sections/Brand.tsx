"use client";

/**
 * Brand guide. Static. The single source of truth for the Solray voice
 * and visual system. Anyone making a post, an ad, or a piece of copy
 * comes here first. The rules are short, opinionated, and absolute.
 */

const PALETTE: Array<{ name: string; cssVar: string; hint: string }> = [
  { name: "Forest deep",     cssVar: "var(--bg-deep)",       hint: "Background, the night under the trees." },
  { name: "Forest card",     cssVar: "var(--forest-card)",   hint: "Cards, panels, surfaces sitting above background." },
  { name: "Amber sun",       cssVar: "var(--amber)",         hint: "Primary action, single warmth in the frame." },
  { name: "Pearl",           cssVar: "var(--pearl)",         hint: "Highlight, careful — never decorative." },
  { name: "Ember",           cssVar: "var(--ember)",         hint: "Mars, Aries, fire, danger states." },
  { name: "Moss",            cssVar: "var(--moss)",          hint: "Earth signs, growth, sustained presence." },
  { name: "Mist",            cssVar: "var(--mist)",          hint: "Air signs, communication, lift." },
  { name: "Indigo",          cssVar: "var(--indigo)",        hint: "Water signs, depth, after dusk." },
  { name: "Wisteria",        cssVar: "var(--wisteria)",      hint: "Venus, soul-connection, the relational frequency." },
];

const VOICE_RULES = [
  {
    rule: "No em dashes, ever",
    body: "Use commas, periods, or colons. The em dash is a tell of AI-generated copy. Solray never uses one.",
  },
  {
    rule: "No emojis, ever",
    body: "Anywhere. UI, posts, captions, replies, code comments, commits. Zero exceptions. Typographic glyphs (planet symbols rendered with U+FE0E) are not emojis.",
  },
  {
    rule: "Never frame as correction",
    body: "We do not say 'not Mercury' or 'unlike traditional astrology'. We use the Solray rulerships naturally (Earth rules Taurus, Ceres rules Virgo) the way a native speaker uses their language without explaining grammar.",
  },
  {
    rule: "Never reference the books in public copy",
    body: "The six philosophy books are internal framework context. Landing pages, app copy, social posts, the Higher Self — none of them surface the books explicitly.",
  },
  {
    rule: "Specific over universal",
    body: "If a sentence could apply to anyone, rewrite it until it could not. Concrete, observational, particular.",
  },
  {
    rule: "Function or beauty",
    body: "Living By Design / Japanese way. If something is neither functional nor beautiful it does not belong. Empty space is not missing content; it is breathing room.",
  },
];

const VOICE_EXAMPLES = [
  {
    label: "Daily observation",
    text: "The way you breathe out tells more about your sign than the way you breathe in. Notice it for a week.",
  },
  {
    label: "Solray rulership in the wild",
    text: "Taurus people are slow because Earth moves slow. The body knows what year it is. Don't rush a ruling planet.",
  },
  {
    label: "Reframe of common astrology",
    text: "Most people read their sun sign and feel disappointed. They read the cliché version. Read the rising. The body lives there.",
  },
  {
    label: "Higher Self answering a hard question",
    text: "You don't trust easy. That's the cost of the standards you carry.",
  },
  {
    label: "Push back when needed",
    text: "You keep asking for permission for what you've already decided to do.",
  },
];

const COUNTER_EXAMPLES = [
  "Your Saturn in the 7th house represents a karmic theme around relationships and...",
  "I'm here to gently hold space for whatever is arising for you today...",
  "The cosmos invites you to surrender into the mystery of...",
  "I hear you. That sounds really difficult. Take all the time you need.",
];

const TYPOGRAPHY = [
  { face: "Cormorant Garamond", role: "Display + headings", weights: "300 light primarily, 400 occasional", sample: "Living by design" },
  { face: "Inter",              role: "Body + UI",          weights: "400 regular, 500 medium for emphasis", sample: "Solray reads the exact moment you arrived against the sky overhead right now." },
  { face: "Cormorant italic 14px", role: "Quiet sub-tagline",  weights: "300 italic", sample: "living by design" },
];

export default function BrandSection() {
  return (
    <div className="space-y-10 page-enter">

      <Section title="Palette">
        <p className="font-body text-text-secondary text-[13px] leading-relaxed mb-4 max-w-2xl">
          Aged-pigment system. Categorical coding for sign elements and planets, all desaturated to harmonize with the forest + amber base. Use one warmth (amber) per frame; let the rest stay quiet.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {PALETTE.map((c) => (
            <div key={c.name} className="rounded-xl bg-forest-card/30 border border-forest-border/40 overflow-hidden">
              <div style={{ background: c.cssVar, height: 72 }} />
              <div className="px-3 py-3">
                <p className="font-heading text-text-primary text-[14px]" style={{ fontWeight: 400 }}>{c.name}</p>
                <p className="font-body text-text-secondary text-[11px] mt-1 leading-snug">{c.hint}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-4">
          {TYPOGRAPHY.map((t) => (
            <div key={t.face} className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
              <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">{t.role}</p>
              <p className="font-heading text-text-primary mb-1" style={{ fontSize: 24, fontWeight: 300 }}>{t.face}</p>
              <p className="font-body text-text-secondary text-[12px] mb-3">{t.weights}</p>
              <p
                className={t.face.startsWith("Cormorant") ? "font-heading" : "font-body"}
                style={{
                  fontSize: t.face.startsWith("Cormorant") ? 26 : 16,
                  fontWeight: 300,
                  fontStyle: t.face.includes("italic") ? "italic" : "normal",
                  color: "var(--text-primary)",
                }}
              >
                {t.sample}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Voice rules">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {VOICE_RULES.map((r) => (
            <div key={r.rule} className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
              <p className="font-heading text-amber-sun mb-2" style={{ fontSize: 16, fontWeight: 400 }}>{r.rule}</p>
              <p className="font-body text-text-secondary text-[13px] leading-relaxed">{r.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Voice examples">
        <p className="font-body text-text-secondary text-[13px] leading-relaxed mb-4 max-w-2xl">
          Lines you should sound like. Not to copy, to calibrate. Each one is a single sentence doing real work without performance.
        </p>
        <div className="space-y-3">
          {VOICE_EXAMPLES.map((e, i) => (
            <div key={i} className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
              <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">{e.label}</p>
              <p className="font-heading text-text-primary" style={{ fontSize: 18, fontWeight: 300, lineHeight: 1.4 }}>
                {e.text}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="What we do not sound like">
        <p className="font-body text-text-secondary text-[13px] leading-relaxed mb-4 max-w-2xl">
          If a sentence has the shape of any of these, rewrite.
        </p>
        <div className="space-y-2">
          {COUNTER_EXAMPLES.map((e, i) => (
            <div key={i} className="rounded-xl border px-4 py-3" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
              <p className="font-body text-[14px] leading-relaxed" style={{ textDecoration: "line-through", textDecorationColor: "rgba(212,122,82,0.4)" }}>
                {e}
              </p>
            </div>
          ))}
        </div>
      </Section>

    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-heading text-text-primary mb-4" style={{ fontSize: 22, fontWeight: 300, letterSpacing: "0.06em" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}
