import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DefaultLLMGateway } from '@philax/ai';
import { CharacterRepository, CharacterSelector, impliedConstraints } from '@philax/characters';
import { characterId, type Db } from '@philax/database';
import { RetrievalService } from '@philax/knowledge';
import {
  PerspectiveRepository,
  perspectiveDistance,
  selectPerspectives,
} from '@philax/perspectives';
import { buildTurnPrompt, topicAnalyzerPrompt } from '@philax/prompts';
import type { TopicAnalysis } from '@philax/types';

export interface EvalDataset {
  version: number;
  topics: {
    id: string;
    language: string;
    text: string;
    domains: string[];
    keywords: string[];
    requiredPerspectives: string[];
    mustContrast: [string, string][];
  }[];
  perspectiveConflicts: [string, string][];
  historicalCharacters: { slug: string; modernProbe: string; expectKeywords: string[] }[];
  injectionCases: string[];
}

export function loadDataset(): EvalDataset {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(readFileSync(join(here, 'dataset.json'), 'utf8')) as EvalDataset;
}

export interface OfflineReport {
  datasetVersion: number;
  topics: number;
  /** Mean pairwise perspective distance of selected perspectives (0–1). */
  meanPerspectiveDiversity: number;
  /** Share of topics whose gold contrast pair was selected together. */
  contrastCoverage: number;
  /** Share of topics with ≥3 distinct characters on distinct perspectives. */
  castValidity: number;
  /** Share of retrieved evidence chunks that belong to the participant they were retrieved for. */
  evidenceAttribution: number;
  /** Share of participants whose evidence came (at least partly) from topical search, not only top-up. */
  topicalGrounding: number;
  /** Share of catalog conflict pairs encoded as principled opposition. */
  conflictEncoding: number;
  /** Share of historical probes whose top-3 retrieved chunks contain an expected concept. */
  historicalRetrieval: number;
  /** Share of historical figures carrying an anachronism constraint with their death year. */
  anachronismGuard: number;
  /** Share of injection cases kept out of system prompts and inside balanced delimiters. */
  injectionIsolation: number;
  failures: string[];
}

