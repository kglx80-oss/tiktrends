/**
 * Ce qu'un lot d'essai a répondu.
 *
 * ── Le piège qu'on refuse ────────────────────────────────────────────────────
 *
 * Un essai produit quatre publicités, une par bras. Chacune reçoit UN verdict.
 * Chaque bras a donc un effectif de UN.
 *
 * La tentation est d'afficher « 4,2 % contre 2,1 % » avec un intervalle. Ce
 * serait un taux calculé sur une observation, c'est-à-dire un nombre qui a
 * l'air d'une mesure et n'en est pas une. Un lot d'essai, seul, est une PISTE.
 *
 * ── Ce qui devient une mesure ────────────────────────────────────────────────
 *
 * Les bras d'un essai de mise en page sont toujours les mêmes quatre coquilles.
 * Ceux d'un essai d'ambiance, les mêmes univers. En répétant l'essai, on
 * accumule des comparaisons APPARIÉES · « l'affiche a gagné cinq fois sur six,
 * chaque fois contre la même scène et les mêmes textes ».
 *
 * C'est un plan bien plus puissant qu'un taux global, parce que tout le reste
 * était tenu à chaque fois. Et ça se cumule, parce que le vocabulaire des bras
 * est fermé.
 *
 * ── Ce qui ne se cumulera jamais ─────────────────────────────────────────────
 *
 * Les accroches. Chaque essai en compare quatre nouvelles · deux essais ne
 * parlent pas des mêmes bras, et additionner leurs victoires reviendrait à
 * compter combien de fois « la première accroche écrite » gagne. Le fichier le
 * dit au lieu de produire un chiffre.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import { wilsonInterval, type Interval } from './stats';
import type { VerdictValue } from './types';

/** Les variables dont les bras se répètent d'un essai à l'autre. */
export const CUMULABLES = ['mise_en_page', 'univers'] as const;
export type VariableEssai = 'accroche' | 'mise_en_page' | 'univers';

export function estCumulable(v: VariableEssai): boolean {
  return (CUMULABLES as readonly string[]).includes(v);
}

const GAGNANTS = new Set<VerdictValue>(['winner', 'baby_winner', 'relative_winner']);

/** Une publicité d'un lot d'essai, telle qu'on la lit. */
export interface AdEssai {
  groupe: string;
  variable: VariableEssai;
  /** La valeur testée par ce bras · la coquille, l'univers, ou l'accroche. */
  valeur: string;
  verdict: VerdictValue | null;
}

export interface BrasEssai {
  valeur: string;
  verdict: VerdictValue | null;
  gagnant: boolean;
  /** Le verdict est tombé · un bras encore en cours ne prouve ni ne réfute. */
  arbitre: boolean;
}

export interface EssaiLu {
  groupe: string;
  variable: VariableEssai;
  bras: BrasEssai[];
  /** L'essai a désigné UN vainqueur · zéro ou deux ne tranchent pas. */
  tranche: boolean;
  gagnant: string | null;
  /** Ce qu'on en dit, sans jamais promettre plus que ce qu'on a. */
  resume: string;
}

/**
 * Lit un lot.
 *
 * « Tranché » exige exactement un bras gagnant ET que tous les bras soient
 * arbitrés · un essai dont deux publicités attendent encore leur verdict n'a
 * pas fini de parler, même si la troisième a déjà gagné.
 */
export function lireEssai(ads: readonly AdEssai[]): EssaiLu | null {
  const premier = ads[0];
  if (!premier) return null;

  const bras: BrasEssai[] = ads.map((a) => ({
    valeur: a.valeur,
    verdict: a.verdict,
    gagnant: !!a.verdict && GAGNANTS.has(a.verdict),
    arbitre: a.verdict !== null,
  }));

  const restants = bras.filter((b) => !b.arbitre).length;
  const gagnants = bras.filter((b) => b.gagnant);
  const tranche = restants === 0 && gagnants.length === 1;

  return {
    groupe: premier.groupe,
    variable: premier.variable,
    bras,
    tranche,
    gagnant: tranche ? gagnants[0]!.valeur : null,
    resume: resumeEssai(bras.length, restants, gagnants.length),
  };
}

function resumeEssai(total: number, restants: number, gagnants: number): string {
  if (restants > 0) {
    return restants === total
      ? 'Aucune de ces publicités n’a encore de verdict · rien à lire pour l’instant.'
      : `${restants} publicité(s) sur ${total} attendent encore leur verdict · l’essai n’a pas fini de parler.`;
  }
  if (gagnants === 0) return 'Aucun bras n’a gagné · le test a répondu non, ce qui reste une réponse.';
  if (gagnants > 1) return `${gagnants} bras ont gagné · l’essai ne tranche pas entre eux.`;
  return 'Un seul bras a gagné · une piste, sur une observation par bras. C’est en répétant l’essai que ça devient une mesure.';
}

