import { FENETRE_SYNCHRO_JOURS } from '../../adsmap/pagination-meta';
import type { VerdictValue } from '../../adsmap/types';
import { decalerJour, jourParis } from '../accueil/temps';
import type { ContexteLots } from './lots';

/**
 * Spatial · Résultats · une mesure qui s'est ARRÊTÉE avant la fin de la
 * fenêtre du moteur. Pur · ni base, ni réseau, ni horloge (l'instant arrive en
 * paramètre).
 *
 * Constat · l'état d'un lot ne retenait « Mesures à importer » que si une
 * variante n'avait AUCUN verdict · la date du verdict (`adsmap_verdicts.computed_at`)
 * n'était jamais lue. Le jeton Meta expire à J3 · les verdicts de J3 (souvent
 * « non concluant », la fenêtre n'est pas finie) restent en base · à J8 le lot
 * devenait « Non concluant », présenté comme une conclusion, ou « À conclure »
 * si un verdict de J3 était tranché (un coût déjà trop haut) · sur trois jours
 * de mesures sur sept.
 *
 * La règle · un verdict CALCULÉ (pas encore arbitré · un arbitrage est une
 * décision humaine, et une variante arbitrée sort de la synchro) dont le jour
 * de calcul précède le jour où la fenêtre du moteur se ferme n'a pas lu la
 * fenêtre entière · une fois la fenêtre écoulée, c'est une MESURE MANQUANTE.
 * La synchro recalcule chaque nuit chaque variante encore diffusée ou en pause
 * (`recalculerVerdicts` · `computed_at` = l'instant du passage), l'import d'un
 * export recalcule chaque variante du lot touché · un verdict à jour porte le
 * jour du dernier passage.
 *
 * Le JOUR · le jour de calendrier à PARIS (`jourParis`), celui de l'Accueil
 * (période du reporting, « aujourd'hui ») · pour le lancement comme pour le
 * calcul. La fenêtre se ferme le jour `jourParis(lancement) + fenêtre` (le
 * premier jour qui suit les `fenêtre` jours agrégés par le moteur). Le moteur,
 * lui, découpe sa fenêtre en jours UTC (`evaluationWindow`) · le jour de Paris
 * vaut le jour UTC, ou le suivant entre minuit et 1 h (2 h l'été) · la règle
 * n'est donc JAMAIS plus indulgente que le moteur (un verdict dit à jour a lu
 * la fenêtre UTC entière), au pire plus stricte pour un lancement à cette heure-là.
 *
 * La BORNE · la règle ne parle que tant que la synchro peut encore relire la
 * fenêtre du lot · un lot lancé il y a moins de `FENETRE_SYNCHRO_JOURS` jours
 * (120 · la profondeur que la synchro redemande à Meta chaque nuit,
 * `adsmap-sync.ts` · `since = max(aujourd'hui − 120 j, premier lancement)`).
 * En deçà, le geste existe · reconnecter Meta relit le lot dès la nuit
 * suivante (ou un export s'importe), le verdict est recalculé, l'état
 * d'avant revient s'il était juste. Au-delà, la connexion ne peut plus
 * ramener ces jours · « Mesures à importer » deviendrait une impasse
 * permanente (le lot ne s'arbitre plus, `lotArbitrable`) · la règle de l'ÉTAT
 * (`mesureArretee`) se tait et le lot retrouve l'état de ses verdicts,
 * l'arbitrage reste possible. Le CONSTAT, lui, n'a pas de borne
 * (`mesureArreteeConstatee`) · la phrase (`diagnosticFinPrevue` · l'Accueil,
 * l'import, la fiche, `reserveFenetreIncomplete`) dit toujours « mesures
 * arrêtées » · l'arbitre sait qu'il tranche sur une fenêtre incomplète.
 *
 * Un lot ANCIEN jamais arbitré n'est pas touché pour autant · tant que la
 * synchro tourne, chaque variante diffusée ou en pause d'un lot dont une
 * variante remonte est recalculée chaque nuit (`computed_at` = la nuit
 * dernière) · une variante qui ne diffuse plus reste lue tant que ses jours
 * tiennent dans les 120 jours · son dernier calcul tombe donc bien après la
 * fin de sa fenêtre. Seul un lot dont AUCUN calcul n'a eu lieu depuis le jour
 * où sa fenêtre s'est fermée (connexion coupée pendant la fenêtre, jamais
 * rétablie, aucun export importé après) bascule · c'est le défaut corrigé.
 * L'upsert du verdict réécrit `computed_at` à chaque passage depuis la
 * première synchro (8866056b) · aucun historique figé au premier calcul.
 *
 * Mesuré (banc · la règle elle-même, appelée heure par heure sur les 72 h
 * qui suivent l'écoulement de la fenêtre · fenêtre 7 j, un lancement à chaque
 * heure ronde de Paris du 5 octobre 2026, un passage de synchro par jour à
 * l'heure dite) · combien d'heures un lot dit « mesures manquantes » ·
 *
 * | règle                                     | synchro saine, 7 h Paris | synchro saine, 9 h Paris | synchro arrêtée à J3 |
 * |-------------------------------------------|--------------------------|--------------------------|----------------------|
 * | instant · calcul < lancement + 7 × 24 h   | 11,5 h (max 23 h)        | 11,5 h (max 23 h)        | ·                    |
 * | jour de Paris · RETENUE                   | 1,2 h (max 7 h)          | 1,9 h (max 9 h)          | 72 h sur 72          |
 *
 * (moyenne sur les 24 heures de lancement). Seul un lancement avant l'heure
 * de la synchro garde un écart, jusqu'à la synchro du jour où la fenêtre se
 * ferme · un lot lancé après l'heure de la synchro n'en a aucun. Un lot dont
 * la synchro s'arrête à J3 est dit « mesures manquantes » dès que la fenêtre
 * s'écoule, sans interruption.
 */

