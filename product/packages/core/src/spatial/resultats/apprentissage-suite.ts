import type { VerdictValue } from '../../adsmap/types';
import { LIBELLE_VERDICT } from '../../adsmap/verdict-libelle';
import { lienIterationStudio } from '../../studios/anciennes-adresses';
import { ajouterRegleMarque, lireReglesMarque } from '../marque/regles';
import { lienLotSpatial, verdictAffiche } from './lots';
import { etatApprentissage, niveauPreuveApprentissage, type EtatApprentissage, type FaitsApprentissage } from './ecrans';
import { LIBELLE_CONCLUSION_LOT, type LectureConclusion } from './conclusion-lot';

/**
 * Spatial · Résultats · ce qu'on FAIT d'un apprentissage · le suivre (Itérer),
 * savoir d'où il vient (tiroir), le filtrer par état, le passer aux règles de la
 * marque. Pur · ni base, ni réseau, ni modèle.
 */

/** Les filtres d'état de la maquette V5 (« Tous · À valider · Validés · À retester »). */
export type FiltreEtatApprentissage = 'tous' | EtatApprentissage;
export const FILTRES_ETAT_APPRENTISSAGE: ReadonlyArray<{ cle: FiltreEtatApprentissage; libelle: string }> = [
  { cle: 'tous', libelle: 'Tous' }, { cle: 'valider', libelle: 'À valider' }, { cle: 'valide', libelle: 'Validés' }, { cle: 'retester', libelle: 'À retester' },
];
export function dansFiltreEtatApprentissage(etat: EtatApprentissage, f: FiltreEtatApprentissage): boolean {
  return f === 'tous' || etat === f;
}

const GAGNANTES: ReadonlySet<VerdictValue> = new Set<VerdictValue>(['winner', 'baby_winner']);

/**
 * Le geste d'une carte · on n'itère que sur une gagnante AU PROTOCOLE (§2.4,
 * `checkIteration`) · « Itérer » ouvre alors la préparation du projet, brief
 * d'itération repris depuis CETTE variante. Un apprentissage validé sur une
 * perdante renvoie à son lot · un apprentissage à retester renvoie aux
 * hypothèses · à valider, au lot où il s'écrit.
 */
export function actionApprentissage(f: FaitsApprentissage): { libelle: string; href: string; boucle: boolean } {
  const etat = etatApprentissage(f);
  const lot = f.ad?.lot ? lienLotSpatial(f.ad.lot.id) : null;
  if (etat === 'retester') return { libelle: 'Tester', href: '/adsmap/hypotheses', boucle: false };
  if (etat === 'valider') return { libelle: 'Voir le lot', href: lot ?? '/adsmap/lots', boucle: false };
  const v = verdictAffiche(f.ad?.verdict ?? null);
  if (f.ad && v && GAGNANTES.has(v)) return { libelle: 'Itérer', href: lienIterationStudio(f.ad.id), boucle: true };
  return lot ? { libelle: 'Voir le lot', href: lot, boucle: false } : { libelle: 'Voir les suites', href: '/adsmap/suites', boucle: false };
}

/** « Vaut pour » · la portée saisie à l'arbitrage (`adsmap_learning_scope`). */
export const LIBELLE_PORTEE: Record<string, string> = {
  ad: 'Cette variante seulement', concept: 'Le concept entier', angle: 'L’angle', desire: 'Le désir',
  avatar: 'L’avatar', format: 'Le format', element: 'Cet élément de la créa', landing: 'La page de destination', offer: 'L’offre',
};

const SOURCE: Record<string, string> = { arbitrage: 'Arbitré dans l’outil, à la conclusion du lot', 'import Sheet': 'Repris du tableau importé' };
const LIMITE_NIVEAU: Record<1 | 2 | 3, string> = {
  3: 'Mesuré sur un verdict comparable · vaut pour ce protocole et cette fenêtre d’évaluation.',
  2: 'Sans comparaison au protocole · à confirmer par un test suivi.',
  1: 'Aucun verdict derrière · à vérifier par un test.',
};
const dateLongue = (iso: string) => {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
};

export interface TiroirApprentissage { origine: string[]; limites: string[]; vautPour: string }

/**
 * Le tiroir « D'où ça vient · Limites · Vaut pour » · chaque ligne est un fait
 * passé en entrée (source, lot, verdicts, date, niveau, confiance, conclusion du
 * lot) · rien n'est déduit au-delà, une absence ne s'écrit pas.
 */
