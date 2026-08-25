import Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';

/** Un gabarit de composition publicitaire (couche design posée sur la scène IA). */
export type AdTemplate = 'problem_solution' | 'before_after' | 'testimonial' | 'benefits' | 'ugc' | 'stat' | 'offer';
export const AD_TEMPLATES: AdTemplate[] = ['problem_solution', 'before_after', 'testimonial', 'benefits', 'ugc', 'stat', 'offer'];

/** Univers de direction artistique · change complètement l'ambiance du visuel. */
export interface VisualUniverse { key: string; label: string; prompt: string }
export const VISUAL_UNIVERSES: VisualUniverse[] = [
  { key: 'studio',    label: 'Studio packshot',   prompt: 'Clean studio packshot on a seamless solid-color backdrop, soft gradient lighting, minimal props, premium e-commerce look.' },
  { key: 'lifestyle', label: 'Lifestyle / UGC',   prompt: 'Authentic lifestyle UGC scene, a real person in a natural everyday setting, candid smartphone-style photography, warm natural window light.' },
  { key: 'editorial', label: 'Éditorial premium', prompt: 'High-end editorial magazine style, dramatic directional lighting, elegant negative space, luxury feel, refined color grading.' },
  { key: 'nature',    label: 'Nature / organique',prompt: 'Organic natural setting with fresh plants, stone or wood surfaces, sunlight and soft leaf shadows, healthy and clean mood.' },
  { key: 'bold',      label: 'Couleur pop',       prompt: 'Bold vibrant color-blocked background using the brand colors, playful modern pop aesthetic, strong graphic contrast, studio light.' },
  { key: 'cinematic', label: 'Sombre cinématique',prompt: 'Dark cinematic scene, moody dramatic lighting, deep shadows, crisp rim light on the product, premium nighttime atmosphere.' },
  { key: 'flatlay',   label: 'Flat lay',          prompt: 'Top-down flat-lay composition on a styled surface with a few complementary props arranged around the product, even soft daylight.' },
  { key: 'energy',    label: 'Énergie / sport',   prompt: 'Dynamic energetic active-lifestyle setting (gym or outdoor sport vibe), sense of motion and vitality, bright punchy lighting.' },
];

export interface AdConcept {
  template: AdTemplate;
  kicker?: string;         // eyebrow court en MAJUSCULES (2-4 mots), couleur d'accent
  headline: string;        // accroche FR, courte et percutante
  subhead?: string;        // ligne de soutien courte
  cta: string;             // bouton d'action (FR)
  badge?: string;          // pastille (ex : « AVANT / APRÈS », « -30 % »)
  quote?: string;          // témoignage / caption UGC (gabarits testimonial, ugc)
  author?: string;         // auteur / handle (ex : « Marie, 34 ans », « @lucas »)
  rating?: number;         // note 1..5 (gabarit testimonial)
  benefits?: string[];     // 3 bénéfices courts (gabarit benefits)
  stat?: string;           // chiffre-clé (gabarit stat, ex : « -73% », « x3 »)
  statLabel?: string;      // libellé du chiffre (gabarit stat, ex : « de crashs en moins »)
  sceneBrief: string;      // brief EN de la scène à générer (sans texte incrusté)
}

export interface AdConceptCtx {
  brand?: string; tone?: string; colors?: string[]; usp?: string; audience?: string; category?: string;
  productName?: string; productDesc?: string; productUsp?: string;
  hasProductPhoto?: boolean;      // vraie photo produit dispo -> scène « edit »
  persona?: { name?: string; pains?: string[]; desires?: string[] };
  objective?: string;             // ex : « ventes », « notoriété », « trafic »
  angle?: string;                 // angle précis à décliner (itération ciblée)
  creativeRules?: string;         // règles maison Jarvis à respecter impérativement
  winningPatterns?: string;       // intelligence créative Jarvis (patterns gagnants distillés de la veille)
}

export interface AdAngle { title: string; rationale: string; template?: AdTemplate }

