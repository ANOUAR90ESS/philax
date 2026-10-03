import { generateStructured, type LLMGateway } from '@philax/ai';
import { topicAnalyzerPrompt } from '@philax/prompts';
import { TopicAnalysisSchema, type NormalizedInput, type TopicAnalysis } from '@philax/types';
import { validateAnalysis } from '../domain/validate-analysis';

export interface AnalyzerCatalogEntry {
  slug: string;
  label: string;
  description: string;
}

export interface TopicAnalysisResult {
  analysis: TopicAnalysis;
  promptVersion: string;
}

/** Topic Analyzer (§7–8): NormalizedInput → validated TopicAnalysis (strong tier). */
export class TopicAnalyzer {
  constructor(private readonly gateway: LLMGateway) {}

  async analyze(
    input: NormalizedInput,
    catalog: AnalyzerCatalogEntry[],
    trace: { topicId?: string; debateId?: string } = {},
  ): Promise<TopicAnalysisResult> {
    const prompt = topicAnalyzerPrompt.build({
      content: input.rawContent,
      contentType: input.contentType,
      title: input.title,
      sourceUrl: input.sourceUrl,
      detectedLanguage: input.language,
      catalog,
    });
    const slugs = new Set(catalog.map((c) => c.slug));
    const { data } = await generateStructured(
      this.gateway,
      {
        tier: 'strong',
        operation: 'topic.analyze',
        promptVersion: prompt.version,
        system: prompt.system,
        messages: prompt.messages,
        maxOutputTokens: 6000,
        trace,
      },
      TopicAnalysisSchema,
      { refine: (d) => validateAnalysis(d as TopicAnalysis, slugs) },
    );
    return { analysis: data, promptVersion: prompt.version };
  }
}
