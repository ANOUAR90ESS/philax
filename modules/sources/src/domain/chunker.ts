/**
 * Splits text into retrieval chunks on paragraph boundaries, falling back to
 * sentence boundaries for very long paragraphs. Chunks never exceed maxChars.
 */
export function chunkText(text: string, maxChars = 1200): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const pieces: string[] = [];
  for (const p of paragraphs) {
    if (p.length <= maxChars) {
      pieces.push(p);
      continue;
    }
    let buf = '';
    for (const sentence of p.split(/(?<=[.!?؟。])\s+/)) {
      if (sentence.length > maxChars) {
        if (buf) {
          pieces.push(buf);
          buf = '';
        }
        for (let i = 0; i < sentence.length; i += maxChars)
          pieces.push(sentence.slice(i, i + maxChars));
        continue;
      }
      if (buf && buf.length + 1 + sentence.length > maxChars) {
        pieces.push(buf);
        buf = '';
      }
      buf = buf ? `${buf} ${sentence}` : sentence;
    }
    if (buf) pieces.push(buf);
  }
  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + 2 + piece.length > maxChars) {
      chunks.push(current);
      current = piece;
    } else current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}