const JOUR = 86_400_000;
const HEURE = 3_600_000;

/** Jours ENTIERS écoulés depuis le lancement · `null` sans date lisible (même calcul que `lib/decisions`). */
export function joursEntiersDepuis(lanceLe: string | null, maintenant: Date): number | null {
  if (!lanceLe) return null;
  const t = Date.parse(lanceLe);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((maintenant.getTime() - t) / JOUR));
}

/** La fenêtre du moteur d'UN lot · son lancement, la fenêtre de la marque, l'instant. */
export type FenetreDuLot = ContexteLots & { lanceLe: string | null };

/** Ce que la règle lit d'un verdict · son statut, sa valeur calculée, l'instant du calcul (ISO). Sans statut ni date lus · jamais arrêtée (on ne devine pas). */
export interface VerdictDate {
  statut?: 'computed' | 'validated';
  calcule: VerdictValue | null;
  /** `adsmap_verdicts.computed_at` (ISO) · absent ou `null` · non lu. */
  calculeLe?: string | null;
}

/** Le jour de Paris où la fenêtre du moteur se ferme (`YYYY-MM-DD`) · `null` sans lancement lisible. */
export function jourFinFenetre(lanceLe: string | null, fenetreJours: number): string | null {
  const t = lanceLe ? Date.parse(lanceLe) : NaN;
  if (!Number.isFinite(t) || !Number.isFinite(fenetreJours)) return null;
  return decalerJour(jourParis(new Date(t)), Math.max(0, Math.round(fenetreJours)));
}

/** Le jour de Paris d'un calcul · `null` illisible. */
export function jourDuCalcul(v: VerdictDate | null | undefined): string | null {
  const t = v?.calculeLe ? Date.parse(v.calculeLe) : NaN;
  return Number.isFinite(t) ? jourParis(new Date(t)) : null;
}

/**
 * Le CONSTAT · la mesure de cette variante s'est-elle arrêtée avant la fin de
 * la fenêtre · la fenêtre est écoulée (même calcul que l'état du lot), le
 * verdict est calculé, pas arbitré, daté, et son jour de calcul précède le
 * jour où la fenêtre se ferme. SANS la borne de relecture · ce que la phrase
 * dit (`mesuresArretees` → `diagnosticFinPrevue`), à tout âge. Sans verdict ·
 * ce n'est pas une mesure ARRÊTÉE (elle n'a jamais commencé · l'état du lot le
 * dit déjà).
 */
export function mesureArreteeConstatee(v: VerdictDate | null | undefined, f: FenetreDuLot): boolean {
  if (!v || v.statut !== 'computed' || !v.calcule || !v.calculeLe) return false;
  const t = Date.parse(v.calculeLe);
  if (!Number.isFinite(t)) return false;
  const jours = joursEntiersDepuis(f.lanceLe, f.maintenant);
  if (jours === null || jours < f.fenetreJours) return false;
  // Sans lire le calendrier (un formateur de fuseau coûte · mesuré, le compte « à importer » sur chaque
  // sous-ensemble de son corpus passait de 1,9 s à 66 s) · l'heure d'été ne décale l'heure de Paris que
  // d'une heure · un écart ≥ (fenêtre + 1) × 24 h depuis le lancement tombe forcément un jour de Paris ≥
  // celui où la fenêtre se ferme, un écart < (fenêtre − 1) × 24 h − 1 h forcément avant · seuls les calculs
  // proches de la frontière lisent le calendrier (même résultat, éprouvé demi-heure par demi-heure aux deux changements d'heure dans le test).
  const ecart = t - Date.parse(f.lanceLe!);
  if (ecart >= (f.fenetreJours + 1) * JOUR) return false;
  if (ecart < (f.fenetreJours - 1) * JOUR - HEURE) return true;
  const fin = jourFinFenetre(f.lanceLe, f.fenetreJours);
  const le = jourDuCalcul(v);
  return !!fin && !!le && le < fin;
}

/**
 * L'ÉTAT · la mesure arrêtée compte comme une mesure MANQUANTE
 * (`etatLotSpatial` · « Mesures à importer ») · le constat
 * (`mesureArreteeConstatee`), tant que la synchro peut encore relire le lot
 * (lancé il y a moins de `FENETRE_SYNCHRO_JOURS` jours · la borne, plus haut).
 * Au-delà, le lot s'arbitre · la phrase, elle, le dit toujours.
 */
export function mesureArretee(v: VerdictDate | null | undefined, f: FenetreDuLot): boolean {
  const jours = joursEntiersDepuis(f.lanceLe, f.maintenant);
  return jours !== null && jours < FENETRE_SYNCHRO_JOURS && mesureArreteeConstatee(v, f);
}

/** Les variantes dont la mesure s'est arrêtée (le CONSTAT, sans borne · la phrase) · leur nombre et le jour du DERNIER calcul parmi elles (`null` sans aucune). */
export function mesuresArretees(verdicts: ReadonlyArray<VerdictDate | null | undefined>, f: FenetreDuLot): { variantes: number; le: string } | null {
  const jours = verdicts.filter((v) => mesureArreteeConstatee(v, f)).map((v) => jourDuCalcul(v)!).sort();
  return jours.length ? { variantes: jours.length, le: jours.at(-1)! } : null;
}
