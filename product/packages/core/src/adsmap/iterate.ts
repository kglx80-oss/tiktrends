/**
 * Ce qu'on fait d'un test une fois qu'il a rendu son verdict.
 *
 * ── Le réflexe qu'on veut casser ────────────────────────────────────────────
 *
 * Une créa n'a pas converti · on la refait. On rechange le hook, le montage, la
 * voix, l'offre, tout à la fois, et on rebrûle un budget de test pour apprendre
 * exactement rien, puisque plus personne ne sait à quoi attribuer le résultat.
 *
 * Or un tunnel est ORDONNÉ. Une ad qui échoue au CONVERT a été vue, regardée et
 * cliquée. Son accroche a marché. Son montage a tenu. Ces trois choses ont été
 * payées, elles sont acquises, et les retoucher revient à jeter la facture.
 *
 * Le service rendu par ce fichier n'est donc pas de proposer des variantes ·
 * c'est de dire **ce qu'il ne faut surtout pas toucher**. Le reste en découle :
 * si tout l'amont est gelé, il ne reste qu'une variable à changer, et c'est
 * précisément la définition d'une itération (§2.4).
 *
 * ── Les trois sorties ───────────────────────────────────────────────────────
 *
 * - **MORE**  · elle a gagné · on décline en gardant ce qui a gagné.
 * - **BETTER** · elle a buté quelque part · on corrige ce point-là, seul.
 * - **NEW**   · il ne reste rien à garder, ou la lignée s'est épuisée à
 *   essayer · on repart d'ailleurs.
 *
 * ── Une limite qu'on respecte au lieu de la contourner ──────────────────────
 *
 * `checkIteration` interdit d'itérer sur une perdante : une arête de filiation
 * exige un parent gagnant. C'est juste · repartir d'un perdant reproduit ce qui
 * n'a pas marché. Mais « corriger l'offre d'une créa qui a prouvé son hook »
 * reste la meilleure action possible. On propose donc quand même, en disant que
 * ce sera un NOUVEAU concept et non une itération. Le conseil est le même, la
 * comptabilité du graphe reste propre.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { FunnelStage, TestedVariable, VerdictValue } from './types';

/* -------------------------------------------------------------------------- */
/*  Le tunnel, et qui gouverne quoi                                           */
/* -------------------------------------------------------------------------- */

/** Ordre du tunnel · c'est lui qui rend le gel calculable. */
export const STAGE_ORDER: FunnelStage[] = ['hook', 'hold', 'click', 'convert'];

const RANG_STAGE: Record<FunnelStage, number> = { hook: 0, hold: 1, click: 2, convert: 3 };

/**
 * L'étape que chaque variable gouverne.
 *
 * `angle` et `desire` n'y figurent pas volontairement : ils ne gouvernent aucune
 * étape, ils décident du terrain. En changer un ne corrige rien, ça ouvre une
 * autre piste · c'est un NEW, jamais un BETTER.
 */
export const VARIABLE_STAGE: Partial<Record<TestedVariable, FunnelStage>> = {
  hook: 'hook',
  opening_visual: 'hook',
  format: 'hook',
  body: 'hold',
  length: 'hold',
  audio: 'hold',
  avatar_on_screen: 'hold',
  proof: 'click',
  cta: 'click',
  offer: 'convert',
  landing: 'convert',
};

/** Variables structurelles · en changer une ouvre une piste, ne répare rien. */
export const STRUCTURAL: TestedVariable[] = ['angle', 'desire'];

/**
 * Par étape, les variables à changer en priorité pour la débloquer.
 *
 * L'ordre compte : la première est celle dont l'effet est le plus direct et le
 * moins cher à produire. On ne remonte un tournage que si la retouche a échoué.
 */
export const FIX_FOR_STAGE: Record<FunnelStage, TestedVariable[]> = {
  hook: ['hook', 'opening_visual', 'format'],
  hold: ['body', 'length', 'audio'],
  click: ['cta', 'proof'],
  convert: ['offer', 'landing'],
};

