import Anthropic from '@anthropic-ai/sdk';
import { RadarScore } from './radar-schema';

export const RADAR_MODEL = process.env.ANTHROPIC_RADAR_MODEL ?? 'claude-sonnet-4-5';

export interface RadarRecoInput {
  creative: { title: string; tags: Record<string, unknown>; transcript?: string };
  grades: { hook: string; hold: string; ctr: string; conv: string; overall: string };
  diagnosis: string[];
  accountWinners: Array<{ title: string; tags: Record<string, unknown> }>;
  brandKit?: Record<string, unknown>;
}

/** Génère persona détecté + recommandations priorisées (avec exemple réécrit). */
export async function generateRadarRecommendations(client: Anthropic, i: RadarRecoInput): Promise<Pick<RadarScore, 'persona_detected' | 'recommendations'>> {
  const prompt = [
    "Tu es un directeur créatif. À partir des grades Radar, du diagnostic, des tags de la créa et des winners du compte,",
    "produis le persona cible détecté et 3 à 5 recommandations priorisées, chacune avec un exemple concret réécrit (ex: réécris le hook).",
    `Créa: ${i.creative.title}\nGrades: ${JSON.stringify(i.grades)}\nDiagnostic: ${i.diagnosis.join('; ')}`,
    `Tags: ${JSON.stringify(i.creative.tags)}\nWinners du compte: ${JSON.stringify(i.accountWinners.slice(0, 5))}`,
    i.creative.transcript ? `Transcript: ${i.creative.transcript}` : '',
  ].filter(Boolean).join('\n');

  const res = await client.messages.create({
    model: RADAR_MODEL, max_tokens: 1200,
    tools: [{
      name: 'emit_reco', description: 'persona + recommandations',
      input_schema: {
        type: 'object', required: ['persona_detected', 'recommendations'],
        properties: {
          persona_detected: { type: 'string' },
          recommendations: {
            type: 'array', maxItems: 5,
            items: { type: 'object', required: ['priority', 'title', 'rewritten_example'], properties: { priority: { type: 'integer' }, title: { type: 'string' }, rewritten_example: { type: 'string' } } },
          },
        },
      } as never,
    }],
    tool_choice: { type: 'tool', name: 'emit_reco' },
    messages: [{ role: 'user', content: prompt }],
  });
  const b = res.content.find((x) => x.type === 'tool_use');
  if (!b || b.type !== 'tool_use') throw new Error('reco: pas de tool_use');
  return RadarScore.pick({ persona_detected: true, recommendations: true }).parse(b.input);
}
