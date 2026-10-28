"use client";

import { useState, useRef } from "react";
import { ShareCardOffscreen } from "@/components/ShareCard";
import { useT } from "@/lib/i18n";

// THE DAY. The reading is the product, so the reading is the page: a title
// at the display weight, one quiet line naming the configuration, and the
// text itself, on paper. No card, no wash, no photograph, and nothing to tap
// before you can read it. This block used to be a bordered hero with the
// reading folded away behind a chevron, which put decoration in front of the
// one thing a member pays for.
function TheDay({
  dayTitle,
  heroWash,
  reading,
  skyLine,
}: {
  dayTitle: string;
  heroWash: string;
  reading?: string;
  skyLine: string;
}) {
  const { t, lang } = useT();
  const [sharing, setSharing] = useState(false);
  const shareCardRef = useRef<HTMLDivElement | null>(null);

  const dateLabel = new Date().toLocaleDateString(lang === "en" ? "en-GB" : lang, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const handleShare = async () => {
    if (sharing || !shareCardRef.current) return;
    setSharing(true);
    try {
      const { shareOrDownloadCard } = await import("@/lib/share-card");
      await shareOrDownloadCard({
        node: shareCardRef.current,
        filename: `solray-${dateLabel.replace(/[, ]+/g, "-").toLowerCase()}.png`,
        title: "Solray",
        text: dayTitle,
      });
    } catch (err) {
      console.warn("[share] failed", err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div>
      <h1
        className="font-heading text-text-primary"
        style={{
          fontSize: "clamp(1.55rem, 6.6vw, 2.05rem)",
          fontWeight: 900,
          letterSpacing: "-.042em",
          lineHeight: 1.08,
          maxWidth: "15ch",
        }}
      >
        {dayTitle}
      </h1>

      <p
        className="font-body uppercase"
        style={{
          marginTop: 14,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "rgb(var(--rgb-text-muted))",
        }}
      >
        {skyLine}
      </p>

      {reading && (
        <div style={{ marginTop: 26, maxWidth: "26em" }}>
          {reading.split(/\n\n+/).map((para, i) => (
            <p
              key={i}
              className="font-body text-text-primary"
              style={{ fontSize: 17, lineHeight: 1.72, marginTop: i > 0 ? "1.1em" : 0 }}
            >
              {para.trim()}
            </p>
          ))}
        </div>
      )}

      <button
        onClick={handleShare}
        disabled={sharing}
        className="font-body uppercase disabled:opacity-50"
        style={{
          marginTop: 24,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.18em",
          color: "rgb(var(--rgb-text-muted))",
          background: "transparent",
        }}
      >
        {sharing ? t("common.loading") : t("today.share")}
      </button>

      <ShareCardOffscreen
        data={{ dayTitle, heroWash, dateLabel }}
        containerRef={shareCardRef}
      />
    </div>
  );
}
