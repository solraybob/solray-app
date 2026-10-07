"use client";

import Image from "next/image";

// THE DECK, taken from mundane's Now screen to the value:
//
//   .deck{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;
//     scrollbar-width:none;margin:0 calc(var(--m) * -1);padding:22px var(--m) 20px;
//     align-items:center}
//   .card{scroll-snap-align:center;flex:0 0 calc(100% - 40px);display:flex;
//     flex-direction:column;align-items:center;text-align:center;
//     justify-content:center;min-height:min(430px,55vh);background:#FCF9F3;
//     border:1px solid rgba(34,32,28,.07);border-radius:24px;padding:26px 22px 22px;
//     box-shadow:0 14px 34px rgba(70,45,20,.10), 0 3px 8px rgba(70,45,20,.05)}
//   .card{--orb:clamp(92px,13vh,110px)}
//   .card-sun / .sunwrap{position:relative;margin-top:10px;display:grid;place-items:center;
//     width:calc(var(--orb)*1.46);height:calc(var(--orb)*1.46)}  .sunwrap>*{grid-area:1/1}
//   .rings viewBox 0 0 250 250: r=94 @.30, r=106 @.18, r=113 @.10, stroke #D98A7A, width 1
//   .orb{width:var(--orb);height:var(--orb);border-radius:50%;
//     box-shadow:0 12px 44px rgba(222,122,42,.28), 0 0 0 9px rgba(245,240,230,.55);
//     animation:breathe 9s ease-in-out infinite}
//   .card .kick{font-size:11.5px;letter-spacing:.2em;color:var(--ink3);margin-bottom:2px}
//   .card h2{font-size:26px;font-weight:700;letter-spacing:-.022em;line-height:1.08;margin-top:2px}
//   .card p{font-size:15px;color:var(--ink2);line-height:1.48;margin-top:9px;max-width:19em}
//   .card .act{width:100%;margin-top:22px}
//   .card .btn{width:100%;border:1.5px solid var(--ink);border-radius:999px;
//     background:none;color:var(--ink);font-size:15px;font-weight:700;
//     letter-spacing:.06em;padding:14px}
//   .dots i{width:9px;height:9px;border-radius:50%;border:1.4px solid rgba(34,32,28,.24)}
//   .dots i.here{transform:scale(1.15);box-shadow:0 0 0 3.5px rgba(34,32,28,.075)}
//
// Two substitutions, both because our page has two grounds: the card fill and
// edge are our own card and hairline tokens, and mundane's warm brown shadow
// is our scrim, which is ink on paper and black after sunset.
//
// Shared by Today's deck and the /admin/now-card preview, so the preview is
// the card members see, not a copy of it.
export default function DeckCard({
  kick,
  title,
  body,
  action,
  onAction,
}: {
  kick: string;
  title: string;
  body: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <article
      className="sol-deck-card"
      style={{
        scrollSnapAlign: "center",
        flex: "0 0 100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        justifyContent: "center",
        // The card fills the track the deck gives it. It used to ask for
        // min(520px, 58vh), which is a guess at the screen: on anything
        // shorter than the phone it was measured on, the card ran past the
        // fold and took its dots with it.
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        background: "rgb(var(--rgb-card))",
        border: "1px solid rgb(var(--rgb-border) / 0.6)",
        borderRadius: 24,
        padding: "clamp(14px, 2.4vh, 26px) 22px clamp(12px, 2.2vh, 22px)",
        boxShadow: "0 14px 34px rgb(var(--rgb-scrim) / 0.10), 0 3px 8px rgb(var(--rgb-scrim) / 0.05)",
      }}
    >
      <span className="font-body uppercase sol-deck-kick">
        {kick}
      </span>

      {/* mundane's sunwrap: three rings and the orb on one grid cell. Ours is
          the orb PNG rather than mundane's CSS gradient, because that file IS
          the mark; every measurement around it is mundane's. */}
      <div
        style={{
          position: "relative",
          marginTop: 10,
          display: "grid",
          placeItems: "center",
          width: "calc(var(--orb) * 1.46)",
          height: "calc(var(--orb) * 1.46)",
          flex: "0 0 auto",
        }}
      >
        <svg
          viewBox="0 0 250 250"
          aria-hidden
          style={{ gridArea: "1/1", pointerEvents: "none", width: "calc(var(--orb) * 1.46)", height: "calc(var(--orb) * 1.46)" }}
        >
          <circle cx="125" cy="125" r="94" fill="none" stroke="rgb(var(--rgb-ember))" strokeOpacity=".30" strokeWidth="1" />
          <circle cx="125" cy="125" r="106" fill="none" stroke="rgb(var(--rgb-ember))" strokeOpacity=".18" strokeWidth="1" />
          <circle cx="125" cy="125" r="113" fill="none" stroke="rgb(var(--rgb-ember))" strokeOpacity=".10" strokeWidth="1" />
        </svg>
        <Image
          src="/solray-orb.png"
          alt=""
          width={160}
          height={160}
          unoptimized
          style={{
            gridArea: "1/1",
            width: "var(--orb)",
            height: "var(--orb)",
            objectFit: "contain",
            borderRadius: "50%",
            boxShadow: "0 12px 44px rgba(222,122,42,.28), 0 0 0 9px rgb(var(--rgb-card) / .55)",
            animation: "cardBreathe 9s ease-in-out infinite",
          }}
        />
      </div>
      <h2 className="font-heading text-text-primary sol-deck-title">
        {title}
      </h2>
      <p className="font-body sol-deck-body">
        {body}
      </p>
      <div style={{ width: "100%", marginTop: 22 }}>
        <button
          onClick={onAction}
          className="font-body active:scale-[0.98] transition-transform"
          style={{
            width: "100%",
            border: "1.5px solid rgb(var(--rgb-text-primary))",
            borderRadius: 999,
            background: "none",
            color: "rgb(var(--rgb-text-primary))",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.06em",
            padding: 14,
          }}
        >
          {action}
        </button>
      </div>
    </article>
  );
}
