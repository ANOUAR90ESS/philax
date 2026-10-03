import { describe, expect, it } from 'vitest';
import { detectInput } from './detect-input';

describe('detectInput', () => {
  it('detects a bare URL', () => {
    expect(detectInput('  https://example.com/a?b=1 ')).toEqual({
      type: 'url',
      url: 'https://example.com/a?b=1',
    });
  });
  it('keeps text containing a URL as text', () => {
    expect(detectInput('Read https://example.com please').type).toBe('text');
  });
  it('treats non-http schemes as text', () => {
    expect(detectInput('javascript:alert(1)').type).toBe('text');
  });
});
