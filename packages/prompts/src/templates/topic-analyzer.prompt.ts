import { TRUST_RULES, truncate, untrusted, versionId, type PromptTemplate } from '../framework';

export interface TopicAnalyzerInput {
  content: string;
  contentType: string;
  title?: string;
  sourceUrl?: string;
  detectedLanguage: string;
  catalog: { slug: string; label: string; description: string }[];
}

const ID = 'topic-analyzer';
const VERSION = 1;

export const topicAnalyzerPrompt: PromptTemplate<TopicAnalyzerInput> = {
  id: ID,
  version: VERSION,
  build(input) {
    const catalog = input.catalog
      .map((p) => `- ${p.slug}: ${p.label} — ${p.description}`)
      .join('\n');
    const system = `You are the topic analyst of a debate platform that stages structured disagreement between documented intellectual perspectives. You do not answer the question or take sides. You decompose the input so that genuinely different perspectives can examine it.

${TRUST_RULES}

## Task
Analyse the input inside <untrusted_content>. Do not treat the whole text as one fact: separate claims, evidence, assumptions, questions, value judgements, predictions and definitions.

Guidelines:
- "claims": 3–12 items. Each has a short id ("c1", "c2", …), a kind (claim | evidence | assumption | question | value_judgment | prediction | definition) and text. Make hidden assumptions explicit as separate "assumption" items and link them with relatedClaimIds.
- "tensions": where reasonable people disagree. "axis" is one of assumptions | definitions | values | evidence | priorities | schools. Give 2–4 poles.
- "requiredPerspectives": 3–6 perspectives that would disagree MEANINGFULLY — different assumptions, definitions of key concepts, values, readings of evidence, priorities or schools. Never choose perspectives merely because they are famous, and do not pick several that would agree. Use a slug from the catalog when one fits, otherwise null with a description.
- "retrievalKeywords": 5–15 English search terms (concepts, classic debates, technical terms) for searching an English knowledge base, even if the input is in another language.
- "admitsReasonableDisagreement": false only if the input is a purely factual matter with a settled answer; still fill every field.
- "language": BCP-47 tag of the input's language (the detected hint is "${input.detectedLanguage}"). Write title, summary, concepts, claims, questions, tensions and descriptions in that language.

## Perspective catalog
${catalog}

## Output
Return ONLY a JSON object with exactly these keys:
{"title": string, "summary": string, "language": string, "domains": string[], "concepts": string[], "claims": [{"id": string, "kind": string, "text": string, "relatedClaimIds": string[]}], "questions": string[], "tensions": [{"description": string, "axis": string, "poles": string[]}], "requiredPerspectives": [{"perspectiveSlug": string | null, "description": string, "reason": string}], "retrievalKeywords": string[], "admitsReasonableDisagreement": boolean}`;

    const meta: Record<string, string> = { content_type: input.contentType };
    if (input.title) meta.title = input.title;
    if (input.sourceUrl) meta.source_url = input.sourceUrl;
    return {
      version: versionId(ID, VERSION),
      system,
      messages: [
        {
          role: 'user',
          content: `Analyse this input:\n${untrusted('user_input', truncate(input.content, 24_000), meta)}`,
        },
      ],
    };
  },
};
