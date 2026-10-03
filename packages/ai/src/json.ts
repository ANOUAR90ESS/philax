/**
 * Extracts the first top-level JSON object from model output, tolerating code
 * fences or stray prose around it. Returns null if none parses.
 */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced?.[1] ? [fenced[1], text] : [text];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    if (start < 0) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Incrementally extracts the (possibly incomplete) string value of `field` from a
 * partial JSON buffer, decoding escapes. Used to stream a turn's `speech` while
 * the rest of the structured JSON is still being generated.
 */
export function extractPartialStringField(buffer: string, field: string): string | null {
  const key = new RegExp(`"${field}"\\s*:\\s*"`);
  const m = key.exec(buffer);
  if (!m) return null;
  let out = '';
  for (let i = m.index + m[0].length; i < buffer.length; i++) {
    const ch = buffer[i] as string;
    if (ch === '"') return out;
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = buffer[i + 1];
    if (next === undefined) return out; // escape split across chunks
    const simple: Record<string, string> = {
      n: '\n',
      t: '\t',
      r: '\r',
      '"': '"',
      '\\': '\\',
      '/': '/',
      b: '\b',
      f: '\f',
    };
    if (next === 'u') {
      const hex = buffer.slice(i + 2, i + 6);
      if (hex.length < 4) return out;
      out += String.fromCharCode(parseInt(hex, 16));
      i += 5;
    } else {
      out += simple[next] ?? next;
      i += 1;
    }
  }
  return out;
}
