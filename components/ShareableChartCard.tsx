"use client";

import { useRef, useState } from "react";
import html2canvas from "html2canvas";

interface ShareableChartCardProps {
  sunSign: string;
  moonSign: string;
  risingSign: string;
  hdType: string;
  hdProfile: string;
}

export default function ShareableChartCard({
  sunSign,
  moonSign,
  risingSign,
  hdType,
  hdProfile,
}: ShareableChartCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleShare = async () => {
    if (!cardRef.current) return;

    try {
      setIsGenerating(true);

      // Generate canvas from the card div
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: "var(--bg-deep)",
        scale: 2,
        logging: false,
        useCORS: true,
        allowTaint: true,
      });

      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          console.error("Failed to create blob");
          setIsGenerating(false);
          return;
        }

        // Create a File object from blob
        const file = new File([blob], "my-chart.png", { type: "image/png" });

        // Try Web Share API first
        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              files: [file],
              title: "My Solray Chart",
              text: `My cosmic blueprint: ${sunSign} Sun, ${moonSign} Moon, ${risingSign} Rising, ${hdType}`,
            });
          } catch (err) {
            // User cancelled share
            if ((err as Error).name !== "AbortError") {
              console.error("Share failed:", err);
            }
          }
        } else {
          // Fallback: download the image
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "my-chart.png";
          link.click();
          URL.revokeObjectURL(url);
        }

        setIsGenerating(false);
      });
    } catch (err) {
      console.error("Error generating card:", err);
      setIsGenerating(false);
    }
  };

  // Display values for the card
  const displayHD = hdProfile ? `${hdType} · ${hdProfile}` : hdType;

  return (
    <div>
      {/* Hidden card for rendering */}
      <div
        ref={cardRef}
        className="absolute left-[-9999px] w-[400px] h-[600px] flex flex-col items-center justify-center text-center p-8"
        style={{
          background: "linear-gradient(135deg, #050f08 0%, #0a1f12 100%)",
          fontFamily: "Cormorant Garamond, serif",
        }}
      >
        {/* Solray logo */}
        <div className="mb-6 text-amber-sun text-2xl font-bold tracking-widest">
          ⬤ solray
        </div>

        {/* Divider */}
        <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-amber-sun to-transparent mb-8" />

        {/* Chart info */}
        <div className="space-y-4 mb-8">
          <div className="text-amber-sun text-2xl font-light">
            ☉ {sunSign} Sun
          </div>
          <div className="text-amber-sun text-2xl font-light">
            ☽ {moonSign} Moon
          </div>
          <div className="text-amber-sun text-2xl font-light">
            ↑ {risingSign} Rising
          </div>
        </div>

        {/* Divider */}
        <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-amber-sun to-transparent mb-8" />

        {/* HD Type */}
        <div className="text-amber-sun text-base font-light tracking-wider mb-8">
          {displayHD}
        </div>

        {/* Divider */}
        <div className="w-12 h-[1px] bg-gradient-to-r from-transparent via-amber-sun to-transparent mb-6" />

        {/* Footer */}
        <div
          className="text-text-secondary text-xs tracking-widest uppercase"
          style={{ color: "#8a9e8d", letterSpacing: "0.15em" }}
        >
          solray.ai
        </div>
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        disabled={isGenerating}
        className="w-full py-3 rounded-2xl border border-amber-sun/40 text-amber-sun text-xs font-body tracking-wider uppercase hover:border-amber-sun/80 hover:bg-amber-sun/5 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
      >
        {isGenerating ? (
          <>
            <span className="inline-block animate-spin">◌</span>
            Generating...
          </>
        ) : (
          <>
            <span>↗</span>
            Share Your Chart
          </>
        )}
      </button>
    </div>
  );
}
