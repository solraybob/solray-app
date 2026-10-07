// Solray's terms and privacy policy set the minimum age at 16.
export const MIN_AGE = 16;

/** Whole years between a YYYY-MM-DD birth date and `now`, or null if invalid. */
export function ageFromBirthDate(date: string, now: Date = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  let age = now.getFullYear() - y;
  const beforeBirthday = now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d);
  if (beforeBirthday) age -= 1;
  return age;
}

export function isUnderMinimumAge(date: string, now: Date = new Date()): boolean {
  const age = ageFromBirthDate(date, now);
  return age !== null && age < MIN_AGE;
}
