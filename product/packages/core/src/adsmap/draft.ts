/**
 * Jarvis écrit le concept, pas seulement l'avis.
 *
 * ── Où il s'arrêtait ─────────────────────────────────────────────────────────
 *
 * Suites dit « change l'offre, garde l'accroche ». Le radar dit « ce concurrent
 * tient depuis 24 jours sur une ouverture que tu n'as jamais testée ». Dans les
 * deux cas, la marche suivante était manuelle · l'outil conseillait puis
 * regardait quelqu'un d'autre travailler.
 *
 * ── Ce que ce fichier ajoute, et qui n'est pas la génération ─────────────────
 *
 * Un générateur d'idées, tout le monde en a un. Ce qui manque partout ailleurs,
 * c'est **le brouillon qui se relit lui-même avant d'être montré**.
 *
 * Jarvis rédige, puis passe son propre texte au brief de pré-lancement · s'il
 * vient de reproposer une accroche qui a déjà perdu chez cette marque, il le
 * voit et réécrit. Une seule fois : deux réécritures signifieraient qu'il tourne
 * en rond, et il vaut mieux le dire que boucler.
 *
 * **Un outil qui ne relit pas ce qu'il propose fait porter la vérification à
 * celui qui lit** · c'est exactement le travail qu'on prétendait lui enlever.
 *
 * ── Ce qu'un brouillon n'est pas ─────────────────────────────────────────────
 *
 * Ce n'est pas une ad. Il naît en attente de validation humaine, avec son
 * hypothèse et sa variable · sans elles, son résultat ne s'attribuerait à rien,
 * et on aurait remplacé une créa au hasard par une créa au hasard mieux écrite.
 *
 * Pur : ni base, ni réseau, ni modèle. L'appel vit dans `packages/ai`.
 */

import type { PrelaunchBrief } from './prelaunch';

/** D'où part le brouillon · l'origine change ce qu'on demande au modèle. */
export type DraftOrigin = 'suite' | 'radar' | 'blank';

export interface DraftRequest {
  origin: DraftOrigin;
  /** Ce qu'on cherche à obtenir · phrase libre de l'utilisateur ou de la suite. */
  intent: string;
  /**
   * Ce qu'il ne faut PAS toucher · vient de `iterate.ts` sur une suite.
   * C'est la contrainte la plus précieuse et la plus facile à oublier.
   */
  freeze?: string[];
  /** La variable qu'on change · une seule, sinon ce n'est plus un test. */
  changedVariable?: string | null;
  /** Mécanique observée chez un concurrent · reprise, jamais recopiée. */
  marketMechanic?: string | null;
}

export interface DraftOut {
  /** L'accroche, telle qu'elle serait dite à l'écran. */
  headline: string;
  /** Le déroulé, en trois à cinq temps. */
  beats: string[];
  /** Ce que ce test parie · obligatoire, un brouillon sans pari n'apprend rien. */
  hypothesis: string;
  /** Pourquoi cette proposition · calculé, pas rédigé (cf. `rationale.ts`). */
  rationale?: string[];
}

/* -------------------------------------------------------------------------- */
/*  La consigne                                                               */
/* -------------------------------------------------------------------------- */

const SOCLE = `Tu écris UN concept publicitaire pour cette marque. Français, prêt à tourner.

CE QUE TU RENDS
- une accroche · la phrase exacte des trois premières secondes, telle qu’elle sera dite ou affichée ;
- un déroulé en 3 à 5 temps · ce qu’on voit et ce qu’on entend, dans l’ordre ;
- une hypothèse · ce que ce test parie, en une phrase qui peut être infirmée.

CE QUI REND UNE ACCROCHE UTILISABLE
Elle nomme une situation précise, pas une catégorie. « Ton garage est encore plein le dimanche soir »
fonctionne ; « optimise ton espace » ne veut rien dire. Pas de slogan, pas de jeu de mots,
pas de question rhétorique dont la réponse est évidente.

CE QUE TU N’ÉCRIS JAMAIS
- Une promesse que le produit ne tient pas · une créa qui sur-promet fait un mauvais client, pas une vente.
- Un chiffre inventé. Si tu n’as pas de preuve chiffrée, écris la scène plutôt que la statistique.
- Une accroche déjà utilisée par un concurrent · tu en reprends la MÉCANIQUE, jamais les mots.

L’HYPOTHÈSE N’EST PAS UN RÉSUMÉ
« Cette pub montre le produit » n’est pas une hypothèse. « Montrer le désordre AVANT le produit
retient plus longtemps qu’une ouverture packshot » en est une · elle peut se révéler fausse.`;

export interface DraftPromptContext {
  brandName: string;
  /** Mémoire complète · mesurée, marché, accroches. */
  memory: string;
  rules?: string | null;
  identity?: string | null;
}

/**
 * Compose la consigne de rédaction.
 *
 * Comme partout, ce qui prime ferme la consigne · les règles maison en dernier,
 * à l'endroit dont un modèle se souvient le mieux.
 */
