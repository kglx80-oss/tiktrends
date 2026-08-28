import Anthropic from '@anthropic-ai/sdk';

/**
 * ADSMAP · agents A1 à A3, remplissage de la carte (§8.3).
 *
 * A1 propose des avatars et leurs désirs, A2 des angles, A3 des concepts. Ils
 * descendent l'arbre dans l'ordre du cahier des charges : avatar → désir →
 * angle → concept, chacun ne voyant que son parent et la mémoire mesurée.
 *
 * Deux principes gouvernent les prompts.
 *
 * **La mémoire mesurée passe avant tout le reste.** Quand la marque a des
 * verdicts, le tableau de Jarvis est injecté en tête et le modèle a pour
 * consigne de s'en servir · un agent qui propose du listicle à une marque où le
 * listicle perd trois fois sur quatre fait perdre de l'argent avec assurance.
 *
 * **Rien de ce qui sort d'ici n'est vrai.** Ce sont des PROPOSITIONS · elles
 * entrent en `proposed` et un humain les valide. Le prompt interdit donc
 * d'inventer des chiffres, des avis ou des certifications : une preuve fabriquée
 * dans un concept se retrouve dans une publicité diffusée.
 */

const GEN_MODEL = process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5';

const GARDE_FOUS = [
  'Tu écris en français.',
  'Tu PROPOSES · un humain validera. N’affirme rien comme acquis.',
  'N’invente JAMAIS de chiffre, d’avis client, d’étude ou de certification :',
  'ce que tu écris peut finir dans une publicité diffusée.',
  'Appuie-toi uniquement sur ce qu’on te donne de la marque.',
].join(' ');

/** Contexte commun · ce que l'agent sait de la marque. */
export interface BrandContext {
  name: string;
  description?: string | null;
  usp?: string | null;
  audience?: string | null;
  category?: string | null;
  products?: string[];
  /** Mémoire mesurée de Jarvis · ce qui a réellement gagné ici. */
  measured?: string | null;
  /** Règles maison, s'il y en a. */
  rules?: string | null;
}

function contexte(b: BrandContext): string {
  return [
    // La mémoire d'abord : c'est la seule partie fondée sur des résultats.
    b.measured ? `CE QUI A DÉJÀ ÉTÉ MESURÉ SUR CETTE MARQUE · appuie-toi dessus en priorité :\n${b.measured}` : '',
    b.rules ? `Consignes maison à respecter :\n${b.rules}` : '',
    `Marque : ${b.name}`,
    b.category ? `Catégorie : ${b.category}` : '',
    b.description ? `Description : ${b.description}` : '',
    b.usp ? `Ce qui la différencie : ${b.usp}` : '',
    b.audience ? `Audience déclarée : ${b.audience}` : '',
    b.products?.length ? `Produits : ${b.products.slice(0, 12).join(', ')}` : '',
  ].filter(Boolean).join('\n\n');
}

async function call<T>(client: Anthropic, opts: {
  system: string; tool: { name: string; description: string; input_schema: unknown };
  prompt: string; maxTokens?: number;
}): Promise<T | null> {
  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: opts.maxTokens ?? 2500,
    system: `${opts.system} ${GARDE_FOUS} Rends TOUJOURS ta réponse via l’outil ${opts.tool.name}.`,
    tools: [opts.tool as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: opts.tool.name },
    messages: [{ role: 'user', content: opts.prompt }],
  });
  const t = res.content.find((c) => c.type === 'tool_use') as { input?: T } | undefined;
  return t?.input ?? null;
}

/* -------------------------------------------------------------------------- */
/*  A1 · avatars et désirs                                                    */
/* -------------------------------------------------------------------------- */

const PERSONA_TOOL = {
  name: 'return_personas',
  description: 'Renvoie des avatars proposés pour la marque.',
  input_schema: {
    type: 'object',
    properties: {
      personas: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nom court et reconnaissable, ex : « Maman pressée de 35 ans ».' },
            description: { type: 'string', description: 'Qui c’est, en 2 à 3 phrases concrètes.' },
            pains: { type: 'array', items: { type: 'string' }, description: 'Douleurs vécues, dans ses mots à elle.' },
            desires: { type: 'array', items: { type: 'string' }, description: 'Ce qu’elle veut obtenir, pas ce que le produit fait.' },
            objections: { type: 'array', items: { type: 'string' }, description: 'Ce qui la retient d’acheter.' },
          },
          required: ['name', 'description', 'pains', 'desires', 'objections'],
        },
      },
    },
    required: ['personas'],
  },
} as const;

