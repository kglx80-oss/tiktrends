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

export interface ImagePromptOpts {
  brand?: string;
  tone?: string;
  colors?: string[];        // codes hex de la DA
  usp?: string;             // propositions de valeur
  productName?: string;
  productDesc?: string;
  withText?: boolean;       // texte lisible attendu (Ideogram)
  headline?: string;        // texte exact à écrire sur l'image
  product?: boolean;        // mise en scène produit (image de départ)
  edit?: boolean;           // édition fidèle Kontext (garder le produit intact, restyler la scène)
  edenRules?: string;       // règles créatives maison (EDEN), priorité absolue
}

/** Formatte les règles maison EDEN en directive prioritaire pour le modèle. */
function edenDirective(rules?: string): string {
  const r = (rules || '').trim();
  return r ? `HOUSE RULES (EDEN) · absolute top priority, override anything else: ${r.replace(/\n/g, '; ').slice(0, 900)}.` : '';
}

/** Transforme une description en prompt image optimisé (Flux/Ideogram), ancré sur la marque. */
export async function enhanceImagePrompt(client: Anthropic, desc: string, opts: ImagePromptOpts = {}): Promise<string> {
  const textRule = opts.withText
    ? (opts.headline
        ? `The image MUST render this exact on-image text, cleanly and legibly, well placed for an ad: "${opts.headline}".`
        : 'Include a short, punchy on-image headline (max 6 words) derived from the brand value props, rendered cleanly.')
    : 'Avoid gibberish text on the image.';

  // Mode édition (Kontext) : on part d'une VRAIE photo produit → l'instruction doit préserver le packaging.
  if (opts.edit) {
    const sys = [
      'You write ONE concise English EDIT instruction for an image-editing model (Flux Kontext) that receives the real product photo as input.',
      'Output the instruction only · no preamble, no quotes.',
      'Absolute rule: keep the product EXACTLY as in the input photo · same bottle/packaging shape, same label, same logo, same text, same colors and proportions. Do NOT redesign, relabel, or replace the product.',
      'Only change the surrounding scene: background, surface, props, lighting and composition, to build a premium advertising shot.',
      'Be specific about the new scene, surface, lighting and mood. Photoreal, advertising quality.',
      textRule,
      opts.productName ? `Product: ${opts.productName}${opts.productDesc ? ` · ${opts.productDesc.slice(0, 240)}` : ''}.` : '',
      opts.brand ? `Brand: ${opts.brand}.` : '',
      opts.tone ? `Brand tone/mood: ${opts.tone}.` : '',
      opts.colors && opts.colors.length ? `Bias the scene palette toward the brand colors: ${opts.colors.join(', ')}.` : '',
      opts.usp ? `Evoke these value props through the setting: ${opts.usp.replace(/\n/g, '; ').slice(0, 300)}.` : '',
      edenDirective(opts.edenRules),
    ].filter(Boolean).join(' ');
    const res = await client.messages.create({
      model: GEN_MODEL, max_tokens: 500, system: sys,
      messages: [{ role: 'user', content: `Desired scene: ${desc.slice(0, 1000)}` }],
    });
    return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ').trim() || desc;
  }

  const sys = [
    'You write ONE concise, high-quality English prompt for an ad-creative image model (Flux / Ideogram).',
    'Output the prompt only · no preamble, no quotes.',
    'Be specific about subject, composition, lighting, mood, lens and background · advertising quality, photoreal unless asked otherwise.',
    textRule,
    opts.product ? 'Feature the real product faithfully (do not distort its packaging or logo).' : '',
    opts.productName ? `Product: ${opts.productName}${opts.productDesc ? ` · ${opts.productDesc.slice(0, 240)}` : ''}.` : '',
    opts.brand ? `Brand: ${opts.brand}.` : '',
    opts.tone ? `Brand tone/mood: ${opts.tone}.` : '',
    opts.colors && opts.colors.length ? `Use the brand color palette as the dominant colors: ${opts.colors.join(', ')}.` : '',
    opts.usp ? `Convey these value propositions visually: ${opts.usp.replace(/\n/g, '; ').slice(0, 300)}.` : '',
    edenDirective(opts.edenRules),
  ].filter(Boolean).join(' ');
  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 500, system: sys,
    messages: [{ role: 'user', content: `Idea: ${desc.slice(0, 1000)}` }],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ').trim() || desc;
}

