/**
 * Which page numbers a pager shows: always the first, the last and a window around the current
 * one, with `null` where numbers are skipped ("1 … 5 6 7 … 12"). Pure, so it has tests.
 */
export function pageNumbers(page: number, pageCount: number, window = 1): (number | null)[] {
  if (pageCount <= 0) return [];
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pageCount);
  const wanted = new Set<number>([1, pageCount]);
  for (let p = current - window; p <= current + window; p++) {
    if (p >= 1 && p <= pageCount) wanted.add(p);
  }

  const out: (number | null)[] = [];
  let previous = 0;
  for (const p of [...wanted].sort((a, b) => a - b)) {
    // A gap hiding a single page is pointless — the number takes the same room — so show it.
    if (previous && p - previous === 2) out.push(previous + 1);
    else if (previous && p - previous > 2) out.push(null);
    out.push(p);
    previous = p;
  }
  return out;
}