export interface RawPersonaOut { name?: string; description?: string; pains?: string[]; desires?: string[]; objections?: string[] }

export async function proposePersonas(
  client: Anthropic, brand: BrandContext, opts: { count?: number; existing?: string[] } = {},
): Promise<RawPersonaOut[]> {
  const n = Math.min(6, Math.max(1, opts.count ?? 3));
  const out = await call<{ personas?: RawPersonaOut[] }>(client, {
    system: [
      'Tu construis les avatars d’une marque pour un travail de stratégie publicitaire.',
      'Un avatar est une personne, pas un segment : il a des douleurs formulées dans SES mots.',
      'Des avatars qui se ressemblent ne servent à rien · fais-les différer par la douleur, pas par l’âge.',
    ].join(' '),
    tool: PERSONA_TOOL,
    prompt: [
      contexte(brand),
      opts.existing?.length ? `Avatars déjà présents · n’en propose pas de variantes :\n- ${opts.existing.slice(0, 20).join('\n- ')}` : '',
      `Propose ${n} avatar(s) NOUVEAUX.`,
    ].filter(Boolean).join('\n\n'),
  });
  return out?.personas ?? [];
}

const DESIRE_TOOL = {
  name: 'return_desires',
  description: 'Renvoie des désirs proposés pour un avatar.',
  input_schema: {
    type: 'object',
    properties: {
      desires: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Le désir formulé du point de vue de la personne, ex : « Dormir sans somnifère ».' },
            type: { type: 'string', description: 'gain | pain_relief | status | control | belonging | safety' },
            awareness: { type: 'string', description: 'unaware | problem_aware | solution_aware | product_aware | most_aware' },
            rationale: { type: 'string', description: 'Ce qui, dans le contexte donné, laisse penser que ce désir existe.' },
          },
          required: ['label', 'type', 'awareness', 'rationale'],
        },
      },
    },
    required: ['desires'],
  },
} as const;

export interface RawDesireOut { label?: string; type?: string; awareness?: string; rationale?: string }

export async function proposeDesires(
  client: Anthropic, brand: BrandContext,
  persona: { name: string; description?: string | null; pains?: string[] },
  opts: { count?: number; existing?: string[] } = {},
): Promise<RawDesireOut[]> {
  const n = Math.min(8, Math.max(1, opts.count ?? 4));
  const out = await call<{ desires?: RawDesireOut[] }>(client, {
    system: [
      'Tu formules les désirs d’un avatar face à une marque.',
      'Un désir se dit du point de vue de la personne et JAMAIS du produit :',
      '« dormir sans somnifère », pas « bénéficier de notre formule ».',
      'Le stade de conscience compte : dis à quel moment du parcours ce désir se parle.',
    ].join(' '),
    tool: DESIRE_TOOL,
    prompt: [
      contexte(brand),
      `Avatar : ${persona.name}${persona.description ? `\n${persona.description}` : ''}`,
      persona.pains?.length ? `Ses douleurs : ${persona.pains.join(' · ')}` : '',
      opts.existing?.length ? `Désirs déjà présents · n’en propose pas de reformulations :\n- ${opts.existing.slice(0, 30).join('\n- ')}` : '',
      `Propose ${n} désir(s) NOUVEAUX.`,
    ].filter(Boolean).join('\n\n'),
  });
  return out?.desires ?? [];
}

/* -------------------------------------------------------------------------- */
/*  A2 · angles                                                               */
/* -------------------------------------------------------------------------- */

const ANGLE_TOOL = {
  name: 'return_angles',
  description: 'Renvoie des angles proposés pour un désir.',
  input_schema: {
    type: 'object',
    properties: {
      angles: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'L’angle en une phrase claire.' },
            mechanism: { type: 'string', description: 'UN de : problem_agitate, demo, social_proof, comparison, story, curiosity, authority, scarcity, reverse, statistic_shock, diagnostic, us_vs_them, listicle.' },
            promise: { type: 'string', description: 'Ce que l’angle promet à la personne.' },
            proof: { type: 'string', description: 'Sur quoi la promesse s’appuie · uniquement des éléments présents dans le contexte fourni. Laisse vide si aucun.' },
          },
          required: ['label', 'mechanism', 'promise', 'proof'],
        },
      },
    },
    required: ['angles'],
  },
} as const;

