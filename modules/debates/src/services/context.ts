import { CharacterRepository, formatYear, impliedConstraints } from '@philax/characters';
import type { Db } from '@philax/database';
import { TopicRepository, type TopicRecord } from '@philax/topics';
import { AppError, type Character, type TopicAnalysis } from '@philax/types';
import type { DebatePlan } from '../domain/plan';
import { DebateRepository, type DebateRecord } from '../repositories/debate-repository';
import { EvidenceRepository, type EvidenceItem } from '../repositories/evidence-repository';
import { MessageRepository, type StoredMessage } from '../repositories/message-repository';
import { ParticipantRepository, type ParticipantRow } from '../repositories/participant-repository';
import { RoundRepository, type RoundRow } from '../repositories/round-repository';

export interface SpeakerProfile {
  participant: ParticipantRow;
  character: Character;
  lifespan: string;
  constraints: string[];
}

/** Everything a debate operation needs, loaded once per request. */
export interface DebateContext {
  debate: DebateRecord;
  topic: TopicRecord;
  analysis: TopicAnalysis;
  plan: DebatePlan;
  speakers: Map<string, SpeakerProfile>;
  participants: ParticipantRow[];
  evidence: EvidenceItem[];
  messages: StoredMessage[];
  rounds: RoundRow[];
}

export interface Repos {
  debates: DebateRepository;
  topics: TopicRepository;
  participants: ParticipantRepository;
  rounds: RoundRepository;
  messages: MessageRepository;
  evidence: EvidenceRepository;
  characters: CharacterRepository;
}

export function createRepos(db: Db): Repos {
  return {
    debates: new DebateRepository(db),
    topics: new TopicRepository(db),
    participants: new ParticipantRepository(db),
    rounds: new RoundRepository(db),
    messages: new MessageRepository(db),
    evidence: new EvidenceRepository(db),
    characters: new CharacterRepository(db),
  };
}

export function lifespanOf(c: Pick<Character, 'birthYear' | 'deathYear'>): string {
  if (c.deathYear === null)
    return c.birthYear !== null ? `b. ${formatYear(c.birthYear)}` : 'contemporary';
  return `${c.birthYear !== null ? formatYear(c.birthYear) : '?'}–${formatYear(c.deathYear)}`;
}

export async function loadContext(repos: Repos, debate: DebateRecord): Promise<DebateContext> {
  const topic = await repos.topics.get(debate.topicId);
  if (!topic?.analysis || !debate.plan)
    throw new AppError('INVALID_STATE', 'The debate has not been prepared yet.');
  const [participants, evidence, messages, rounds] = await Promise.all([
    repos.participants.list(debate.id),
    repos.evidence.list(debate.id),
    repos.messages.list(debate.id),
    repos.rounds.list(debate.id),
  ]);
  const speakers = new Map<string, SpeakerProfile>();
  for (const p of participants) {
    const character = await repos.characters.getFull(p.characterId);
    if (!character)
      throw new AppError('INTERNAL', 'A debate participant is missing from the knowledge base.');
    speakers.set(p.characterId, {
      participant: p,
      character,
      lifespan: lifespanOf(character),
      constraints: [...character.constraints, ...impliedConstraints(character)].map((c) => c.rule),
    });
  }
  return {
    debate,
    topic,
    analysis: topic.analysis,
    plan: debate.plan,
    speakers,
    participants,
    evidence,
    messages,
    rounds,
  };
}

export function speakerName(
  ctx: Pick<DebateContext, 'speakers'>,
  m: StoredMessage,
  userLabel = 'User',
): string {
  return m.speaker.type === 'user'
    ? userLabel
    : (ctx.speakers.get(m.speaker.characterId)?.character.displayName ?? 'Participant');
}
