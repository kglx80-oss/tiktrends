import Anthropic from '@anthropic-ai/sdk';

/**
 * ADSMAP · agent A0, analyse d'asset créatif (§8.2).
 *
 * Il ne juge pas. Il DÉCRIT : quelle accroche, quelle ouverture, qui est à
 * l'écran, quelles promesses, quelles preuves. Le jugement est le travail du
 * moteur de verdict, sur des chiffres · confondre les deux ferait revenir
 * l'opinion par la fenêtre au moment précis où le module cherche à s'en passer.
 *
 * Ce que ça change : la mémoire de Jarvis lit déjà `hookType`, `openingType` et
 * `talent`, et ces colonnes sont vides. Les remplir fait passer « le mécanisme
 * listicle marche ici » à « les accroches chiffrées gagnent 3 fois sur 8 tests
 * concluants ». Aucune statistique nouvelle à écrire · seulement de la matière.
 *
 * La normalisation dans la taxonomie fermée vit dans `@tiktrends/core` et n'est
 * pas ici : ce fichier appelle le modèle, il ne décide pas des catégories.
 */

const GEN_MODEL = process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5';

const ANALYSIS_TOOL = {
  name: 'return_asset_analysis',
  description: 'Renvoie la description structurée d’une créa publicitaire.',
  input_schema: {
    type: 'object',
    properties: {
      hookType: { type: ['string', 'null'], description: 'Type d’accroche : question | statement | callout | number | negative | curiosity | demonstration | testimonial. null si indéterminable.' },
      openingType: { type: ['string', 'null'], description: 'Nature du premier plan : face_talking | product | problem_scene | text_on_screen | before_after | unboxing | b_roll. null si indéterminable.' },
      talent: { type: ['string', 'null'], description: 'Qui porte la créa : ugc_creator | founder | actor | customer | voice_over_only | none. null si indéterminable.' },
      hookSpoken: { type: ['string', 'null'], description: 'Les mots exacts de l’accroche, tels qu’ils apparaissent ou sont dits. Ne reformule pas.' },
      claims: { type: 'array', items: { type: 'string' }, description: 'Promesses faites, une par entrée, telles qu’énoncées.' },
      proofElements: { type: 'array', items: { type: 'string' }, description: 'Éléments de preuve visibles : avis, chiffre, démonstration, label, avant/après.' },
      durationS: { type: ['number', 'null'], description: 'Durée en secondes si connue ou visible. null pour un visuel fixe.' },
      productFirstSec: { type: ['number', 'null'], description: 'Seconde à laquelle le produit apparaît pour la première fois.' },
      ctaFirstSec: { type: ['number', 'null'], description: 'Seconde à laquelle l’appel à l’action apparaît.' },
      cutsFirst10s: { type: ['number', 'null'], description: 'Nombre de coupes dans les 10 premières secondes.' },
      hasCaptions: { type: ['boolean', 'null'], description: 'Sous-titres incrustés présents.' },
      confidence: { type: 'number', description: 'Confiance globale entre 0 et 1. Sois honnête : une image seule ne dit rien du rythme.' },
    },
    required: ['hookType', 'openingType', 'talent', 'claims', 'proofElements', 'confidence'],
  },
} as const;

const SYSTEM = [
  'Tu décris une créa publicitaire pour une bibliothèque interne, en français.',
  'Tu DÉCRIS, tu ne juges pas : aucune appréciation de qualité, aucune recommandation.',
  'Reprends les mots de la créa pour l’accroche et les promesses · ne reformule pas, ne réécris pas.',
  'Quand un élément n’est pas déterminable depuis ce qu’on te donne, réponds null et baisse ta confiance.',
  'Une image fixe ne renseigne ni la durée, ni le rythme, ni les coupes · ne les invente pas.',
  'Rends TOUJOURS ta réponse via l’outil return_asset_analysis.',
].join(' ');

export interface AssetInput {
  /** Image (data URI ou URL publique) · une frame suffit pour l'ouverture et le talent. */
  imageUrl?: string | null;
  /** Transcription ou texte incrusté · c'est ce qui renseigne l'accroche et les promesses. */
  transcript?: string | null;
  /** Texte de l'annonce, s'il existe côté régie. */
  copy?: string | null;
  /** Durée connue par ailleurs · le modèle n'a pas à la deviner. */
  knownDurationS?: number | null;
  format?: string | null;
}

/** Sortie brute du modèle · la normalisation est faite par `@tiktrends/core`. */
export interface RawAssetAnalysisOut {
  hookType?: string | null; openingType?: string | null; talent?: string | null;
  hookSpoken?: string | null; claims?: string[]; proofElements?: string[];
  durationS?: number | null; productFirstSec?: number | null; ctaFirstSec?: number | null;
  cutsFirst10s?: number | null; hasCaptions?: boolean | null; confidence?: number;
}

/**
 * Le SDK installé ne type pas encore la source `url` · on passe par `unknown`,
 * comme le fait déjà `describeAssetImage`, plutôt que d'aligner la version du
 * SDK pour une seule fonction.
 */
function imageBlock(url: string): Anthropic.ImageBlockParam | null {
  const m = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(url);
  if (m) return { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } } as unknown as Anthropic.ImageBlockParam;
  if (/^https?:\/\//.test(url)) return { type: 'image', source: { type: 'url', url } } as unknown as Anthropic.ImageBlockParam;
  return null;
}

/**
 * Analyse un asset.
 *
 * Sans image NI texte, on ne lance pas d'appel : un modèle à qui on ne donne
 * rien remplit quand même le formulaire, et ces valeurs-là entreraient dans les
 * statistiques comme si elles avaient été observées.
 */
export async function analyzeAdAsset(client: Anthropic, input: AssetInput): Promise<RawAssetAnalysisOut | null> {
  const image = input.imageUrl ? imageBlock(input.imageUrl) : null;
  const texte = [
    input.format ? `Format déclaré : ${input.format}.` : '',
    input.knownDurationS ? `Durée connue : ${input.knownDurationS} secondes · reprends-la telle quelle.` : '',
    input.transcript ? `Transcription / texte à l’écran :\n${input.transcript.slice(0, 6000)}` : '',
    input.copy ? `Texte de l’annonce :\n${input.copy.slice(0, 2000)}` : '',
  ].filter(Boolean).join('\n\n');

  if (!image && !texte.trim()) return null;

  const content: Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> = [];
  if (image) content.push(image);
  content.push({ type: 'text', text: texte || 'Décris cette créa à partir du visuel seul.' });

  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1200,
    system: SYSTEM,
    tools: [ANALYSIS_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_asset_analysis' },
    messages: [{ role: 'user', content }],
  });

  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: RawAssetAnalysisOut } | undefined;
  return tool?.input ?? null;
}
