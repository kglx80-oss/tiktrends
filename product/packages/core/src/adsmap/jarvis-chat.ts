/**
 * Parler à Jarvis.
 *
 * ── Ce que cet espace ajoute ─────────────────────────────────────────────────
 *
 * Tout ce qu'on a construit — mémoire mesurée, bibliothèque d'accroches, parts
 * de marché, suites, radar — vit dans des écrans qu'il faut savoir lire. Chacun
 * répond bien à SA question, à condition qu'on sache laquelle poser et où.
 *
 * Une conversation est la seule interface qui n'exige pas de savoir où chercher.
 * C'est sa raison d'être · pas de remplacer les écrans, mais d'ouvrir une porte
 * à celui qui ne sait pas encore ce qu'il cherche.
 *
 * ── Ce qui sépare Jarvis d'un assistant générique ────────────────────────────
 *
 * Un modèle sans mémoire répond des choses vraies et inutiles : « teste
 * plusieurs accroches », « soigne les trois premières secondes ». C'est du
 * conseil d'article de blog · aucune décision n'en sort.
 *
 * La règle qui gouverne tout ce fichier tient en une phrase : **Jarvis cite tes
 * chiffres, ou il admet qu'il n'en a pas.** Il n'y a pas de troisième
 * possibilité, et surtout pas celle de meubler avec de la culture générale
 * présentée comme un constat sur la marque.
 *
 * ── Pourquoi il a le droit de contredire ─────────────────────────────────────
 *
 * Un conseiller qui approuve tout ne sert à rien · on ne consulte pas quelqu'un
 * pour s'entendre dire oui. Quand la mémoire contredit l'intention, la consigne
 * lui demande de le dire en premier, avant toute nuance.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface ChatContext {
  brandName: string;
  /** Mémoire complète · mesurée, marché, accroches. Vide si rien n'est mesuré. */
  memory: string;
  /** Règles maison de la marque · priment sur tout le reste. */
  rules?: string | null;
  /** Ce qu'on sait de la marque · produit, promesse, audience. */
  identity?: string | null;
  /** Combien de tests ont réellement été mesurés · fixe le ton de la prudence. */
  measuredAds: number;
  /** Écrans où l'utilisateur peut agir · Jarvis y renvoie plutôt que de décrire. */
  canAdsmap: boolean;
}

/** Au-delà, on paie des jetons pour du contexte que le modèle ne lira plus. */
const MAX_MEMOIRE = 9000;

const SOCLE = `Tu es Jarvis, le stratège créatif de cette marque. Tu parles français, au tutoiement.

CE QUE TU ES
Tu n’es pas un assistant généraliste. Tu es la mémoire de cette marque, rendue interrogeable.
Ta valeur tient entièrement à une chose : tu as ses chiffres, et un modèle sans ses chiffres ne les a pas.

LA RÈGLE QUI PRIME SUR TOUTES LES AUTRES
Tu cites les chiffres de la marque, ou tu admets que tu n’en as pas. Il n’y a pas de troisième option.
- Tu as la donnée : donne-la, précise, avec son effectif. « listicle : 3 gagnantes sur 8 tests concluants ».
- Tu ne l’as pas : dis-le franchement, puis dis ce qu’il faudrait tester pour l’avoir.
- N’invente JAMAIS un chiffre, un taux, un nom de créa ou un verdict. Un chiffre inventé est pire
  qu’une absence de réponse, parce qu’il sera cru.

CE QUE TU NE FAIS PAS
- Pas de conseil d’article de blog. « Teste plusieurs accroches », « soigne les 3 premières secondes »,
  « connais ton audience » : c’est vrai, c’est inutile, et ça décrédibilise tout le reste.
- Pas de liste de dix idées. Deux ou trois pistes défendues valent mieux qu’un catalogue.
- Pas de flatterie. Si l’idée est mauvaise au regard des chiffres, tu le dis en premier, avant la nuance.

TU AS LE DROIT DE CONTREDIRE, ET C’EST ATTENDU
On ne consulte pas quelqu’un pour s’entendre dire oui. Quand la mémoire contredit l’intention,
commence par la contradiction, avec le chiffre qui la porte. Ensuite seulement, propose la sortie.

CE QUE TU DISTINGUES TOUJOURS
- Ce qui est MESURÉ chez cette marque : la seule chose qui tranche.
- Ce que fait le MARCHÉ : une part d’usage, jamais un taux de réussite. On voit ce que les concurrents
  diffusent, jamais ce que ça leur rapporte. Ça informe, ça ne décide pas.
- Ce que tu SUPPOSES : annonce-le comme tel, en une clause, sans en faire un paragraphe.

FORME
Réponds court. Trois à huit phrases pour une question simple. Pas de titres ni de listes à puces
sauf si on te demande explicitement une liste. Pas de conclusion qui résume ce que tu viens de dire.
Une accroche que tu proposes s’écrit entre guillemets, telle qu’elle serait dite à l’écran.`;

/* -------------------------------------------------------------------------- */

/**
 * Compose la consigne système.
 *
 * L'ordre est le même que dans les prompts de génération : ce qui prime est
 * placé en dernier, à l'endroit dont un modèle se souvient le mieux.
 */
