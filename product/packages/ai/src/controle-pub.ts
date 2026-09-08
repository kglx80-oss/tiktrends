import type Anthropic from '@anthropic-ai/sdk';

/**
 * Relire une publicité produite entière · les mots, et le produit.
 *
 * ── Pourquoi un appel à part, et pas la note Jarvis ──────────────────────────
 *
 * La note sait déjà transcrire le texte, et c'est ce qu'on a branché en premier
 * parce que ça ne coûtait rien de plus. Mais la note est MANUELLE et payante :
 * elle ne part que si on clique sur une publicité, une par une.
 *
 * Résultat, la mesure existait sur le papier. Un lot de quatre publicités
 * repartait sans qu'aucune n'ait été relue, et les deux questions qui décident
 * si le mode « entière » est utilisable — a-t-il écrit nos mots, a-t-il gardé
 * notre produit — restaient sans réponse sauf à payer quatre analyses.
 *
 * Ce contrôle-ci part TOUT SEUL, à la génération, et ne fait qu'une chose :
 * regarder. Pas de note, pas de verdict créatif, pas de conseil · uniquement ce
 * qui est écrit et ce qui est montré.
 *
 * ── Ce que ça coûte ──────────────────────────────────────────────────────────
 *
 * Le modèle le moins cher, sur une image réduite. Environ 0,002 $ par
 * publicité, contre 0,08 $ pour l'image elle-même · trois pour cent. C'est ce
 * qui autorise à le lancer sans le demander.
 *
 * Un contrôle qui coûterait le prix d'une analyse serait éteint au premier
 * relevé de dépense, et on aurait construit une mesure que personne n'allume.
 *
 * ── Perception, pas jugement ─────────────────────────────────────────────────
 *
 * On ne demande jamais « est-ce bien écrit » ni « est-ce fidèle ». On demande
 * CE QUI EST ÉCRIT et CE QUI DIFFÈRE. La comparaison se fait dans le noyau, en
 * code · un avis de modèle ne se compte pas, un écart constaté si.
 */

export const CONTROLE_MODEL = process.env.ANTHROPIC_CONTROLE_MODEL ?? 'claude-haiku-4-5-20251001';

/** Ce que le contrôle a vu · rien d'interprété. */
export interface ControlePub {
  /** Le texte visible, ligne par ligne, recopié tel quel. */
  texteLu: string[];
  /**
   * Le packaging correspond-il à la photo de référence ?
   *
   * `null` quand aucune référence n'a été fournie · on ne peut pas constater un
   * écart avec une image qu'on n'a pas, et répondre « identique » par défaut
   * transformerait une absence de vérification en garantie.
   */
  produitFidele: boolean | null;
  /** Ce qui diffère sur le packaging · vide quand rien, ou quand sans référence. */
  ecartsProduit: string[];
  /**
   * La typographie PUBLICITAIRE est-elle lisible d'un coup d'œil ?
   *
   * ── Pourquoi c'est une question à part ─────────────────────────────────────
   *
   * `texteLu` dit ce que le modèle a RÉUSSI à lire · c'est circulaire pour la
   * lisibilité, un modèle déchiffre un texte minuscule qu'un humain, en scroll,
   * ne verrait pas. « Y a-t-il du texte » était la troisième des trois questions
   * qui décident si l'entière est utilisable, et la seule encore sans réponse
   * propre · une accroche cuite trop petite, coupée au bord, sur un fond qui
   * l'avale, passait pour conforme dès que les mots correspondaient.
   *
   * On ne juge QUE la typographie ajoutée par la publicité (accroche, sous-titre,
   * bouton, pastille). Le texte imprimé sur l'emballage est légitimement petit ·
   * le compter ici condamnerait toute pub qui montre un vrai produit.
   *
   * `null` quand il n'y a aucun texte publicitaire à juger.
   */
  texteLisible: boolean | null;
  /** Pourquoi le texte est difficile · vide quand il est lisible, ou sans texte. */
  problemesLisibilite: string[];
}

