import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';

/* ============ Extraction de la DA VISUELLE depuis le site ============ */

/**
 * La direction artistique visuelle d'une marque, déduite de son site · elle
 * décrit le STYLE (photo, ambiance, lumière, ce qu'on évite), pas la scène. Sa
 * forme correspond à `DaVisuelleMarque` de `@tiktrends/core` · l'appelant la
 * range dans `brandKit`, où la génération la lit et la tourne en contrainte.
 *
 * On ne rend PAS la scène (c'est la rotation de directions qui varie le décor) ·
 * on rend l'identité de marque à tenir sur CHAQUE créa.
 */
export interface VisualDaDraft {
  style?: string;
  ambiance?: string;
  lumiere?: string;
  photo?: string;
  couleurs?: string;
  aEviter?: string[];
}

const VISUAL_DA_TOOL = {
  name: 'return_visual_da',
  description: 'Renvoie la direction artistique VISUELLE de la marque, déduite de son site · le style à tenir sur chaque créa, pas la scène.',
  input_schema: {
    type: 'object',
    properties: {
      style: { type: 'string', description: 'Style visuel d’ensemble en une phrase concrète (ex : « éditorial minimaliste, beaucoup de blanc, cadrages nets »)' },
      photo: { type: 'string', description: 'Style de photographie/rendu (ex : « macro produit sur fond texturé », « lifestyle lumineux », « studio fond uni »)' },
      ambiance: { type: 'string', description: 'Ambiance / registre émotionnel (ex : « premium et rassurant », « énergique et pop »)' },
      lumiere: { type: 'string', description: 'Qualité de lumière (ex : « lumière naturelle douce, ombres tenues »)' },
      couleurs: { type: 'string', description: 'Ressenti de la palette en mots, cohérent avec les couleurs fournies (ex : « tons crème et vert sauge, contrastes doux »)' },
      aEviter: { type: 'array', items: { type: 'string' }, description: '2 à 5 choses à proscrire pour rester fidèle à la marque (ex : « rendu stock », « dégradés criards », « surcharge »)' },
    },
    required: ['style', 'photo', 'ambiance', 'lumiere', 'couleurs', 'aEviter'],
  },
} as const;

export function buildVisualDaSystem(): string {
  return [
    "Tu es le directeur artistique de TikTrends.",
    "À partir du nom, de l'URL, du contenu texte d'un site et de sa palette de couleurs, tu déduis la DIRECTION ARTISTIQUE VISUELLE de la marque · le style à tenir sur chaque publicité.",
    'Tu décris un STYLE (photographie, ambiance, lumière, ressenti de couleur, ce qu’on évite), jamais une scène précise · le décor variera d’une créa à l’autre, le style non.',
    'Tu écris en français, concret et actionnable pour un modèle d’image, sans jargon ni superlatifs vides.',
    'Fonde-toi sur des indices réels du site (vocabulaire, positionnement, catégorie, couleurs) · si un indice manque, propose une hypothèse cohérente avec la catégorie, sans inventer de faits.',
    "Rends TOUJOURS ta réponse via l'outil return_visual_da.",
  ].join(' ');
}

export function buildVisualDaUserPrompt(i: { name: string; url?: string; siteText?: string; colors?: string[] }): string {
  return [
    `Marque : ${i.name}.`,
    i.url ? `Site : ${i.url}.` : '',
    i.colors?.length ? `Palette extraite du site : ${i.colors.slice(0, 6).join(', ')}.` : '',
    i.siteText ? `Contenu extrait du site (tronqué) :\n"""${i.siteText.slice(0, 8000)}"""` : '(Aucun contenu de site fourni : déduis à partir du nom, de la catégorie probable et de la palette.)',
    'Déduis la direction artistique visuelle demandée par l’outil · le style maison, pas une scène.',
  ].filter(Boolean).join('\n');
}

export async function extractVisualDa(
  client: Anthropic,
  i: { name: string; url?: string; siteText?: string; colors?: string[] },
): Promise<VisualDaDraft> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1200,
    system: buildVisualDaSystem(),
    tools: [VISUAL_DA_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_visual_da' },
    messages: [{ role: 'user', content: buildVisualDaUserPrompt(i) }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: unknown } | undefined;
  if (!tool?.input) throw new Error('DA visuelle vide (aucune sortie structurée).');
  return normaliserDraft(tool.input);
}

/**
 * Le modèle respecte le schéma la plupart du temps · pas toujours. `aEviter`
 * revient parfois en chaîne, un champ parfois absent. On range la DA propre
 * (chaînes sûres, `aEviter` tableau de chaînes) AVANT de la stocker · une DA
 * malformée dans brandKit faisait tomber le rendu de la marque et la génération.
 */
function normaliserDraft(input: unknown): VisualDaDraft {
  const o = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
  const txt = (v: unknown): string | undefined => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s || undefined;
  };
  const eviter = Array.isArray(o.aEviter)
    ? o.aEviter
    : (typeof o.aEviter === 'string' ? o.aEviter.split(/[\n,]/) : []);
  const aEviter = eviter.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean);
  return {
    style: txt(o.style), photo: txt(o.photo), ambiance: txt(o.ambiance),
    lumiere: txt(o.lumiere), couleurs: txt(o.couleurs),
    ...(aEviter.length ? { aEviter } : {}),
  };
}
