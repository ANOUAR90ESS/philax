import { fingerprint, similarity } from './fingerprint';

export interface RememberedArgument {
  messageId: string;
  speakerId: string;
  claim: string;
  fingerprint: string;
}

export interface RedundancyResult {
  redundant: boolean;
  similarTo: RememberedArgument | null;
  score: number;
}

/**
 * Per-debate argument memory (§65): before accepting a new argument, compare it
 * with previous ones and reject restatements of the same claim.
 */
export class ArgumentMemory {
  private readonly items: RememberedArgument[] = [];

  constructor(
    initial: RememberedArgument[] = [],
    /** Jaccard threshold above which two claims count as the same argument. */
    private readonly threshold = 0.6,
  ) {
    this.items.push(...initial);
  }

  get all(): readonly RememberedArgument[] {
    return this.items;
  }

  check(claim: string, conclusion = ''): RedundancyResult {
    const fp = fingerprint(`${claim} ${conclusion}`);
    let best: RememberedArgument | null = null;
    let bestScore = 0;
    for (const item of this.items) {
      const s = similarity(fp, item.fingerprint);
      if (s > bestScore) {
        best = item;
        bestScore = s;
      }
    }
    return {
      redundant: bestScore >= this.threshold,
      similarTo: bestScore >= this.threshold ? best : null,
      score: bestScore,
    };
  }

  remember(
    messageId: string,
    speakerId: string,
    claim: string,
    conclusion = '',
  ): RememberedArgument {
    const item = {
      messageId,
      speakerId,
      claim,
      fingerprint: fingerprint(`${claim} ${conclusion}`),
    };
    this.items.push(item);
    return item;
  }
}