const OUTIL = {
  name: 'relire_la_pub',
  description: 'Rapporte ce qui est écrit dans la publicité et ce qui diffère du produit de référence.',
  input_schema: {
    type: 'object',
    properties: {
      texteLu: {
        type: 'array',
        items: { type: 'string' },
        description: "TRANSCRIPTION littérale de tout le texte visible dans la publicité, une entrée par ligne ou par bloc, EXACTEMENT tel qu'il est écrit : accents, apostrophes, majuscules, ponctuation compris. Ne corrige rien, ne traduis rien, n'interprète rien · recopie. Inclus le texte imprimé sur l'emballage du produit.",
      },
      produitFidele: {
        type: 'boolean',
        description: "Le produit montré dans la publicité est-il le MÊME que celui de la photo de référence : même forme de contenant, même bouchon, même étiquette, même texte imprimé dessus, mêmes couleurs, mêmes proportions. Réponds false dès qu'un de ces points diffère visiblement. Ne remplis ce champ que si une photo de référence t'est fournie.",
      },
      ecartsProduit: {
        type: 'array',
        items: { type: 'string' },
        description: "Ce qui diffère concrètement sur le produit, en français, une différence par entrée, très court (« le bouchon est doré au lieu de noir »). Liste vide si le produit est identique ou si aucune référence n'est fournie.",
      },
      texteLisible: {
        type: 'boolean',
        description: "La typographie PUBLICITAIRE ajoutée à l'image (accroche, sous-titre, bouton, pastille) est-elle lisible d'un coup d'œil, à la taille d'une vignette : nette, assez grande, contrastée sur son fond, entière dans le cadre, sans lettres déformées ou qui se chevauchent. Réponds false si un texte publicitaire est coupé au bord, trop petit, illisible sur son fond, ou aux lettres brouillées. IGNORE le texte imprimé sur l'emballage du produit, qui a le droit d'être petit. Ne remplis ce champ que s'il y a du texte publicitaire dans l'image.",
      },
      problemesLisibilite: {
        type: 'array',
        items: { type: 'string' },
        description: "Ce qui rend un texte publicitaire difficile à lire, en français, un problème par entrée, très court (« l'accroche est coupée au bord droit », « le bouton se fond dans le fond »). Liste vide si tout est lisible ou s'il n'y a pas de texte publicitaire.",
      },
    },
    required: ['texteLu'],
  },
} as const;

export interface ImageJointe { mediaType: string; base64: string }

/**
 * Relit une publicité entière · `null` si le modèle n'a rien rendu d'exploitable.
 *
 * Un échec ne doit jamais faire échouer la génération qui l'a déclenché · une
 * publicité produite mais non relue reste une publicité produite, et le lot ne
 * se perd pas parce qu'une vérification n'a pas abouti.
 */
export async function controlePubEntiere(
  client: Anthropic,
  o: { image: ImageJointe; reference?: ImageJointe | null },
): Promise<ControlePub | null> {
  const avecRef = !!o.reference;
  const sys = [
    'Tu relis une publicité qui vient d’être produite par un modèle d’images.',
    'Tu ne juges NI la beauté, NI l’efficacité, NI l’orthographe. Tu transcris le texte, tu compares le produit, et tu signales le texte publicitaire difficile à lire · rien d’autre.',
    avecRef
      ? 'La PREMIÈRE image est la publicité. La SECONDE est la photo de référence du produit. Compare le produit de la publicité à cette référence.'
      : 'Une seule image t’est fournie : la publicité. Aucune référence produit · laisse « produitFidele » et « ecartsProduit » vides.',
    'Réponds uniquement via l’outil relire_la_pub.',
  ].join(' ');

  const contenu: Anthropic.MessageParam['content'] = [
    { type: 'image', source: { type: 'base64', media_type: o.image.mediaType as 'image/png', data: o.image.base64 } },
    ...(o.reference
      ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: o.reference.mediaType as 'image/png', data: o.reference.base64 } }]
      : []),
    { type: 'text', text: avecRef ? 'Publicité, puis référence produit.' : 'Publicité.' },
  ];

  const res = await client.messages.create({
    model: CONTROLE_MODEL,
    max_tokens: 700,
    system: sys,
    messages: [{ role: 'user', content: contenu }],
    tools: [OUTIL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: OUTIL.name },
  });

  const bloc = (res as Anthropic.Message).content.find((c) => c.type === 'tool_use');
  if (!bloc || bloc.type !== 'tool_use') return null;
  const v = bloc.input as Partial<ControlePub>;

  return {
    // Recopié tel quel · le nettoyer effacerait la faute qu'on cherche à voir.
    // Seules les lignes vides tombent, et la longueur est bornée.
    texteLu: Array.isArray(v.texteLu)
      ? v.texteLu.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 24)
      : [],
    // Sans référence, on ne conclut pas · « identique » par défaut transformerait
    // une absence de vérification en garantie.
    produitFidele: avecRef && typeof v.produitFidele === 'boolean' ? v.produitFidele : null,
    ecartsProduit: avecRef && Array.isArray(v.ecartsProduit)
      ? v.ecartsProduit.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 5)
      : [],
    // Le modèle ne remplit ce champ que s'il y a du texte publicitaire · absent,
    // on ne conclut rien plutôt que de déclarer « lisible » une image sans texte.
    texteLisible: typeof v.texteLisible === 'boolean' ? v.texteLisible : null,
    problemesLisibilite: Array.isArray(v.problemesLisibilite)
      ? v.problemesLisibilite.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 5)
      : [],
  };
}
