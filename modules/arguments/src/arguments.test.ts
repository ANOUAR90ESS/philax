import { describe, expect, it } from 'vitest';
import { ArgumentMemory } from './argument-memory';
import { parseArgument } from './argument-parser';
import { similarity, fingerprint } from './fingerprint';
import { selectStrongestObjection } from './objections';

describe('ArgumentMemory', () => {
  it('flags a restated argument and accepts a genuinely different one', () => {
    const mem = new ArgumentMemory();
    mem.remember(
      'm1',
      'mill',
      'Silencing opinions robs humanity of the chance to correct errors',
      'Free expression must be protected',
    );
    const restated = mem.check(
      'Silencing an opinion robs humanity of the chance of correcting its errors',
      'Free expression must be protected',
    );
    expect(restated.redundant).toBe(true);
    expect(restated.similarTo?.messageId).toBe('m1');
    const different = mem.check(
      'Markets coordinate dispersed knowledge through prices',
      'Central planning fails',
    );
    expect(different.redundant).toBe(false);
  });

  it('computes similarity on normalized fingerprints', () => {
    expect(similarity(fingerprint('The Technology!'), fingerprint('technology'))).toBe(1);
    expect(similarity('', 'a')).toBe(0);
  });
});

describe('selectStrongestObjection', () => {
  it('picks the most relevant and strongest, preferring deeper targets on ties', () => {
    const pick = selectStrongestObjection([
      { text: 'You are simply wrong', relevance: 5, strength: 2, targets: 'conclusion' },
      {
        text: 'Your argument assumes effort and skill are linked',
        relevance: 5,
        strength: 4,
        targets: 'assumption',
      },
      { text: 'Your premise is false', relevance: 4, strength: 5, targets: 'premise' },
      { text: 'Irrelevant tangent', relevance: 1, strength: 5, targets: 'evidence' },
    ]);
    expect(pick?.text).toBe('Your argument assumes effort and skill are linked');
    expect(
      selectStrongestObjection([{ text: 'x', relevance: 2, strength: 5, targets: 'premise' }]),
    ).toBeNull();
  });
});

describe('parseArgument', () => {
  it('keeps only allowed evidence and known message targets, deriving source references', () => {
    const arg = parseArgument(
      'a1',
      {
        claim: ' AI frees time ',
        premises: ['p1', 'p1', ' '],
        conclusion: 'c',
        assumptions: ['x'],
        evidence: [
          { evidenceId: 'E1', use: 'supports' },
          { evidenceId: 'E9', use: 'fake' },
          { evidenceId: 'E1', use: 'dup' },
        ],
        objections: [{ text: 'o', targetsMessageId: 'unknown' }],
      },
      new Map([['E1', 'src-1']]),
      new Set(['m1']),
    );
    expect(arg.claim).toBe('AI frees time');
    expect(arg.premises).toEqual(['p1']);
    expect(arg.evidence).toEqual([{ evidenceId: 'E1', use: 'supports' }]);
    expect(arg.sourceReferences).toEqual(['src-1']);
    expect(arg.objections[0]?.targetsMessageId).toBeNull();
  });
});