/* ============ Entraînement Jarvis · distillation des patterns gagnants ============ */
export interface WinningAdSummary { advertiser?: string; body?: string; cta?: string; daysRunning?: number; reach?: number; mediaType?: string }

/**
 * Distille des PATTERNS GAGNANTS à partir de pubs qui performent (longévité + reach = signaux
 * de performance). Retourne une « intelligence créative » actionnable, injectée ensuite dans
 * chaque génération pour tirer la performance vers le haut.
 */
export async function distillWinningPatterns(client: Anthropic, ctx: { brand?: string; category?: string; audience?: string }, ads: WinningAdSummary[]): Promise<string> {
  const sorted = [...ads].sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0) || (b.reach ?? 0) - (a.reach ?? 0)).slice(0, 30);
  const corpus = sorted.map((a, i) => {
    const perf = [a.daysRunning ? `${a.daysRunning} j de diffusion` : '', a.reach ? `reach ${a.reach}` : '', a.mediaType].filter(Boolean).join(', ');
    return `${i + 1}. [${a.advertiser || 'annonceur'} · ${perf}] ${(a.body || '').replace(/\s+/g, ' ').slice(0, 200)}${a.cta ? ` · CTA: ${a.cta}` : ''}`;
  }).join('\n');

  const sys = [
    "Tu es analyste créatif PERFORMANCE (niveau Atria/Motion). On te donne des publicités qui PERFORMENT · une longue durée de diffusion et un reach élevé sont des signaux forts de rentabilité (une marque ne laisse pas tourner une pub qui perd).",
    "Distille les PATTERNS GAGNANTS de cette niche, de façon ACTIONNABLE, pour qu'une IA génère des créas plus performantes. Généralise les mécaniques · ne recopie jamais le texte.",
    "Structure EXACTE, en français, sections courtes en puces :",
    "Hooks gagnants : … (types d'accroches qui reviennent)",
    "Angles gagnants : … (promesses/angles récurrents)",
    "Formats gagnants : … (gabarits/mécaniques : témoignage, avant/après, UGC, stat, offre…)",
    "Codes visuels : … (mise en scène, lumière, cadrage qui reviennent)",
    "CTA efficaces : … (formulations d'appel à l'action)",
    "Directives Jarvis : … (3 à 5 consignes concrètes à appliquer pour performer sur cette marque)",
    "Sois spécifique et concis. Pas de blabla, pas de tiret cadratin.",
  ].join('\n');
  const user = [
    ctx.brand ? `Marque à faire performer : ${ctx.brand}.` : '',
    ctx.category ? `Catégorie : ${ctx.category}.` : '',
    ctx.audience ? `Audience : ${ctx.audience}.` : '',
    `\nCorpus de pubs performantes :\n${corpus || '(aucune)'}`,
  ].filter(Boolean).join('\n');

  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 1100, system: sys,
    messages: [{ role: 'user', content: user }],
  });
  return res.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n').trim().replace(/[—–]/g, ',');
}

const ANGLES_TOOL = {
  name: 'return_angles',
  description: "Renvoie des angles publicitaires précis et actionnables, inspirés de ce qui fonctionne.",
  input_schema: {
    type: 'object',
    properties: {
      angles: {
        type: 'array',
        description: '5 à 6 angles distincts, du plus prometteur au moins prometteur.',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: "Angle court et concret (FR), ex : « Focus sans caféine ni crash »." },
            rationale: { type: 'string', description: 'Pourquoi cet angle marche pour cette cible (1 phrase).' },
            template: { type: 'string', enum: AD_TEMPLATES, description: 'Gabarit le plus adapté à cet angle.' },
          },
          required: ['title', 'rationale'],
        },
      },
    },
    required: ['angles'],
  },
} as const;

