import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';

/** Un gabarit de composition publicitaire (couche design posée sur la scène IA). */
export type AdTemplate = 'problem_solution' | 'before_after' | 'testimonial' | 'benefits';
export const AD_TEMPLATES: AdTemplate[] = ['problem_solution', 'before_after', 'testimonial', 'benefits'];

export interface AdConcept {
  template: AdTemplate;
  kicker?: string;         // eyebrow court en MAJUSCULES (2-4 mots), couleur d'accent
  headline: string;        // accroche FR, courte et percutante
  subhead?: string;        // ligne de soutien courte
  cta: string;             // bouton d'action (FR)
  badge?: string;          // pastille (ex : « AVANT / APRÈS », « -30 % »)
  quote?: string;          // témoignage (gabarit testimonial)
  author?: string;         // auteur du témoignage (ex : « Marie, 34 ans »)
  rating?: number;         // note 1..5 (gabarit testimonial)
  benefits?: string[];     // 3 bénéfices courts (gabarit benefits)
  sceneBrief: string;      // brief EN de la scène à générer (sans texte incrusté)
}

export interface AdConceptCtx {
  brand?: string; tone?: string; colors?: string[]; usp?: string; audience?: string; category?: string;
  productName?: string; productDesc?: string; productUsp?: string;
  hasProductPhoto?: boolean;      // vraie photo produit dispo -> scène « edit »
  persona?: { name?: string; pains?: string[]; desires?: string[] };
  objective?: string;             // ex : « ventes », « notoriété », « trafic »
}

const AD_TOOL = {
  name: 'return_ads',
  description: 'Renvoie une liste de concepts publicitaires structurés (un par gabarit demandé).',
  input_schema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        description: 'Un concept par gabarit demandé, dans le même ordre.',
        items: {
          type: 'object',
          properties: {
            template: { type: 'string', enum: AD_TEMPLATES, description: 'Gabarit de composition.' },
            kicker: { type: 'string', description: 'Eyebrow court en MAJUSCULES (2 à 4 mots), affiché en couleur d’accent au-dessus du titre (ex : « FINI LE REPASSAGE », « RÉSULTAT EN 7 JOURS »).' },
            headline: { type: 'string', description: 'Accroche FR très courte (max ~5 mots), orientée bénéfice ou douleur, sans point final.' },
            subhead: { type: 'string', description: 'Ligne de soutien courte (optionnelle).' },
            cta: { type: 'string', description: "Appel à l'action court (FR), ex : « Je découvre », « J'en profite »." },
            badge: { type: 'string', description: 'Pastille courte (ex : « AVANT / APRÈS », « -30 % », « NOUVEAU »).' },
            quote: { type: 'string', description: 'Témoignage client crédible (gabarit testimonial).' },
            author: { type: 'string', description: "Auteur du témoignage, ex : « Marie, 34 ans »." },
            rating: { type: 'number', description: 'Note sur 5 (gabarit testimonial), ex 5.' },
            benefits: { type: 'array', items: { type: 'string' }, description: '3 bénéfices très courts (gabarit benefits).' },
            sceneBrief: { type: 'string', description: 'Brief EN de la scène publicitaire à générer (décor, sujet, lumière, ambiance). AUCUN texte incrusté : le texte est ajouté par-dessus.' },
          },
          required: ['template', 'headline', 'cta', 'sceneBrief'],
        },
      },
    },
    required: ['concepts'],
  },
} as const;

function ctxLines(ctx: AdConceptCtx): string {
  const p = ctx.persona;
  return [
    ctx.brand ? `Marque : ${ctx.brand}.` : '',
    ctx.productName ? `Produit : ${ctx.productName}${ctx.productDesc ? ` — ${ctx.productDesc.slice(0, 240)}` : ''}.` : '',
    ctx.productUsp ? `Atouts produit : ${ctx.productUsp.slice(0, 240)}.` : '',
    ctx.usp ? `Promesses de marque : ${ctx.usp.replace(/\n/g, '; ').slice(0, 300)}.` : '',
    ctx.category ? `Catégorie : ${ctx.category}.` : '',
    ctx.tone ? `Ton : ${ctx.tone}.` : '',
    ctx.audience ? `Cible : ${ctx.audience}.` : '',
    p?.name ? `Persona : ${p.name}${p.pains?.length ? ` — douleurs : ${p.pains.slice(0, 4).join(', ')}` : ''}${p.desires?.length ? ` ; désirs : ${p.desires.slice(0, 4).join(', ')}` : ''}.` : '',
    ctx.objective ? `Objectif : ${ctx.objective}.` : '',
    ctx.hasProductPhoto
      ? "Une VRAIE photo du produit sera fournie au modèle image : les briefs de scène doivent mettre ce produit en situation (le décrire comme « the product »), sans le réinventer."
      : "Pas de photo produit : décris le produit dans la scène de façon générique mais crédible.",
  ].filter(Boolean).join('\n');
}