/** Regroupe et lit tous les lots présents. */
export function lireEssais(ads: readonly AdEssai[]): EssaiLu[] {
  const par = new Map<string, AdEssai[]>();
  for (const a of ads) {
    if (!a.groupe) continue;
    const l = par.get(a.groupe);
    if (l) l.push(a); else par.set(a.groupe, [a]);
  }
  const out: EssaiLu[] = [];
  for (const lot of par.values()) {
    // Un lot réduit à un bras ne compare rien · l'afficher ferait croire qu'un
    // essai a eu lieu.
    if (lot.length < 2) continue;
    const lu = lireEssai(lot);
    if (lu) out.push(lu);
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*  Le cumul                                                                   */
/* -------------------------------------------------------------------------- */

export interface LigneCumul {
  valeur: string;
  /** Essais tranchés où ce bras était en lice. */
  participations: number;
  victoires: number;
  taux: number | null;
  interval: Interval | null;
  /** Sa borne basse dépasse le hasard · c'est ce qui autorise à conclure. */
  gagne: boolean;
}

export interface CumulEssais {
  variable: VariableEssai;
  /** Essais TRANCHÉS pris en compte · les autres n'apportent rien au cumul. */
  essais: number;
  lignes: LigneCumul[];
  /** Le taux qu'un bras obtiendrait par hasard, vu la taille des lots. */
  hasard: number;
  conclusif: boolean;
  resume: string;
}

/**
 * Combien d'essais tranchés avant d'oser une phrase.
 *
 * Cinq est bas pour une statistique et haut pour de la patience · c'est un
 * compromis assumé. La borne de Wilson fait le reste du travail : sous cinq
 * essais, elle ne dépasse jamais le hasard de toute façon.
 */
export const MIN_ESSAIS = 5;

/**
 * Cumule des essais APPARIÉS sur une variable à vocabulaire fermé.
 *
 * ── Contre quoi on compare ───────────────────────────────────────────────────
 *
 * Pas contre zéro. Un bras parmi quatre gagne une fois sur quatre par pur
 * hasard · comparer son taux de victoire à zéro déclarerait gagnante n'importe
 * quelle coquille. On compare donc au taux de hasard, calculé sur la taille
 * réelle des lots, qui n'est pas toujours la même.
 *
 * On exige que la borne BASSE de l'intervalle dépasse ce hasard · un taux
 * ponctuel au-dessus ne veut rien dire quand il repose sur six essais.
 */
export function cumulEssais(essais: readonly EssaiLu[], variable: VariableEssai): CumulEssais {
  if (!estCumulable(variable)) {
    return {
      variable, essais: 0, lignes: [], hasard: 0, conclusif: false,
      resume: 'Les accroches ne se cumulent pas · chaque essai en compare de nouvelles, et additionner leurs victoires reviendrait à compter combien de fois la première accroche écrite gagne.',
    };
  }

  const retenus = essais.filter((e) => e.variable === variable && e.tranche);
  const participations = new Map<string, number>();
  const victoires = new Map<string, number>();
  let sommeHasard = 0;

  for (const e of retenus) {
    const valeurs = [...new Set(e.bras.map((b) => b.valeur))];
    for (const v of valeurs) participations.set(v, (participations.get(v) ?? 0) + 1);
    if (e.gagnant) victoires.set(e.gagnant, (victoires.get(e.gagnant) ?? 0) + 1);
    // La taille du lot varie · un essai à deux bras donne une chance sur deux,
    // un essai à quatre une chance sur quatre.
    sommeHasard += valeurs.length ? 1 / valeurs.length : 0;
  }

  const hasard = retenus.length ? sommeHasard / retenus.length : 0;
  const assez = retenus.length >= MIN_ESSAIS;

  const lignes: LigneCumul[] = [...participations.entries()]
    .map(([valeur, n]) => {
      const k = victoires.get(valeur) ?? 0;
      const interval = n > 0 ? wilsonInterval(k, n) : null;
      return {
        valeur, participations: n, victoires: k,
        taux: n > 0 ? k / n : null,
        interval,
        gagne: assez && !!interval && interval.lo > hasard,
      };
    })
    .sort((a, b) => (b.taux ?? 0) - (a.taux ?? 0) || b.participations - a.participations);

  const vainqueurs = lignes.filter((l) => l.gagne);
  return {
    variable, essais: retenus.length, lignes, hasard,
    conclusif: vainqueurs.length > 0,
    resume: resumeCumul(retenus.length, assez, vainqueurs.map((l) => l.valeur)),
  };
}

function resumeCumul(n: number, assez: boolean, vainqueurs: string[]): string {
  if (n === 0) return 'Aucun essai tranché sur cette dimension · lances-en un et laisse-le conclure.';
  if (!assez) return `${n} essai(s) tranché(s) · il en faut ${MIN_ESSAIS} avant qu’un écart cesse d’être du hasard.`;
  if (!vainqueurs.length) return `${n} essais tranchés, et aucun bras ne se détache du hasard · c’est un résultat, pas une absence de résultat.`;
  return `${n} essais tranchés · ${vainqueurs.join(', ')} gagne plus souvent que le hasard ne l’expliquerait.`;
}