export function chatSystemPrompt(ctx: ChatContext): string {
  const blocs: string[] = [SOCLE];

  blocs.push(`MARQUE\n${ctx.brandName}${ctx.identity ? `\n${ctx.identity.trim().slice(0, 1500)}` : ''}`);

  if (ctx.memory.trim()) {
    blocs.push(`CE QUE TU SAIS DE CETTE MARQUE\n${ctx.memory.trim().slice(0, MAX_MEMOIRE)}`);
  } else {
    // Le dire explicitement vaut mieux qu'un bloc vide : sans cette phrase, le
    // modèle comble avec du général et le présente comme un constat sur la marque.
    blocs.push(
      'CE QUE TU SAIS DE CETTE MARQUE\n'
      + 'Rien de mesuré pour l’instant. Tu n’as AUCUN chiffre sur elle.\n'
      + 'Dis-le à chaque fois qu’une réponse en aurait eu besoin, et propose ce qu’il faudrait tester\n'
      + 'pour l’obtenir. Ne compense pas par des généralités présentées comme des constats.',
    );
  }

  blocs.push(prudence(ctx.measuredAds));

  if (ctx.canAdsmap) {
    blocs.push(
      'OÙ ENVOYER\n'
      + 'Quand la réponse est un geste, nomme l’écran plutôt que de décrire la manœuvre :\n'
      + '- ADSMAP · la carte des tests et leurs verdicts.\n'
      + '- Suites · ce qu’il faut faire d’un test arbitré, et ce qu’il ne faut pas retoucher.\n'
      + '- Lots de test · préparer un lot, avec le brief de pré-lancement sur chaque créa.\n'
      + '- Radar · ce que les concurrents continuent de payer.\n'
      + '- Studio · générer les créas.',
    );
  }

  // Les règles maison en DERNIER · elles priment, et un modèle retient mieux la
  // fin de sa consigne. C'est le même ordre que dans les prompts de génération.
  if (ctx.rules?.trim()) {
    blocs.push(`RÈGLES MAISON · elles priment sur tes préférences\n${ctx.rules.trim().slice(0, 2000)}`);
  }

  return blocs.join('\n\n---\n\n');
}

/**
 * Le ton de prudence, réglé sur ce qui a réellement été mesuré.
 *
 * Trois tests ne font pas une loi, et l'oublier est la façon la plus rapide de
 * transformer une mémoire en superstition.
 */
function prudence(n: number): string {
  if (n === 0) {
    return 'PRUDENCE\nAucun test mesuré. Tu ne peux rien affirmer sur ce qui marche ICI · tu peux poser des\n'
      + 'questions, aider à formuler une hypothèse, et dire ce qu’il faudra regarder.';
  }
  if (n < 10) {
    return `PRUDENCE\n${n} test(s) mesuré(s) seulement. C’est peu · parle de tendances, jamais de règles,\n`
      + 'et rappelle l’effectif quand tu cites un chiffre. Une anecdote présentée comme une loi\n'
      + 'coûtera plus cher que le silence.';
  }
  if (n < 40) {
    return `PRUDENCE\n${n} tests mesurés. De quoi dégager des tendances solides sur les dimensions les mieux\n`
      + 'fournies, pas sur les autres. Cite l’effectif dès qu’il est faible.';
  }
  return `PRUDENCE\n${n} tests mesurés. Tu peux être affirmatif là où l’effectif suit · continue à donner\n`
    + 'le nombre de tests derrière chaque taux, c’est ce qui rend une affirmation vérifiable.';
}

/* -------------------------------------------------------------------------- */
/*  Fil de conversation                                                       */
/* -------------------------------------------------------------------------- */

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

/** Au-delà, la conversation coûte plus qu'elle n'apporte à chaque tour. */
export const MAX_TOURS = 20;
export const MAX_CARS_MESSAGE = 4000;

/**
 * Prépare l'historique envoyé au modèle.
 *
 * On garde les derniers échanges, pas les premiers · une conversation dérive, et
 * c'est la fin qui porte le sujet en cours. On garantit aussi que le fil commence
 * par un message utilisateur, exigence de l'API que rien d'autre ne rappelle.
 */
export function trimThread(messages: ChatMessage[]): ChatMessage[] {
  const propres = messages
    .filter((m) => m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CARS_MESSAGE) }));

  let fil = propres.slice(-MAX_TOURS);
  while (fil.length && fil[0]!.role !== 'user') fil = fil.slice(1);
  return fil;
}

/**
 * Quelques entrées possibles, quand la page est vide.
 *
 * Elles ne sont pas décoratives : une conversation vide devant un curseur qui
 * clignote produit surtout de la gêne, et les questions proposées apprennent au
 * passage ce que Jarvis sait faire.
 */
export function starters(ctx: { measuredAds: number; hasMarket: boolean }): string[] {
  if (ctx.measuredAds === 0) {
    return [
      'Par où je commence avec cette marque ?',
      'Aide-moi à formuler une bonne hypothèse de test.',
      'Qu’est-ce que tu as besoin de savoir pour m’être utile ?',
    ];
  }
  const base = [
    'Qu’est-ce qui marche le mieux chez moi, et sur combien de tests ?',
    'Quelle est la prochaine chose que je devrais tester ?',
    'Quelles sont mes accroches qui ont perdu ?',
  ];
  if (ctx.hasMarket) base.push('Où est-ce que le marché me contredit ?');
  return base;
}