export function draftPrompt(req: DraftRequest, ctx: DraftPromptContext): string {
  const blocs: string[] = [SOCLE];

  blocs.push(`MARQUE\n${ctx.brandName}${ctx.identity ? `\n${ctx.identity.trim().slice(0, 1200)}` : ''}`);

  if (ctx.memory.trim()) {
    blocs.push(`CE QUE TU SAIS DE CETTE MARQUE\n${ctx.memory.trim().slice(0, 8000)}`);
  } else {
    blocs.push(
      'CE QUE TU SAIS DE CETTE MARQUE\n'
      + 'Rien de mesuré. Écris à partir de l’identité de marque seule, et n’invoque aucun résultat passé.',
    );
  }

  blocs.push(mission(req));

  // Le gel en DERNIER, juste avant les règles · c'est la contrainte qu'un
  // modèle oublie le plus volontiers, parce qu'elle lui interdit d'être créatif
  // là où il aimerait l'être.
  if (req.freeze?.length) {
    blocs.push(
      'INTERDIT DE TOUCHER · ces éléments sont ACQUIS, ils ont été payés par un test\n'
      + req.freeze.map((f) => `- ${f}`).join('\n')
      + '\nSi ton concept en modifie un, il est faux · recommence.',
    );
  }

  if (ctx.rules?.trim()) {
    blocs.push(`RÈGLES MAISON · elles priment sur tes préférences\n${ctx.rules.trim().slice(0, 1800)}`);
  }

  return blocs.join('\n\n---\n\n');
}

function mission(req: DraftRequest): string {
  const intent = req.intent.trim().slice(0, 600);
  if (req.origin === 'suite') {
    return `CE QU’ON TE DEMANDE\n${intent}\n`
      + (req.changedVariable
        ? `\nTu changes UNE seule chose : ${req.changedVariable}. Tout le reste continue le concept d’origine ·\n`
          + 'c’est ce qui permettra d’attribuer le résultat à cette variable et à aucune autre.'
        : '');
  }
  if (req.origin === 'radar') {
    return `CE QU’ON TE DEMANDE\n${intent}\n`
      + (req.marketMechanic
        ? `\nMécanique observée chez un concurrent : ${req.marketMechanic}.\n`
          + 'Reprends-en le RESSORT — ce qui fait qu’elle retient — et écris une créa qui n’a rien\n'
          + 'en commun avec la sienne dans les mots, le décor ou le personnage.'
        : '');
  }
  return `CE QU’ON TE DEMANDE\n${intent}`;
}

/* -------------------------------------------------------------------------- */
/*  La relecture                                                              */
/* -------------------------------------------------------------------------- */

/** Au-delà, le modèle tourne en rond · mieux vaut le dire que boucler. */
export const MAX_REECRITURES = 1;

export interface ReviewOutcome {
  /** Faut-il redemander une version ? */
  rewrite: boolean;
  /** La consigne de correction · vide quand rien à corriger. */
  instruction: string | null;
  /** Ce qu'on dira à l'utilisateur si on ne corrige pas. */
  warning: string | null;
}

/**
 * Ce qu'on fait du brouillon après l'avoir relu.
 *
 * Un seul motif justifie de réécrire : **une accroche déjà réfutée**. C'est un
 * fait, pas une préférence · aucune discussion possible, et le coût d'un second
 * appel est dérisoire face à celui d'un test perdu d'avance.
 *
 * Un profil statistiquement faible ne déclenche PAS de réécriture. On le signale
 * et on laisse décider : la mémoire éclaire, elle n'interdit pas · et un concept
 * neuf a par construction un profil qu'on ne connaît pas.
 */
export function reviewDraft(brief: PrelaunchBrief, attempts: number): ReviewOutcome {
  const refutee = brief.flags.find((f) => f.kind === 'hook_refuted');

  if (refutee && attempts <= MAX_REECRITURES) {
    return {
      rewrite: true,
      instruction:
        `Ton accroche reprend une formulation qui a DÉJÀ PERDU chez cette marque.\n${refutee.message}\n`
        + 'Réécris-la entièrement · change l’angle d’attaque, pas seulement les mots. Garde le reste du concept.',
      warning: null,
    };
  }

  if (refutee) {
    // Deuxième passage et toujours la même accroche · on arrête et on le dit,
    // plutôt que de payer un troisième appel pour la même réponse.
    return {
      rewrite: false, instruction: null,
      warning: 'Jarvis a réécrit une fois et propose encore une accroche proche d’une perdante · relis-la avant de lancer.',
    };
  }

  const alerte = brief.flags.find((f) => f.tone === 'warn');
  return {
    rewrite: false, instruction: null,
    // La mémoire éclaire, elle n'interdit pas.
    warning: alerte ? alerte.message : null,
  };
}

/* -------------------------------------------------------------------------- */

/** Vérifie qu'un brouillon est exploitable · un modèle rend parfois du vide poli. */
export function isUsableDraft(d: Partial<DraftOut> | null | undefined): d is DraftOut {
  return !!d
    && typeof d.headline === 'string' && d.headline.trim().length >= 8
    && Array.isArray(d.beats) && d.beats.filter((b) => b?.trim()).length >= 3
    && typeof d.hypothesis === 'string' && d.hypothesis.trim().length >= 15;
}
