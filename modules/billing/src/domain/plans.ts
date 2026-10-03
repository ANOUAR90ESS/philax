export type Plan = 'free' | 'pro';

export const USAGE_KINDS = [
  'debate_created',
  'round_generated',
  'user_message',
  'synthesis',
] as const;
export type UsageKind = (typeof USAGE_KINDS)[number];

export interface PlanLimits {
  /** Max events of each kind per rolling 24h window. */
  daily: Record<UsageKind, number>;
  /** Max number of generated debate rounds per debate (lower in free tier, §21). */
  maxRoundsPerDebate: number;
  maxUserMessagesPerDebate: number;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    daily: { debate_created: 5, round_generated: 40, user_message: 30, synthesis: 5 },
    maxRoundsPerDebate: 6,
    maxUserMessagesPerDebate: 5,
  },
  pro: {
    daily: { debate_created: 50, round_generated: 400, user_message: 300, synthesis: 50 },
    maxRoundsPerDebate: 6,
    maxUserMessagesPerDebate: 20,
  },
};

export function limitsFor(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}