export function tiroirApprentissage(f: FaitsApprentissage, conclusion: LectureConclusion | null = null): TiroirApprentissage {
  const origine: string[] = [SOURCE[f.source ?? ''] ?? 'Saisi à la main'];
  const v = f.ad?.verdict ?? null;
  if (f.ad) {
    const retenu = verdictAffiche(v);
    const brut = v?.retenu ?? v?.calcule ?? null;
    const morceaux = [f.ad.lot ? `Lot #${f.ad.lot.numero}` : 'Hors lot', `variante ${f.ad.variante}`];
    if (retenu) morceaux.push(`verdict « ${LIBELLE_VERDICT[retenu].court} »`);
    if (v?.calcule && v.retenu && v.calcule !== v.retenu) morceaux.push(`le moteur avait calculé « ${LIBELLE_VERDICT[v.calcule].court} »`);
    else if (brut && retenu && brut !== retenu) morceaux.push(`déclaré « ${LIBELLE_VERDICT[brut].court} », hors protocole`);
    origine.push(morceaux.join(' · '));
  }
  const le = dateLongue(f.creeLe);
  if (le) origine.push(`Écrit le ${le}`);

  const limites = [LIMITE_NIVEAU[niveauPreuveApprentissage(f)]];
  if (f.refute) limites.push('Rejeté · Jarvis ne le relit plus avant d’écrire une créa.');
  if (typeof f.confiance === 'number' && f.confiance >= 1 && f.confiance <= 5) limites.push(`Confiance déclarée · ${f.confiance} sur 5.`);
  if (conclusion && conclusion.conclusion !== 'en_attente' && f.ad?.lot) limites.push(`Conclusion du lot #${f.ad.lot.numero} · ${LIBELLE_CONCLUSION_LOT[conclusion.conclusion]} · ${conclusion.phrase}`);
  if (f.versRegles) { const d = dateLongue(f.versRegles); limites.push(`Passé dans les règles de la marque${d ? ` le ${d}` : ''}.`); }

  return { origine, limites, vautPour: (f.portee && LIBELLE_PORTEE[f.portee]) || 'Portée non précisée' };
}

/* ───────────────────────── vers les règles de la marque ───────────────────────── */

const norme = (s: string) => s.replace(/\s+/g, ' ').trim().toLocaleLowerCase('fr-FR');

/** L'énoncé est-il déjà une règle de la marque (mot pour mot, casse et espaces ignorés) ? Lu dans le texte RÉEL des règles. */
export function regleDejaPresente(regles: string | null | undefined, enonce: string): boolean {
  const e = norme(enonce);
  return !!e && lireReglesMarque(regles).some((r) => norme(r.texte) === e);
}

/**
 * Peut-on passer cet apprentissage dans les règles de la marque, et quand ce
 * n'est pas possible, pourquoi · seul un apprentissage VALIDÉ, non rejeté, passe
 * (un constat à valider ou à retester n'a encore rien prouvé). « Déjà dans les
 * règles » se lit dans le texte des règles (`regleDejaPresente`), pas dans la
 * trace · une règle retirée à la main peut revenir.
 */
export function refusVersRegles(f: Pick<FaitsApprentissage, 'statut' | 'refute'>, dansLesRegles: boolean): string | null {
  if (f.refute) return 'Rejeté · un apprentissage rejeté ne devient pas une règle.';
  if (f.statut !== 'validated') return 'À valider d’abord · il s’écrit en concluant le lot.';
  if (dansLesRegles) return 'Déjà dans les règles de la marque.';
  return null;
}

/**
 * Le texte des règles APRÈS ajout de l'apprentissage · une « Préférence »
 * (Jarvis s'en sert quand c'est possible · un constat de test n'est ni un
 * interdit ni une obligation). Refusé s'il y est déjà, mot pour mot, ou si le
 * texte dépasserait la longueur de `saveJarvisRulesAction`.
 */
export function regleDepuisApprentissage(regles: string | null | undefined, enonce: string): { ok: true; suivant: string } | { ok: false; raison: string } {
  const e = enonce.replace(/\s+/g, ' ').trim();
  if (!e) return { ok: false, raison: 'Cet apprentissage n’a pas d’énoncé à reprendre.' };
  if (regleDejaPresente(regles, e)) return { ok: false, raison: 'Déjà dans les règles de la marque.' };
  const suivant = ajouterRegleMarque(regles, 'pref', e);
  return suivant === null ? { ok: false, raison: 'Les règles dépassent la longueur maximale · retires-en une avant d’ajouter.' } : { ok: true, suivant };
}
