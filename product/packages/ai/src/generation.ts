import Anthropic from '@anthropic-ai/sdk';
export const GEN_MODEL = process.env.ANTHROPIC_GEN_MODEL ?? 'claude-sonnet-4-5';

export interface ScriptInput { brandName: string; format: string; language?: string; angle?: string; hookCount?: number; }
export function buildScriptPrompt(i: ScriptInput): string {
  return [
    `Écris un script vidéo TikTok "${i.format}" pour ${i.brandName} en ${i.language ?? 'fr'}.`,
    i.angle ? `Angle: ${i.angle}.` : '',
    `Fournis ${i.hookCount ?? 5} hooks alternatifs (0-3 s), puis la structure seconde par seconde et un CTA.`,
  ].filter(Boolean).join(' ');
}
export async function generateScript(client: Anthropic, i: ScriptInput): Promise<string> {
  const res = await client.messages.create({ model: GEN_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: buildScriptPrompt(i) }] });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
}
