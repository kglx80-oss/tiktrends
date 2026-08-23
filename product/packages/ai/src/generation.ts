import Anthropic from '@anthropic-ai/sdk';
export const GEN_MODEL = process.env.ANTHROPIC_GEN_MODEL ?? 'claude-sonnet-5';

/** Client Anthropic depuis l'environnement (null si clé absente). */
export function anthropicFromEnv(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  return apiKey ? new Anthropic({ apiKey }) : null;
}

/* ============ Génération créative structurée (Studio, CDC §F9) ============ */
export interface CreativeBrief {
  product: string;              // produit / marque / offre
  audience?: string;            // cible
  angle?: string;               // angle / promesse
  tone?: string;                // ton
  platform?: 'tiktok' | 'meta';
  language?: string;            // défaut fr
  inspiration?: string;         // copy d'une créa gagnante à réinterpréter
}
export interface CreativeScriptBeat { time: string; line: string }
export interface CreativeOutput {
  angles: string[];
  hooks: string[];
  script: CreativeScriptBeat[];
  primaryTexts: string[];
  captions: string[];
}

const CREATIVE_TOOL = {
  name: 'return_creative',
  description: 'Renvoie la créative structurée (angles, hooks, script, textes, légendes).',
  input_schema: {
    type: 'object',
    properties: {
      angles: { type: 'array', items: { type: 'string' }, description: '3 à 5 angles/promesses distincts' },
      hooks: { type: 'array', items: { type: 'string' }, description: "5 à 8 hooks d'accroche (0-3 s)" },
      script: {
        type: 'array',
        items: { type: 'object', properties: { time: { type: 'string' }, line: { type: 'string' } }, required: ['time', 'line'] },
        description: 'Script seconde par seconde (repère temps + réplique/action)',
      },
      primaryTexts: { type: 'array', items: { type: 'string' }, description: "3 textes d'annonce (primary text)" },
      captions: { type: 'array', items: { type: 'string' }, description: '3 légendes courtes + hashtags' },
    },
    required: ['angles', 'hooks', 'script', 'primaryTexts', 'captions'],
  },
} as const;

export function buildCreativeSystem(): string {
  return [
    "Tu es le Studio créatif de TikTrends, expert en publicités performantes TikTok-first (puis Meta).",
    "Tu écris en français, direct, natif de la plateforme, orienté conversion.",
    "Tu t'inspires des mécaniques gagnantes (hook fort en 2 s, tension, preuve, CTA clair) sans copier.",
    "Rends TOUJOURS ta réponse via l'outil return_creative.",
  ].join(' ');
}

export function buildCreativeUserPrompt(b: CreativeBrief): string {
  const lines = [
    `Produit / marque : ${b.product}.`,
    b.audience ? `Cible : ${b.audience}.` : '',
    b.angle ? `Angle souhaité : ${b.angle}.` : '',
    b.tone ? `Ton : ${b.tone}.` : '',
    `Plateforme : ${b.platform === 'meta' ? 'Meta (Facebook/Instagram)' : 'TikTok'}.`,
    `Langue : ${b.language ?? 'fr'}.`,
    b.inspiration ? `Inspiration (créa gagnante à réinterpréter, ne pas plagier) : """${b.inspiration.slice(0, 800)}"""` : '',
    'Génère des angles, hooks, un script vidéo seconde par seconde, des textes d’annonce et des légendes.',
  ];
  return lines.filter(Boolean).join('\n');
}

export async function generateCreative(client: Anthropic, b: CreativeBrief): Promise<CreativeOutput> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 2500,
    system: buildCreativeSystem(),
    tools: [CREATIVE_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_creative' },
    messages: [{ role: 'user', content: buildCreativeUserPrompt(b) }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: CreativeOutput } | undefined;
  if (!tool?.input) throw new Error('Génération vide (aucune sortie structurée).');
  return tool.input;
}

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