const CLONE_TOOL = {
  name: 'return_ad',
  description: "Renvoie UN concept publicitaire qui recrée la pub de référence pour NOTRE marque/produit.",
  input_schema: AD_TOOL.input_schema.properties.concepts.items,
} as const;

export interface CloneRefImage { base64: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }

/** Analyse une pub gagnante (vision) et en dérive un concept reproduisant l'angle + la structure, pour NOTRE produit. */
export async function cloneAdFromReference(client: Anthropic, ref: CloneRefImage, ctx: AdConceptCtx): Promise<AdConcept | null> {
  const sys = [
    "Tu es directeur créatif. On te montre une PUBLICITÉ GAGNANTE d'une autre marque.",
    "Objectif : recréer la MÊME logique (angle, structure, type de gabarit, ton de l'accroche, présence d'un CTA, avant/après, témoignage, etc.) mais pour NOTRE marque et NOTRE produit.",
    "Choisis le template le plus proche de la pub de référence parmi : " + AD_TEMPLATES.join(', ') + ".",
    "Écris l'accroche (headline), l'eyebrow (kicker), le CTA en français, adaptés à notre produit.",
    "sceneBrief en anglais : décris une scène qui REPREND l'ambiance/cadrage de la référence mais met en scène NOTRE produit (le décrire comme « the product »). AUCUN texte incrusté.",
    "Ne copie pas la marque ni les mots exacts de la référence : inspire-toi de sa mécanique.",
    "Rends via l'outil return_ad.",
  ].join(' ');
  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 1200, system: sys,
    tools: [CLONE_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_ad' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: ref.mediaType, data: ref.base64 } },
        { type: 'text', text: `Recrée cette pub pour nous.\n\n${ctxLines(ctx)}` },
      ],
    }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: AdConcept } | undefined;
  const c = tool?.input;
  return c && c.headline && c.sceneBrief ? c : null;
}

/** Génère des concepts publicitaires (accroche + CTA + brief de scène) pour les gabarits demandés. */
export async function generateAdConcepts(client: Anthropic, ctx: AdConceptCtx, opts: { templates: AdTemplate[] }): Promise<AdConcept[]> {
  const templates = opts.templates.length ? opts.templates : AD_TEMPLATES;
  const sys = [
    "Tu es directeur créatif d'une agence pub TikTok-first (style Atria).",
    "Tu écris en français, natif de la plateforme, orienté performance : accroches courtes qui claquent, CTA clairs.",
    "Pour CHAQUE gabarit demandé, produis UN concept complet et distinct, cohérent avec la marque et le persona.",
    "Le sceneBrief est en anglais, décrit uniquement l'image (décor, sujet, cadrage, lumière), SANS aucun texte à incruster.",
    "problem_solution : accroche sur la douleur, scène qui montre le soulagement/produit.",
    "before_after : le sceneBrief doit décrire un split visuel gauche/droite AVANT (problème) vs APRÈS (résultat), badge « AVANT / APRÈS ».",
    "testimonial : quote client crédible + author + rating 5 ; scène d'une personne satisfaite avec le produit.",
    "benefits : 3 bénéfices très courts ; scène produit centrée, épurée, premium.",
    "Rends TOUJOURS via l'outil return_ads, un concept par gabarit, dans l'ordre.",
  ].join(' ');
  const user = `${ctxLines(ctx)}\n\nGabarits à produire, dans cet ordre : ${templates.join(', ')}.`;

  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 2000, system: sys,
    tools: [AD_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_ads' },
    messages: [{ role: 'user', content: user }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: { concepts?: AdConcept[] } } | undefined;
  const concepts = tool?.input?.concepts ?? [];
  // On garde l'ordre demandé et on complète les manquants au besoin.
  const byTpl = new Map(concepts.filter((c) => c?.template).map((c) => [c.template, c]));
  return templates.map((t) => byTpl.get(t)).filter((c): c is AdConcept => !!c && !!c.headline && !!c.sceneBrief);
}
