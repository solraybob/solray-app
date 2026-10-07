// Which Now card is in view, for the dots under the deck.
//
// Measured from the cards themselves (their left edge and width inside the
// scrolling track) instead of an assumed stride, so it is right at every
// screen width; at the end of the track the last card counts as in view
// even if it cannot scroll all the way to the centre.

export interface CardBox { left: number; width: number }

export function activeCardIndex(
  scrollLeft: number,
  clientWidth: number,
  scrollWidth: number,
  cards: CardBox[],
  count: number,
): number {
  const n = Math.min(count, cards.length);
  if (n <= 0) return 0;
  if (scrollLeft + clientWidth >= scrollWidth - 2) return n - 1;
  const mid = scrollLeft + clientWidth / 2;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < n; i++) {
    const d = Math.abs(cards[i].left + cards[i].width / 2 - mid);
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