export interface RawAngleOut { label?: string; mechanism?: string; promise?: string; proof?: string }

export async function proposeAngles(
  client: Anthropic, brand: BrandContext,
  desire: { label: string; awareness?: string | null },
  opts: { count?: number; existing?: string[] } = {},
): Promise<RawAngleOut[]> {
  const n = Math.min(8, Math.max(1, opts.count ?? 4));
  const out = await call<{ angles?: RawAngleOut[] }>(client, {
    system: [
      'Tu construis des angles publicitaires pour un désir donné.',
      'Un angle est un MÉCANISME appliqué à un désir · deux angles qui partagent le mécanisme',
      'et la promesse sont le même angle écrit deux fois.',
      'Choisis le mécanisme dans la liste imposée, sans en inventer.',
      'Le champ preuve reste VIDE si le contexte n’en fournit aucune · ne fabrique rien.',
    ].join(' '),
    tool: ANGLE_TOOL,
    prompt: [
      contexte(brand),
      `Désir à attaquer : ${desire.label}${desire.awareness ? `\nStade de conscience : ${desire.awareness}` : ''}`,
      opts.existing?.length ? `Angles déjà présents sur ce désir :\n- ${opts.existing.slice(0, 20).join('\n- ')}` : '',
      `Propose ${n} angle(s) NOUVEAUX, aux mécanismes différents les uns des autres.`,
    ].filter(Boolean).join('\n\n'),
  });
  return out?.angles ?? [];
}

/* -------------------------------------------------------------------------- */
/*  A3 · concepts                                                             */
/* -------------------------------------------------------------------------- */

const CONCEPT_TOOL = {
  name: 'return_concepts',
  description: 'Renvoie des concepts créatifs proposés pour un angle.',
  input_schema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Titre court et reconnaissable du concept.' },
            callout: { type: 'string', description: 'L’interpellation qui désigne à qui ça parle.' },
            valueBlock: { type: 'string', description: 'Le corps : ce qu’on montre et ce qu’on dit, dans l’ordre.' },
            cta: { type: 'string', description: 'Appel à l’action.' },
            hookOptions: { type: 'array', items: { type: 'string' }, description: 'Accroches alternatives pour les 3 premières secondes · c’est la variable la plus testée.' },
          },
          required: ['title', 'callout', 'valueBlock', 'cta', 'hookOptions'],
        },
      },
    },
    required: ['concepts'],
  },
} as const;

export interface RawConceptOut { title?: string; callout?: string; valueBlock?: string; cta?: string; hookOptions?: string[] }

export async function proposeConcepts(
  client: Anthropic, brand: BrandContext,
  angle: { label: string; mechanism: string; promise?: string | null; desire?: string | null },
  opts: { count?: number; existing?: string[] } = {},
): Promise<RawConceptOut[]> {
  const n = Math.min(6, Math.max(1, opts.count ?? 3));
  const out = await call<{ concepts?: RawConceptOut[] }>(client, {
    system: [
      'Tu écris des concepts de publicité à partir d’un angle.',
      'Un concept est produisible : on doit pouvoir le tourner sans reposer de question.',
      'Donne plusieurs accroches alternatives · c’est la variable qu’on testera en premier.',
      'Reste sur le mécanisme de l’angle · si tu en changes, ce n’est plus le même angle.',
    ].join(' '),
    tool: CONCEPT_TOOL,
    prompt: [
      contexte(brand),
      angle.desire ? `Désir : ${angle.desire}` : '',
      `Angle : ${angle.label}\nMécanisme imposé : ${angle.mechanism}${angle.promise ? `\nPromesse : ${angle.promise}` : ''}`,
      opts.existing?.length ? `Concepts déjà présents sur cet angle :\n- ${opts.existing.slice(0, 20).join('\n- ')}` : '',
      `Propose ${n} concept(s) NOUVEAUX.`,
    ].filter(Boolean).join('\n\n'),
    maxTokens: 3500,
  });
  return out?.concepts ?? [];
}
