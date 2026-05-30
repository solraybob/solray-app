/**
 * lib/share-card.ts — Capture the off-screen ShareCard component to
 * a PNG blob and hand it to the OS share sheet (or download as a
 * fallback).
 *
 * Why a separate module: the React component is rendered into a
 * hidden DOM node by the page, this module operates on that node
 * imperatively (html2canvas + Web Share API). Keeping the imperative
 * code out of the React tree keeps the component clean.
 *
 * iOS Web Share API caveat: navigator.share() only works inside a
 * user gesture handler. html2canvas takes 200-1000ms which usually
 * extends the gesture window enough to clear the iOS check, but if
 * users report failures we will move to pre-generating the blob on
 * forecast load instead of on tap.
 */

interface CaptureOptions {
  /** Mounted DOM node containing the card to capture. */
  node: HTMLElement;
  /** Filename suggestion for the share sheet / download. */
  filename: string;
  /** Optional title accompanying the share. */
  title?: string;
  /** Optional caption text. */
  text?: string;
  /**
   * When true, capture the node at its OWN rendered size (for sharing an
   * in-app card exactly as it appears) instead of forcing the 1080x1920
   * story format used by the dedicated off-screen cards.
   */
  naturalSize?: boolean;
  /** Solid backdrop painted behind the node. Defaults to forest deep. */
  background?: string;
}

/**
 * Capture the rendered card to a PNG blob. Either at the fixed 1080x1920
 * story format (default, for the dedicated off-screen cards) or at the
 * node's own size (naturalSize, for capturing an in-app card 1:1).
 */
async function captureToBlob(opts: CaptureOptions): Promise<Blob> {
  // html2canvas is a ~50KB lib; load it on demand so the route bundle does
  // not ship it unless the user actually taps Share.
  const html2canvas = (await import("html2canvas")).default;
  const common = {
    backgroundColor: opts.background || "#050f08", // forest deep
    useCORS: true,
    logging: false,
  } as const;
  const canvas = opts.naturalSize
    ? await html2canvas(opts.node, { ...common, scale: 2 }) // crisp 2x of the real card
    : await html2canvas(opts.node, { ...common, width: 1080, height: 1920, scale: 1 });
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Canvas toBlob returned null"))),
      "image/png",
      0.94
    );
  });
}

/**
 * Detect whether navigator.share supports sharing files. iOS Safari
 * 15+ does; older Chrome on Android may not.
 */
function canShareFiles(file: File): boolean {
  if (typeof navigator === "undefined") return false;
  type ShareNav = Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  const nav = navigator as ShareNav;
  if (typeof nav.share !== "function") return false;
  if (typeof nav.canShare !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Capture the offscreen ShareCard and either (a) hand it to the
 * native share sheet, or (b) download it as a PNG file.
 *
 * Throws if both paths fail. The caller should toast or surface the
 * error rather than silently fall through.
 */
export async function shareOrDownloadCard(opts: CaptureOptions): Promise<"shared" | "downloaded"> {
  const blob = await captureToBlob(opts);
  const file = new File([blob], opts.filename, { type: "image/png" });

  if (canShareFiles(file)) {
    try {
      await (
        navigator as Navigator & { share: (data: ShareData) => Promise<void> }
      ).share({
        files: [file],
        title: opts.title,
        text: opts.text,
      });
      return "shared";
    } catch (err) {
      // User cancelled (AbortError) or share rejected. Don't fall
      // through to download; that would be surprising.
      const name = (err as { name?: string })?.name;
      if (name === "AbortError") return "shared"; // user cancelled, not an error
      throw err;
    }
  }

  // Fallback: trigger a download
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return "downloaded";
}
