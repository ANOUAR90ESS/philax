const STOP = new Set(
  'a an and as at be by for from in into is it its of on or that the their this to with without not are can more than its'.split(
    ' ',
  ),
);

export function tokens(...texts: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of texts) {
    for (const w of t.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
      if (w.length > 2 && !STOP.has(w)) out.add(w.length > 5 ? w.slice(0, 5) : w); // crude stemming
    }
  }
  return out;
}

export function overlap(a: Set<string>, b: Set<string>): number {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = overlap(a, b);
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
