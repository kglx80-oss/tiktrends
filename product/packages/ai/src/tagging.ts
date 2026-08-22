import Anthropic from '@anthropic-ai/sdk';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TagTaxonomy } from './taxonomy';

export const TAGGING_MODEL = process.env.ANTHROPIC_TAGGING_MODEL ?? 'claude-sonnet-4-5';

export interface TaggingInput {
  platform: 'tiktok' | 'meta';
  transcript?: string;
  ocrText?: string;
  durationS?: number;
  productShownAtS?: number;
  language?: string;
  hookVerbatim?: string;
}

export function buildTaggingPrompt(i: TaggingInput): string {
  return [
    "Tu es un directeur créatif expert en publicités court-format (TikTok, Meta).",
    "Analyse la créative ci-dessous et renvoie UNIQUEMENT les tags via l'outil `emit_tags`.",
    `Plateforme : ${i.platform}. Langue : ${i.language ?? 'fr'}. Durée : ${i.durationS ?? '?'}s.`,
    i.hookVerbatim ? `Hook (0-3s) : "${i.hookVerbatim}"` : '',
    i.transcript ? `Transcription :\n${i.transcript}` : '',
    i.ocrText ? `Textes à l'écran (OCR) :\n${i.ocrText}` : '',
    "Respecte STRICTEMENT l'énumération de chaque dimension. `hook_verbatim` = transcription exacte des 3 premières secondes.",
    "Fournis un score de confiance 0-1 par dimension clé.",
  ].filter(Boolean).join('\n');
}

/** Tagging IA d'une créative -> JSON strict conforme à la taxonomie (§5.5).
 *  Utilise le tool use (structured output) + validation Zod. */
export async function tagCreative(client: Anthropic, input: TaggingInput): Promise<TagTaxonomy> {
  const schema = zodToJsonSchema(TagTaxonomy, { name: 'TagTaxonomy' });
  const res = await client.messages.create({
    model: TAGGING_MODEL,
    max_tokens: 2000,
    tools: [{ name: 'emit_tags', description: 'Renvoie les tags de la créative', input_schema: schema as never }],
    tool_choice: { type: 'tool', name: 'emit_tags' },
    messages: [{ role: 'user', content: buildTaggingPrompt(input) }],
  });
  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') throw new Error('tagging: pas de tool_use');
  return TagTaxonomy.parse(block.input); // validé -> retry côté appelant si échec
}