/** Propose des angles pub précis, en s'appuyant sur la marque + ce qui fonctionne (veille/concurrents). */
export async function suggestAdAngles(client: Anthropic, ctx: AdConceptCtx, sources: { winningCopy?: string[]; competitors?: string[] }): Promise<AdAngle[]> {
  const sys = [
    "Tu es stratège créatif TikTok-first. Tu proposes des ANGLES publicitaires précis (pas des slogans), prêts à décliner.",
    "Appuie-toi sur ce qui fonctionne (pubs gagnantes fournies, concurrents) et sur la marque/persona, mais n'invente pas de fausses promesses.",
    "Des angles VARIÉS : douleur, bénéfice, preuve sociale, comparaison, usage/routine, objection levée.",
    "Rends via l'outil return_angles.",
  ].join(' ');
  const info = [
    ctxLines(ctx),
    sources.competitors?.length ? `Concurrents : ${sources.competitors.slice(0, 12).join(', ')}.` : '',
    sources.winningCopy?.length ? `Extraits de pubs qui fonctionnent (inspiration, ne pas copier) :\n- ${sources.winningCopy.slice(0, 12).map((c) => c.slice(0, 200)).join('\n- ')}` : '',
    'Propose 5 à 6 angles précis à décliner.',
  ].filter(Boolean).join('\n');
  const res = await client.messages.create({
    model: GEN_MODEL, max_tokens: 1200, system: sys,
    tools: [ANGLES_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_angles' },
    messages: [{ role: 'user', content: info }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: { angles?: AdAngle[] } } | undefined;
  return (tool?.input?.angles ?? []).filter((a) => a?.title);
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
            quote: { type: 'string', description: 'Témoignage client (testimonial) OU caption courte et native (ugc).' },
            author: { type: 'string', description: "Auteur / pseudo, ex : « Marie, 34 ans », « @lucas »." },
            rating: { type: 'number', description: 'Note sur 5 (gabarit testimonial), ex 5.' },
            benefits: { type: 'array', items: { type: 'string' }, description: '3 bénéfices très courts (gabarit benefits).' },
            stat: { type: 'string', description: 'Chiffre-clé marquant (gabarit stat), ex : « -73% », « x3 », « 4.9/5 ».' },
            statLabel: { type: 'string', description: 'Libellé sous le chiffre (gabarit stat), ex : « de coups de barre en moins ».' },
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
    ctx.productName ? `Produit : ${ctx.productName}${ctx.productDesc ? ` · ${ctx.productDesc.slice(0, 240)}` : ''}.` : '',
    ctx.productUsp ? `Atouts produit : ${ctx.productUsp.slice(0, 240)}.` : '',
    ctx.usp ? `Promesses de marque : ${ctx.usp.replace(/\n/g, '; ').slice(0, 300)}.` : '',
    ctx.category ? `Catégorie : ${ctx.category}.` : '',
    ctx.tone ? `Ton : ${ctx.tone}.` : '',
    ctx.audience ? `Cible : ${ctx.audience}.` : '',
    p?.name ? `Persona : ${p.name}${p.pains?.length ? ` · douleurs : ${p.pains.slice(0, 4).join(', ')}` : ''}${p.desires?.length ? ` ; désirs : ${p.desires.slice(0, 4).join(', ')}` : ''}.` : '',
    ctx.objective ? `Objectif : ${ctx.objective}.` : '',
    ctx.angle ? `Angle imposé (à décliner sous plusieurs exécutions) : ${ctx.angle}.` : '',
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
export async function generateAdConcepts(client: Anthropic, ctx: AdConceptCtx, opts: { templates: AdTemplate[]; winningCopy?: string[]; competitors?: string[] }): Promise<AdConcept[]> {
  const templates = opts.templates.length ? opts.templates : AD_TEMPLATES;
  const sys = [
    "Tu es un directeur créatif et copywriter direct-response d'élite (TikTok-first, style Atria/Raya).",
    "Objectif : des créas qui STOPPENT le scroll et convertissent. Chaque accroche doit être PERCUTANTE.",
    "Principes de copywriting à appliquer : accroche qui crée une tension ou une curiosité en 3 mots, spécificité (chiffres, détails concrets) plutôt que du générique, bénéfice émotionnel avant la feature, angle inattendu / pattern interrupt, promesse crédible, CTA orienté action.",
    "INTERDIT : slogans plats et vagues (« Boostez votre énergie », « La qualité au meilleur prix »), superlatifs creux, langue de bois. Sois concret, humain, natif de la plateforme.",
    "Tu écris en français. Kicker en MAJUSCULES très court. Headline = 3 à 6 mots max, qui claque.",
    opts.winningCopy?.length
      ? "On te fournit des accroches de PUBS QUI FONCTIONNENT (concurrents / veille) : analyse leurs MÉCANIQUES (type d'accroche, angle, déclencheur émotionnel, structure) et réutilise ces mécaniques gagnantes pour NOTRE produit. Ne recopie jamais les mots : transpose la mécanique."
      : "",
    ctx.angle
      ? "Toutes les exécutions servent le MÊME angle imposé, mais avec des accroches et des scènes NETTEMENT différentes."
      : "Pour chaque gabarit, un concept distinct, cohérent marque + persona.",
    "Le sceneBrief est en anglais, décrit uniquement l'image (décor, sujet, cadrage, lumière), SANS aucun texte à incruster.",
    "problem_solution : accroche sur la douleur réelle du persona, scène qui montre le soulagement/produit.",
    "before_after : sceneBrief = split visuel gauche/droite AVANT (problème) vs APRÈS (résultat), badge « AVANT / APRÈS ».",
    "testimonial : quote client crédible et SPÉCIFIQUE (détail concret) + author + rating 5 ; scène d'une personne satisfaite avec le produit.",
    "benefits : 3 bénéfices très courts et concrets ; scène produit centrée, épurée, premium.",
    "ugc : caption courte et native (quote) + pseudo (author) ; scène contenu créateur authentique (selfie/à la main), non léchée.",
    "stat : un chiffre-clé fort et crédible (stat) + son libellé (statLabel) + headline ; scène produit épurée.",
    "offer : promo/offre (badge, ex « -30% », « 2+1 offert ») + headline à urgence + CTA ; scène produit désirable.",
    ctx.winningPatterns?.trim()
      ? `INTELLIGENCE CRÉATIVE JARVIS (patterns gagnants observés sur des pubs qui performent dans cette niche · applique-les pour maximiser la performance, sans plagier) : ${ctx.winningPatterns.trim().slice(0, 1400)}`
      : "",
    ctx.creativeRules?.trim()
      ? `RÈGLES MAISON (Jarvis) À RESPECTER IMPÉRATIVEMENT, priorité absolue sur tout le reste : ${ctx.creativeRules.trim().slice(0, 1200)}`
      : "",
    "Rends TOUJOURS via l'outil return_ads, un concept par entrée, dans l'ordre.",
  ].filter(Boolean).join(' ');
  const inspiration = opts.winningCopy?.length
    ? `\n\nPubs qui fonctionnent (inspire-toi des mécaniques, ne recopie pas) :\n- ${opts.winningCopy.slice(0, 10).map((c) => c.slice(0, 180)).join('\n- ')}`
    : '';
  const compet = opts.competitors?.length ? `\nConcurrents à surclasser : ${opts.competitors.slice(0, 10).join(', ')}.` : '';
  const user = `${ctxLines(ctx)}${compet}${inspiration}\n\nProduis EXACTEMENT ${templates.length} concept(s), un par entrée, dans cet ordre de gabarits : ${templates.join(', ')}. Si un gabarit revient, propose une exécution nettement différente (accroche, scène, angle). Priorise l'impact marketing : je veux des accroches qui claquent, pas des slogans plats.`;

  const res = await client.messages.create({
    // Assez de tokens pour N concepts complets (évite la troncature quand la quantité est élevée).
    model: GEN_MODEL, max_tokens: Math.min(8000, 1200 + templates.length * 450), system: sys,
    tools: [AD_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_ads' },
    messages: [{ role: 'user', content: user }],
  });
  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: { concepts?: AdConcept[] } } | undefined;
  const concepts = (tool?.input?.concepts ?? []).filter((c) => c?.headline && c?.sceneBrief);
  // On conserve l'ordre (avec répétitions de gabarits possibles) et on aligne sur la longueur demandée.
  return concepts.slice(0, templates.length);
}