export const VARIABLE_LABEL: Record<TestedVariable, string> = {
  hook: 'l’accroche',
  opening_visual: 'le visuel d’ouverture',
  body: 'le corps',
  length: 'la durée',
  cta: 'l’appel à l’action',
  format: 'le format',
  offer: 'l’offre',
  landing: 'la page de destination',
  avatar_on_screen: 'la personne à l’écran',
  proof: 'la preuve',
  audio: 'le son',
  angle: 'l’angle',
  desire: 'le désir',
  none_control: 'rien (témoin)',
};

export const STAGE_LABEL: Record<FunnelStage, string> = {
  hook: 'l’accrochage', hold: 'la rétention', click: 'le clic', convert: 'la conversion',
};

/** Ce qu'une étape franchie prouve · sert à l'écrire en clair. */
const PREUVE_STAGE: Record<FunnelStage, string> = {
  hook: 'elle a été regardée',
  hold: 'elle a été tenue jusqu’au bout',
  click: 'elle a fait cliquer',
  convert: 'elle a fait acheter',
};

const GAGNANTS = new Set<VerdictValue>(['winner', 'baby_winner', 'relative_winner']);

/* -------------------------------------------------------------------------- */
/*  Entrée et sortie                                                          */
/* -------------------------------------------------------------------------- */

export interface IterationInput {
  adId: string;
  label: string;
  verdict: VerdictValue;
  /** L'étape où le tunnel a lâché · `null` si l'ad a tout franchi. */
  failedStage: FunnelStage | null;
  /** Règle de coupe déclenchée · `cost` désigne l'offre, pas la créa. */
  killFlag?: 'hook' | 'click' | 'convert' | 'cost' | null;
  /** Variable testée par cette ad · ne pas la reproposer à l'identique. */
  testedVariable?: TestedVariable | null;
  /** Profondeur de filiation · 0 = ad d'origine. */
  lineageDepth?: number;
  /** Variables déjà changées dans cette lignée, dans l'ordre. */
  lineageChanged?: TestedVariable[];
  /** Dépense engagée · sert à classer, pas à décider. */
  spend?: number | null;
}

export interface IterationProposal {
  mode: 'more' | 'better' | 'new';
  changedVariable: TestedVariable;
  stageTargeted: FunnelStage | null;
  /**
   * Ce qui est acquis et ne doit pas bouger. C'est la partie utile · sans elle,
   * une « itération » est une refonte déguisée et n'apprend rien.
   */
  freeze: TestedVariable[];
  rationale: string;
  /** 0 en premier · classe l'ordre dans lequel dépenser le prochain euro. */
  priority: number;
  /**
   * `false` quand le parent n'est pas gagnant : la proposition tient toujours,
   * mais elle s'enregistre comme nouveau concept, sans arête de filiation.
   */
  edgeLegal: boolean;
}

/** Au-delà, la lignée s'entête · deux essais sur la même variable est un test, trois est une habitude. */
export const MAX_ESSAIS_MEME_VARIABLE = 2;

/** Au-delà, une lignée qui n'a toujours pas gagné coûte plus qu'elle ne rapporte. */
export const MAX_PROFONDEUR = 4;

/* -------------------------------------------------------------------------- */
/*  Le gel                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Les variables dont l'efficacité est démontrée par le fait même d'avoir atteint
 * l'étape qui a échoué.
 *
 * Toute la valeur du fichier est ici. Une ad tombée au CONVERT a prouvé son
 * accroche, son montage et son appel à l'action · les rouvrir, c'est repayer
 * trois réponses qu'on avait déjà.
 */
export function frozenBy(failedStage: FunnelStage | null): TestedVariable[] {
  if (!failedStage) return [];
  const seuil = RANG_STAGE[failedStage];
  return (Object.keys(VARIABLE_STAGE) as TestedVariable[])
    .filter((v) => RANG_STAGE[VARIABLE_STAGE[v]!] < seuil);
}