function analysisFor(t: EvalDataset['topics'][number]): TopicAnalysis {
  return {
    title: t.text,
    summary: t.text,
    language: t.language,
    domains: t.domains,
    concepts: t.keywords.slice(0, 5),
    claims: [{ id: 'c1', kind: 'claim', text: t.text, relatedClaimIds: [] }],
    questions: [t.text],
    tensions: [],
    requiredPerspectives: t.requiredPerspectives.map((slug) => ({
      perspectiveSlug: slug,
      description: slug,
      reason: `Gold annotation: ${slug}`,
    })),
    retrievalKeywords: t.keywords,
    admitsReasonableDisagreement: true,
  };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Evaluates the deterministic parts of the AI system — perspective discovery,
 * character selection (algorithmic path), evidence retrieval, constraint
 * derivation and prompt isolation — without calling any LLM.
 */
export async function runOfflineEval(
  db: Db,
  data: EvalDataset = loadDataset(),
): Promise<OfflineReport> {
  const failures: string[] = [];
  const catalog = await new PerspectiveRepository(db).listAll();
  const bySlug = new Map(catalog.map((p) => [p.slug, p]));
  const retrieval = new RetrievalService(db, null);
  const repo = new CharacterRepository(db);
  // No providers: the selector's LLM step is unavailable and the algorithm decides.
  const noLLM = new DefaultLLMGateway({
    providers: [],
    tiers: { fast: [], strong: [], premium: [] },
    timeoutMs: 1000,
    maxRetries: 0,
  });
  const selector = new CharacterSelector(repo, retrieval, noLLM);

  const diversity: number[] = [];
  const contrast: number[] = [];
  const cast: number[] = [];
  const attribution: number[] = [];
  const grounding: number[] = [];

  for (const t of data.topics) {
    const analysis = analysisFor(t);
    const plan = selectPerspectives(analysis, catalog, { target: 4, minimum: 3 });
    const slugs = plan.selected.map((s) => s.perspective.slug);
    diversity.push(plan.diversity);
    const covered = t.mustContrast.every(([a, b]) => slugs.includes(a) && slugs.includes(b));
    contrast.push(covered ? 1 : 0);
    if (!covered)
      failures.push(
        `${t.id}: contrast ${JSON.stringify(t.mustContrast)} not selected (got ${slugs.join(', ')})`,
      );

    const targets = plan.selected.map((s) => ({
      slug: s.perspective.slug,
      label: s.perspective.label,
      reason: s.reason,
      relevance: 1,
      role: 'debater' as const,
    }));
    const selection = await selector.select(analysis, targets, {
      count: Math.min(4, targets.length),
      mode: 'debate',
    });
    const ok =
      selection.participants.length >= 3 &&
      new Set(selection.participants.map((p) => p.characterId)).size ===
        selection.participants.length &&
      new Set(selection.participants.map((p) => p.perspectiveSlug)).size ===
        selection.participants.length;
    cast.push(ok ? 1 : 0);
    if (!ok)
      failures.push(
        `${t.id}: invalid cast ${selection.participants.map((p) => p.slug).join(', ')}`,
      );

    for (const p of selection.participants) {
      const r = await retrieval.retrieveForCharacter(
        p.characterId,
        { text: t.text, keywords: t.keywords, limit: 6 },
        4,
      );
      attribution.push(mean(r.chunks.map((c) => (c.characterId === p.characterId ? 1 : 0))));
      grounding.push(r.chunks.some((c) => c.method !== 'direct') ? 1 : 0);
    }
  }

  const conflictEncoding = mean(
    data.perspectiveConflicts.map(([a, b]) => {
      const pa = bySlug.get(a);
      const pb = bySlug.get(b);
      const enc = pa && pb && perspectiveDistance(pa, pb) === 1 ? 1 : 0;
      if (!enc) failures.push(`conflict ${a} × ${b} is not encoded as a contrast`);
      return enc;
    }),
  );

  const historical: number[] = [];
  const guard: number[] = [];
  for (const h of data.historicalCharacters) {
    const id = characterId(h.slug);
    const r = await retrieval.retrieve({
      text: h.modernProbe,
      keywords: [...h.expectKeywords, ...h.modernProbe.split(/\W+/)],
      characterIds: [id],
      limit: 3,
    });
    const hit = r.chunks.some((c) =>
      h.expectKeywords.some((k) => c.content.toLowerCase().includes(k.toLowerCase())),
    );
    historical.push(hit ? 1 : 0);
    if (!hit) failures.push(`${h.slug}: probe did not retrieve ${h.expectKeywords.join('/')}`);
    const c = await repo.getFull(id);
    const rules = c ? impliedConstraints(c) : [];
    guard.push(
      rules.some(
        (x) =>
          x.kind === 'anachronism' &&
          c?.deathYear !== null &&
          x.rule.includes(String(Math.abs(c?.deathYear ?? 0))),
      )
        ? 1
        : 0,
    );
  }

  const isolation = data.injectionCases.map((attack) => {
    const prompts = [
      topicAnalyzerPrompt.build({
        content: attack,
        contentType: 'statement',
        detectedLanguage: 'en',
        catalog: [],
      }),
      buildTurnPrompt('eval', 1, injectionTurnInput(attack), ''),
    ];
    return prompts.every((p) => {
      const user = p.messages.map((m) => m.content).join('\n');
      const balanced =
        (user.match(/<untrusted_content/g)?.length ?? 0) ===
        (user.match(/<\/untrusted_content>/g)?.length ?? -1);
      return !p.system.includes(attack.slice(0, 30)) && balanced;
    })
      ? 1
      : 0;
  });

  return {
    datasetVersion: data.version,
    topics: data.topics.length,
    meanPerspectiveDiversity: Number(mean(diversity).toFixed(3)),
    contrastCoverage: Number(mean(contrast).toFixed(3)),
    castValidity: Number(mean(cast).toFixed(3)),
    evidenceAttribution: Number(mean(attribution).toFixed(3)),
    topicalGrounding: Number(mean(grounding).toFixed(3)),
    conflictEncoding: Number(conflictEncoding.toFixed(3)),
    historicalRetrieval: Number(mean(historical).toFixed(3)),
    anachronismGuard: Number(mean(guard).toFixed(3)),
    injectionIsolation: Number(mean(isolation).toFixed(3)),
    failures,
  };
}

function injectionTurnInput(attack: string): Parameters<typeof buildTurnPrompt>[2] {
  return {
    language: 'en',
    phaseLabel: 'Opening positions',
    move: 'assert',
    instruction: 'Opening',
    roundNumber: 1,
    speaker: {
      characterId: 'x',
      name: 'Test',
      representation: 'historical',
      lifespan: '1–2',
      era: 'e',
      perspective: 'p',
      worldview: 'w',
      positions: [],
      constraints: [],
    },
    otherParticipants: [],
    addressed: [],
    topic: { title: attack, summary: attack, claims: [] },
    axis: null,
    evidence: [{ label: 'E1', kind: 'user_content', citation: 'Your input', text: attack }],
    transcript: [{ messageId: 'm1', speaker: 'User', move: 'assert', text: attack }],
    replyTo: { messageId: 'm1', speaker: 'User', text: attack },
    plannedObjection: null,
    memory: { previousClaims: [], concessions: [], userPositions: [attack] },
    revisionFeedback: null,
  };
}
