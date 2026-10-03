import { LLMError, type ProviderRequest } from '@philax/ai';
import { fixtureTopicAnalysis } from './fixtures';
import { readState, ScriptedLLMProvider, type ScriptHandler } from './scripted-llm';

/**
 * TEST DOUBLE ONLY (ADR-013). Produces schema-valid outputs for every debate
 * prompt, derived from the trusted application state each prompt carries. The
 * content is placeholder text; what is tested is the engine around the model.
 */
export interface FixtureOptions {
  language?: string;
  /** Return speech citing an unknown label on the first attempt of the Nth turn call. */
  invalidCitationOnTurnCall?: number;
  /** Consistency checker rejects the Nth consistency call. */
  rejectConsistencyCall?: number;
  /** Throw a non-retryable provider error on the Nth turn call. */
  failTurnCall?: number;
  /** Produce verdict language in the first synthesis attempt. */
  winnerInFirstSynthesis?: boolean;
}

type Json = Record<string, unknown>;

const BANK = (
  'attention memory habit craft labour leisure market ownership virtue justice liberty dignity welfare risk education ' +
  'apprenticeship mastery boredom curiosity imitation invention authority community friendship play discipline ' +
  'scarcity abundance wonder solitude dialogue reason passion custom progress tradition power consent equality ' +
  'difference meaning purpose care trust doubt evidence experiment teaching ritual property efficiency'
).split(' ');

/** Six words unique to call n, so fixture claims never look like restatements. */
function uniqueWords(n: number): string[] {
  const pick = (i: number) => BANK[(n * 7 + i * 13) % BANK.length] as string;
  return [pick(0), pick(1), `alpha${n}`, `beta${n}`, `gamma${n}`, `delta${n}`];
}

const kind = (req: ProviderRequest) => {
  const s = req.system;
  if (s.startsWith('You are the topic analyst')) return 'topic';
  if (s.startsWith('You select participants')) return 'select';
  if (s.startsWith('You plan a structured')) return 'plan';
  if (s.startsWith('You voice a reconstruction')) return 'turn';
  if (s.startsWith('You find objections')) return 'objections';
  if (s.startsWith('You verify a generated debate turn')) return 'consistency';
  if (s.startsWith('You write the closing synthesis')) return 'synthesis';
  if (s.startsWith('You prepare a rigorous examination')) return 'challenge';
  return 'unknown';
};

export class FixtureLLM {
  readonly provider: ScriptedLLMProvider;
  readonly counts: Record<string, number> = {};
  private readonly opts: FixtureOptions;

  constructor(opts: FixtureOptions = {}) {
    this.opts = opts;
    this.provider = new ScriptedLLMProvider([this.handler], 'fixture');
  }

  callsOf(k: string): ProviderRequest[] {
    return this.provider.calls.filter((c) => kind(c) === k);
  }

  private bump(k: string): number {
    this.counts[k] = (this.counts[k] ?? 0) + 1;
    return this.counts[k] as number;
  }

  private readonly handler: ScriptHandler = (req) => {
    const k = kind(req);
    const n = this.bump(k);
    const state = readState<Json>(req) ?? {};
    switch (k) {
      case 'topic':
        return JSON.stringify(fixtureTopicAnalysis({ language: this.opts.language ?? 'en' }));
      case 'select':
        return JSON.stringify(this.select(state));
      case 'plan':
        return JSON.stringify(this.plan(state));
      case 'challenge':
        return JSON.stringify(this.challenge(state));
      case 'objections':
        return JSON.stringify({
          candidates: [
            {
              text: 'This simply denies your conclusion.',
              relevance: 5,
              strength: 2,
              targets: 'conclusion',
            },
            {
              text: `Your argument assumes that effort and capability rise and fall together (objection ${n}).`,
              relevance: 5,
              strength: 5,
              targets: 'assumption',
            },
          ],
        });
      case 'consistency':
        if (this.opts.rejectConsistencyCall === n) {
          return JSON.stringify({
            verdict: 'regenerate',
            issues: [
              { type: 'contradicts_documented_position', detail: 'Fixture rejection for testing.' },
            ],
          });
        }
        return JSON.stringify({ verdict: 'accept', issues: [] });
      case 'turn':
        if (this.opts.failTurnCall === n) {
          return new LLMError('bad_request', 'fixture', 'fixture failure');
        }
        return JSON.stringify(this.turn(state, n));
      case 'synthesis':
        return JSON.stringify(this.synthesis(req, state, n));
      default:
        return undefined;
    }
  };

  private select(state: Json) {
    const needed = state.neededPerspectives as { slug: string }[];
    const shortlist = state.shortlist as { characterId: string; perspectives: string[] }[];
    const count = state.participantsToChoose as number;
    const roles = ['supporter', 'opponent', 'alternative'];
    const chosen: {
      characterId: string;
      perspectiveSlug: string;
      role: string;
      selectionReason: string;
    }[] = [];
    needed.forEach((p, i) => {
      if (chosen.length >= count) return;
      const c = shortlist.find(
        (s) =>
          s.perspectives.includes(p.slug) && !chosen.some((x) => x.characterId === s.characterId),
      );
      if (c)
        chosen.push({
          characterId: c.characterId,
          perspectiveSlug: p.slug,
          role: state.mode === 'challenge' ? (roles[i] as string) : 'debater',
          selectionReason: `Represents ${p.slug} and will clash with the others.`,
        });
    });
    return {
      participants: chosen,
      expectedDisagreement: 'Whether tools extend or erode human capacities.',
    };
  }

