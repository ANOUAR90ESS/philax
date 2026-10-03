import type { ProviderRequest } from '@philax/ai';
import type { TopicAnalysis } from '@philax/types';

/** Deterministic topic analysis used by tests (shape-valid; content is a fixture). */
export function fixtureTopicAnalysis(over: Partial<TopicAnalysis> = {}): TopicAnalysis {
  return {
    title: 'Will AI make people less creative?',
    summary: 'Whether delegating effort to AI weakens or extends human creativity.',
    language: 'en',
    domains: ['technology', 'education', 'work'],
    concepts: ['creativity', 'effort', 'skill', 'automation'],
    claims: [
      {
        id: 'c1',
        kind: 'claim',
        text: 'AI reduces the effort needed to create.',
        relatedClaimIds: [],
      },
      {
        id: 'c2',
        kind: 'assumption',
        text: 'Reduced effort causes reduced capability.',
        relatedClaimIds: ['c1'],
      },
      {
        id: 'c3',
        kind: 'question',
        text: 'Does outsourcing effort reduce the underlying skill?',
        relatedClaimIds: ['c2'],
      },
      {
        id: 'c4',
        kind: 'value_judgment',
        text: 'Reduced effort is necessarily negative.',
        relatedClaimIds: ['c1'],
      },
    ],
    questions: [
      'Is creativity a skill that atrophies without effort?',
      'Who benefits from automated creativity?',
    ],
    tensions: [
      {
        description: 'Tool as extension vs tool as replacement',
        axis: 'assumptions',
        poles: ['extension', 'replacement'],
      },
      {
        description: 'Efficiency vs human capacities',
        axis: 'values',
        poles: ['efficiency', 'flourishing'],
      },
    ],
    requiredPerspectives: [
      {
        perspectiveSlug: 'technological-criticism',
        description: 'Technology reshapes its users',
        reason: 'Questions neutrality of AI tools',
      },
      {
        perspectiveSlug: 'market-liberalism',
        description: 'Tools free people for new work',
        reason: 'Productivity and dispersed innovation',
      },
      {
        perspectiveSlug: 'virtue-ethics',
        description: 'Excellence requires practice',
        reason: 'Habituation forms capacities',
      },
      {
        perspectiveSlug: 'marxism',
        description: 'Who owns the tools matters',
        reason: 'Alienation and control of production',
      },
    ],
    retrievalKeywords: [
      'technology',
      'creativity',
      'division of labour',
      'machinery',
      'habituation',
      'enframing',
      'writing memory',
    ],
    admitsReasonableDisagreement: true,
    ...over,
  };
}

export const isTopicAnalyzer = (req: ProviderRequest) =>
  req.system.startsWith('You are the topic analyst');