/** Propose une idée de scène visuelle (FR) pour une pub, ancrée sur la marque + produit. */
export async function suggestImageBrief(client: Anthropic, ctx: {
  brand?: string; tone?: string; colors?: string[]; usp?: string; audience?: string;
  productName?: string; productDesc?: string;
}): Promise<string> {
  const sys = [
    "Tu proposes UNE idée de visuel publicitaire concret et tournable, en français, en 1 à 2 phrases.",
    "Décris la scène : sujet, décor, ambiance, lumière, cadrage · pas de blabla, pas de guillemets, juste la description.",
    "Reste fidèle à la marque et mets le produit en valeur.",
  ].join(' ');
  const info = [
    ctx.brand ? `Marque : ${ctx.brand}.` : '',
    ctx.productName ? `Produit : ${ctx.productName}${ctx.productDesc ? ` · ${ctx.productDesc.slice(0, 240)}` : ''}.` : '',
    ctx.tone ? `Ton : ${ctx.tone}.` : '',
    ctx.audience ? `Cible : ${ctx.audience}.` : '',
    ctx.usp ? `Atouts : ${ctx.usp.replace(/\n/g, '; ').slice(0, 300)}.` : '',
    ctx.colors?.length ? `Couleurs de marque : ${ctx.colors.join(', ')}.` : '',
    'Propose une idée de visuel.',
  ].filter(Boolean).join('\n');
  const res = await client.messages.create({ model: GEN_MODEL, max_tokens: 300, system: sys, messages: [{ role: 'user', content: info }] });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ').trim();
}

/** Propose une consigne de MOUVEMENT vidéo (FR) pour animer un visuel produit, ancrée marque. */
export async function suggestVideoBrief(client: Anthropic, ctx: {
  brand?: string; tone?: string; productName?: string; productDesc?: string; fromImage?: boolean; edenRules?: string;
}): Promise<string> {
  const eden = (ctx.edenRules || '').trim();
  const sys = [
    "Tu écris UNE consigne de mouvement concise EN FRANÇAIS pour une courte vidéo pub verticale (modèle Kling).",
    "Rends la consigne seule, sans préambule, sans guillemets, sans tiret cadratin.",
    ctx.fromImage
      ? "L'image de départ montre déjà le produit. Décris uniquement le mouvement de caméra et les micro-animations : léger travelling avant lent, doux mouvement orbital, parallaxe subtile, variations de lumière, reflets discrets sur le produit. Le produit reste identique et stable."
      : "Décris un joli plan produit de 5 s : sujet, décor, lumière, et un mouvement de caméra fluide et cinématographique.",
    "Qualité publicitaire, cinématographique, photoréaliste, aucun texte à l'écran.",
    ctx.productName ? `Produit : ${ctx.productName}${ctx.productDesc ? ` · ${ctx.productDesc.slice(0, 180)}` : ''}.` : '',
    ctx.brand ? `Marque : ${ctx.brand}.` : '',
    ctx.tone ? `Ambiance : ${ctx.tone}.` : '',
    eden ? `RÈGLES MAISON (EDEN) à respecter en priorité absolue : ${eden.replace(/\n/g, '; ').slice(0, 700)}.` : '',
  ].filter(Boolean).join(' ');
  const res = await client.messages.create({ model: GEN_MODEL, max_tokens: 220, system: sys, messages: [{ role: 'user', content: 'Rédige la consigne de mouvement.' }] });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join(' ').trim().replace(/[—–]/g, ',');
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