  private plan(state: Json) {
    const ids = (state.participants as { characterId: string }[]).map((p) => p.characterId);
    const [a, b, c] = ids as [string, string, string | undefined];
    return {
      disagreementAxes: [
        {
          id: 'x1',
          axis: 'values',
          description: 'Efficiency versus the cultivation of human capacities',
          between: [a, b],
        },
        {
          id: 'x2',
          axis: 'assumptions',
          description: 'Whether tools are neutral or reshape their users',
          between: c ? [b, c] : [a, b],
        },
      ],
      openings: ids.map((id) => ({
        characterId: id,
        angle: 'Central documented position applied to the topic',
        claimIds: ['c1'],
      })),
      challenges: ids.map((id, i) => ({
        challengerId: ids[(i + 1) % ids.length],
        targetId: id,
        axisId: i % 2 ? 'x2' : 'x1',
      })),
      crossExaminations: [{ askerId: a, responderId: b, focus: 'Is any tool truly neutral?' }],
      deepestDisagreement: { axisId: 'x2', question: 'Do tools leave the user unchanged?' },
      openQuestion: 'What should a society protect when tools make effort optional?',
    };
  }

  private challenge(state: Json) {
    const slugs = (state.perspectives as { slug: string }[]).map((p) => p.slug);
    return {
      hiddenAssumptions: [
        'Productivity is the right measure of better.',
        'Everyone has a suitable home workspace.',
      ],
      objectionCandidates: [
        { text: 'It denies the conclusion.', relevance: 4, strength: 2, targets: 'conclusion' },
        {
          text: 'It assumes that what is measurable is what matters about work.',
          relevance: 5,
          strength: 5,
          targets: 'assumption',
        },
      ],
      roles: { supporter: slugs[0], opponent: slugs[1], alternative: slugs[2] },
    };
  }

  private turn(state: Json, n: number) {
    const speaker = (state.speaker as { name: string }).name;
    const labels = state.allowedEvidenceLabels as string[];
    const move = state.move as string;
    const label =
      this.opts.invalidCitationOnTurnCall === n ? 'E999' : (labels[n % labels.length] ?? labels[0]);
    const claim = `${speaker}: ${uniqueWords(n).join(' ')}`;
    return {
      speech: `${speaker} (${move}, turn ${n}): drawing on documented ideas, I hold that this consideration matters for distinct reason ${n} [${label}]. This is a reconstruction, not a quotation.`,
      argument: {
        claim,
        premises: [`Premise ${n}a grounded in the cited evidence`, `Premise ${n}b about practice`],
        conclusion: `Conclusion ${n} specific to ${speaker} and ${move}`,
        assumptions: [`Assumption ${n}: capacities depend on exercise`],
        evidence: [{ evidenceId: label, use: 'supports the first premise' }],
        objections: [],
      },
      strongestObjection: {
        text: `Objection to claim ${n}`,
        response: `Response to objection ${n}`,
      },
      concessions: n % 3 === 0 ? [`Concession ${n}: tools can widen access`] : [],
      openQuestions: [`Open question ${n}?`],
      isExtrapolation: true,
    };
  }

  private synthesis(req: ProviderRequest, state: Json, n: number) {
    const ids = (state.participants as { characterId: string }[]).map((p) => p.characterId);
    const text = req.messages.map((m) => m.content).join('\n');
    const pairs = [...text.matchAll(/\(([0-9a-f-]{36})\) [^\n[]*\[([0-9a-f-]{36})\]/g)].map(
      (m) => ({ messageId: m[1] as string, characterId: m[2] as string }),
    );
    const keyArguments = ids.map((id) => ({
      characterId: id,
      claim: 'Key argument of this participant',
      messageId: pairs.find((p) => p.characterId === id)?.messageId ?? pairs[0]?.messageId,
    }));
    return {
      agreements: [
        {
          point:
            this.opts.winnerInFirstSynthesis && n === 1
              ? 'Mill is the winner of this debate'
              : 'Tools change what people practise.',
          participantIds: ids.slice(0, 2),
        },
      ],
      disagreements: [
        {
          point: 'Whether reduced effort is a loss',
          axis: 'values',
          whyTheyDisagree: 'They rank efficiency and the cultivation of capacities differently.',
          positions: ids.map((id) => ({ characterId: id, stance: 'A distinct stance' })),
        },
      ],
      assumptions: ids.map((id) => ({
        characterId: id,
        assumptions: ['Capacities depend on exercise'],
      })),
      keyArguments,
      unresolvedQuestions: ['Who decides which effort is worth keeping?'],
      strongestUnresolvedQuestion: 'Is a capacity we no longer need to exercise still ours?',
    };
  }
}
