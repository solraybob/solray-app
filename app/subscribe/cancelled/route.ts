import { NextRequest, NextResponse } from "next/server";

/**
 * /subscribe/cancelled, Borgun SecurePay cancel redirect handler
 *
 * Borgun may redirect here via GET or POST when the user cancels
 * on the hosted card-entry page. Either way, bounce back to /subscribe
 * with ?payment=failed so the page can say the payment did not go
 * through (instead of silently showing the same screen again).
 */

const redirect = () =>
  NextResponse.redirect(new URL("/subscribe?payment=failed", "https://app.solray.ai"), {
    status: 303,
  });

export async function GET(_req: NextRequest) {
  return redirect();
}

export async function POST(_req: NextRequest) {
  return redirect();
}
