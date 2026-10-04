import { NextResponse } from 'next/server';

// The legal text lives in one place: https://solray.ai/legal (terms,
// privacy, processors, refunds). This route used to serve an old copy from
// public/legal/index.html that still named Lemon Squeezy, promised a 30-day
// money-back guarantee and said "no third-party data sharing", which
// contradicted the real policy and the AI processors it names. Found while
// preparing the App Store resubmission, 2026-10-05.
export function GET() {
  return NextResponse.redirect('https://solray.ai/legal', 308);
}