/** Phrase qui dit ce qui est acquis · en clair, sans jargon d'étape. */
export function freezeSentence(failedStage: FunnelStage | null): string | null {
  if (!failedStage) return null;
  const franchies = STAGE_ORDER.filter((s) => RANG_STAGE[s] < RANG_STAGE[failedStage]);
  if (!franchies.length) return null;
  const preuves = franchies.map((s) => PREUVE_STAGE[s]);
  const liste = preuves.length === 1
    ? preuves[0]
    : `${preuves.slice(0, -1).join(', ')} et ${preuves[preuves.length - 1]}`;
  return `Acquis : ${liste}. Ne le retouche pas · c'est déjà payé.`;
}

/* -------------------------------------------------------------------------- */
/*  Le moteur                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Choisit la variable à changer pour débloquer une étape, en évitant celles que
 * la lignée a déjà usées.
 */
function prochaineVariable(stage: FunnelStage, deja: TestedVariable[]): TestedVariable | null {
  const compte = (v: TestedVariable) => deja.filter((x) => x === v).length;
  for (const v of FIX_FOR_STAGE[stage]) {
    if (compte(v) < MAX_ESSAIS_MEME_VARIABLE) return v;
  }
  return null;
}

/**
 * L'ordre dans lequel décliner une gagnante.
 *
 * On ne touche NI à l'accroche NI à l'angle : c'est ce qui a gagné. On fait
 * varier la surface · un autre visuel d'ouverture, un autre format, une autre
 * durée. Décliner une gagnante en changeant son accroche, c'est tester une autre
 * ad et croire qu'on capitalise.
 */
const DECLINAISON: TestedVariable[] = ['opening_visual', 'format', 'length', 'avatar_on_screen', 'audio'];

/**
 * Ce qu'il faut faire de cette ad, maintenant qu'elle a un verdict.
 *
 * Renvoie au plus deux propositions · une principale et un repli. Au-delà, on ne
 * conseille plus, on offre un menu, et un menu se referme sans rien choisir.
 */
