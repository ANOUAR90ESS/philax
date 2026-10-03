import { describe, expect, it } from 'vitest';
import { extractJsonObject, extractPartialStringField } from './json';

describe('extractJsonObject', () => {
  it('finds the first balanced object around prose', () => {
    expect(extractJsonObject('Sure! {"a":{"b":"}"}} trailing')).toEqual({ a: { b: '}' } });
  });
  it('returns null when there is no object', () => {
    expect(extractJsonObject('nothing here')).toBeNull();
    expect(extractJsonObject('{broken')).toBeNull();
  });
});

describe('extractPartialStringField', () => {
  it('returns partial values and decodes escapes', () => {
    expect(extractPartialStringField('{"speech":"Hel', 'speech')).toBe('Hel');
    expect(extractPartialStringField('{"speech":"a\\', 'speech')).toBe('a');
    expect(extractPartialStringField('{"speech":"a\\u00e9b"', 'speech')).toBe('aéb');
    expect(extractPartialStringField('{"other":"x"}', 'speech')).toBeNull();
  });
});
