const STOP = new Set(
  'a an and are as at be because but by can cannot could do does for from has have how i if in into is it its may might more most must no not of on one only or our should so such than that the their them then there these they this those thus to was we were what when which who why will with without would you your'.split(
    ' ',
  ),
);

/** Normalized content-word set of a claim, used to detect repeated arguments. */
export function fingerprintTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFKC')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 6 ? w.slice(0, 6) : w));
  return [...new Set(words)].sort();
}

export function fingerprint(text: string): string {
  return fingerprintTokens(text).join(' ');
}

export function similarity(a: string, b: string): number {
  const A = new Set(a.split(' ').filter(Boolean));
  const B = new Set(b.split(' ').filter(Boolean));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}