export function proposeIterations(input: IterationInput): IterationProposal[] {
  const deja = input.lineageChanged ?? [];
  const profondeur = input.lineageDepth ?? 0;
  const gagnant = GAGNANTS.has(input.verdict);
  const out: IterationProposal[] = [];

  // La lignée s'est épuisée : plus rien à corriger, il faut changer de terrain.
  if (!gagnant && profondeur >= MAX_PROFONDEUR) {
    return [{
      mode: 'new',
      changedVariable: 'angle',
      stageTargeted: null,
      freeze: [],
      rationale: `${profondeur} tentatives sur cette lignée sans gagnante · le problème n'est probablement pas la créa mais l'angle. Continue à corriger et tu paieras la même réponse une cinquième fois.`,
      priority: 1,
      edgeLegal: false,
    }];
  }

  // Un coût trop élevé avec un tunnel qui passe désigne l'offre, jamais le montage.
  if (input.killFlag === 'cost' && !input.failedStage) {
    out.push({
      mode: 'better',
      changedVariable: 'offer',
      stageTargeted: 'convert',
      freeze: frozenBy('convert'),
      rationale: 'Le tunnel passe et le coût ne suit pas · c\'est l\'économie de l\'offre qui bloque, pas la créa. Refaire la vidéo ne changera pas le prix de l\'acquisition.',
      priority: 0,
      edgeLegal: gagnant,
    });
  }

  // ── Une gagnante · on décline ce qui a gagné ──────────────────────────────
  if (gagnant && !input.failedStage) {
    const v = DECLINAISON.find((x) => deja.filter((y) => y === x).length < MAX_ESSAIS_MEME_VARIABLE)
      ?? DECLINAISON[0]!;
    out.push({
      mode: 'more',
      changedVariable: v,
      stageTargeted: VARIABLE_STAGE[v] ?? null,
      // Sur une gagnante, ce qui a gagné se gèle en entier.
      freeze: ['hook', 'angle', 'offer'],
      rationale: `Elle a gagné · décline-la en changeant ${VARIABLE_LABEL[v]} et rien d'autre. Garde l'accroche, l'angle et l'offre intacts : c'est eux qui ont gagné, pas le reste.`,
      priority: 1,
      edgeLegal: true,
    });
    return out;
  }

  // ── Un échec localisé · on corrige ce point-là, seul ──────────────────────
  if (input.failedStage) {
    const stage = input.failedStage;
    const v = prochaineVariable(stage, deja);

    if (!v) {
      // Toutes les corrections de cette étape ont été essayées deux fois.
      out.push({
        mode: 'new',
        changedVariable: 'angle',
        stageTargeted: null,
        freeze: [],
        rationale: `Tout ce qui pouvait corriger ${STAGE_LABEL[stage]} a déjà été essayé deux fois sur cette lignée. Insister coûterait un troisième test pour la même réponse · change de terrain.`,
        priority: 2,
        edgeLegal: false,
      });
      return out;
    }

    const gel = frozenBy(stage);
    const acquis = freezeSentence(stage);
    // Une chute au CONVERT est la plus rentable à corriger : tout l'amont est
    // prouvé, et le correctif est une page ou un prix, pas un tournage.
    const cher = stage === 'convert' || stage === 'click';

    out.push({
      mode: 'better',
      changedVariable: v,
      stageTargeted: stage,
      freeze: gel,
      rationale: acquis
        ? `Elle a lâché sur ${STAGE_LABEL[stage]} · change ${VARIABLE_LABEL[v]}, seulement. ${acquis}`
        : `Elle a lâché dès ${STAGE_LABEL[stage]} · change ${VARIABLE_LABEL[v]}. Rien n'a encore été prouvé sur cette ad, il n'y a donc rien à préserver.`,
      priority: cher ? 0 : 2,
      edgeLegal: gagnant,
    });

    // Un repli, et un seul · la deuxième variable de la même étape.
    const repli = FIX_FOR_STAGE[stage].find(
      (x) => x !== v && deja.filter((y) => y === x).length < MAX_ESSAIS_MEME_VARIABLE,
    );
    if (repli) {
      out.push({
        mode: 'better',
        changedVariable: repli,
        stageTargeted: stage,
        freeze: gel,
        rationale: `Si ${VARIABLE_LABEL[v]} ne suffit pas : ${VARIABLE_LABEL[repli]}, sur la même étape. Une seule des deux à la fois.`,
        priority: 3,
        edgeLegal: gagnant,
      });
    }
    return out;
  }

  // ── Perdante sans étape identifiée · on n'a rien appris ───────────────────
  out.push({
    mode: 'new',
    changedVariable: 'angle',
    stageTargeted: null,
    freeze: [],
    rationale: 'Perdue sans qu\'on sache où · aucune étape ne ressort, donc aucune correction n\'est indiquée. Reprends l\'angle plutôt que de retoucher au hasard.',
    priority: 3,
    edgeLegal: false,
  });
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Vue d'ensemble                                                            */
/* -------------------------------------------------------------------------- */

export interface IterationTask extends IterationProposal {
  adId: string;
  label: string;
  spend: number | null;
}

/**
 * Le plan d'itération du compte, classé par ce que le prochain euro rapportera.
 *
 * À priorité égale, la dépense engagée départage : une ad qui a coûté 400 € et
 * dont l'offre bloque mérite d'être corrigée avant une ad à 30 €. Ce n'est pas
 * une préférence pour le gros budget · c'est que l'apprentissage y est déjà payé.
 */
export function iterationPlan(ads: IterationInput[]): IterationTask[] {
  const out: IterationTask[] = [];
  for (const ad of ads) {
    for (const p of proposeIterations(ad)) {
      out.push({ ...p, adId: ad.adId, label: ad.label, spend: ad.spend ?? null });
    }
  }
  out.sort((a, b) => a.priority - b.priority || (b.spend ?? 0) - (a.spend ?? 0));
  return out;
}

export const MODE_LABEL: Record<IterationProposal['mode'], string> = {
  more: 'Décliner', better: 'Corriger', new: 'Repartir',
};

/** Ce que chaque mode veut dire, en une ligne, pour l'écran. */
export const MODE_HINT: Record<IterationProposal['mode'], string> = {
  more: 'Elle a gagné · on garde ce qui a gagné et on multiplie.',
  better: 'Elle a buté sur un point précis · on corrige ce point, seul.',
  new: 'Il ne reste rien à garder · on repart d’ailleurs.',
};
