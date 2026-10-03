import { describe, expect, it } from 'vitest';
import ar from './ar.json';
import en from './en.json';
import es from './es.json';

type Tree = { [k: string]: string | string[] | Tree };

function shape(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([k, v]) => {
    const key = prefix + k;
    if (typeof v === 'string') return [`${key}:s`];
    if (Array.isArray(v)) return [`${key}:a${v.length}`];
    return shape(v, `${key}.`);
  });
}

describe('locales', () => {
  it('es and ar have exactly the same keys as en', () => {
    const base = shape(en as Tree).sort();
    expect(shape(es as Tree).sort()).toEqual(base);
    expect(shape(ar as Tree).sort()).toEqual(base);
  });

  it('keeps interpolation variables consistent', () => {
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join();
    const walk = (a: Tree, b: Tree) => {
      for (const [k, v] of Object.entries(a)) {
        const other = b[k];
        if (typeof v === 'string' && typeof other === 'string')
          expect(vars(other), k).toBe(vars(v));
        else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, other as Tree);
      }
    };
    walk(en as Tree, es as Tree);
    walk(en as Tree, ar as Tree);
  });
});
