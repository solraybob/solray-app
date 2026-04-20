import { NextResponse } from "next/server";

/**
 * /api/build-id
 *
 * Returns the build identifier of whichever server instance serves this
 * request. The client compares this to the build id embedded in its own
 * bundle at build time, and reloads if they differ, so users on long-lived
 * sessions pick up new deploys without manual intervention.
 *
 * Must never be cached, otherwise a stale CDN edge would serve the old id
 * forever after a deploy and the update check would be inert.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const buildId =
    process.env.NEXT_PUBLIC_BUILD_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    "unknown";

  return NextResponse.json(
    { buildId },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "CDN-Cache-Control": "no-store",
        "Vercel-CDN-Cache-Control": "no-store",
      },
    }
  );
}
