import { CHEMIN_IMPORT_RESULTATS } from '../../parcours-boucle';
import type { SeuilMinimumMoteur } from '../../adsmap/verdict';
import { PRESENTATION_ETAT_LOT, etatLotSpatial, type ContexteLots, type EtatLotSpatial, type FaitsVerdictVariante } from './lots';
import {
  diagnosticFinPrevue, finPrevueAccueil, lienImportLot, sourcesImportLot,
  type FinPrevueAccueil, type LotImport, type VarianteFinPrevue,
} from './fin-prevue';

/**
 * Spatial · Résultats · l'écran d'import choisit SON lot (ligne I06) · et chaque
 * « Importer » d'un lot y arrive sur ce lot. Pur · ni base, ni réseau, ni horloge.
 *
 * L'adresse est l'état · `/adsmap/import` (« Tous les lots », l'écran tel qu'il
 * était) ou `/adsmap/import?lot=<id>` (`lienImportLot`, LA seule fonction
 * d'adresse de l'import d'un lot · l'Accueil, « Lots de test », la fiche d'un
 * lot, la boucle et la vue d'ensemble la lisent, aucune copie).
 *
 * La liste « Lot » ne lit RIEN de plus · les lots déjà lus par l'écran
 * (`chargerLots` · lots de la marque active, ads sous la portée de la marque,
 * même ordre et même borne que « Lots de test » et le compte « à conclure »).
 */

/** Une variante telle que la liste la lit · l'état de son lot (statut, verdict calculé) et le diagnostic (plateforme, agrégat). */
export type VarianteListeImport = VarianteFinPrevue & FaitsVerdictVariante;

export interface LotListeImport {
  id: string;
  numero: number;
  but: string | null;
  statut: string;
  lanceLe: string | null;
  ads: ReadonlyArray<VarianteListeImport>;
}

/** Ce que la règle `lotAttendDesMesures` lit d'un lot · son état (statut, lancement, verdicts) et ses variantes · ni son but, ni son identité. */
export type FaitsLotAImporter = Pick<LotListeImport, 'statut' | 'lanceLe' | 'ads'>;

/** Les états d'un lot qui reçoit encore des mesures · lancé, suivi dans l'outil, pas encore à arbitrer. */
const ETATS_EN_MESURE: ReadonlySet<EtatLotSpatial> = new Set<EtatLotSpatial>(['diffusion', 'a_importer']);

/**
 * Ce lot attend-il des mesures · en diffusion ou « Mesures à importer » (jamais
 * en préparation, prêt, historique importé, à arbitrer ni conclu), une source
 * existe (une variante diffusée sur Meta · `sourcesImportLot`), ET la cause
 * mesurée est une mesure (`diagnosticFinPrevue` · aucune mesure reçue, des
 * variantes sans mesure, ou sous le minimum du moteur de la MARQUE) · « chaque
 * variante a ses mesures » et le silence n'attendent rien.
 */
export function lotAttendDesMesures(l: FaitsLotAImporter, ctx: ContexteLots, seuil: SeuilMinimumMoteur): boolean {
  if (!ETATS_EN_MESURE.has(etatLotSpatial(l, ctx))) return false;
  if (!sourcesImportLot(l.ads).ok) return false;
  const d = diagnosticFinPrevue(l.ads, seuil);
  return !!d && d.cas !== 'autre';
}

export const LIBELLE_LISTE_LOT = 'Lot';
export const TOUS_LES_LOTS = 'Tous les lots';
export const AIDE_LISTE_LOT = 'Les lots de la marque qui attendent des mesures · en diffusion ou à importer, une variante sans mesure ou sous le minimum du moteur. « Tous les lots » · l’export se rattache ligne par ligne, comme avant.';

export interface OptionLotImport { id: string; libelle: string }

export interface ListeLotImport {
  /** La valeur choisie · `''` = « Tous les lots ». */
  choisi: string;
  options: OptionLotImport[];
}

/**
 * La liste « Lot » de l'écran d'import · les lots qui attendent des mesures,
 * dans l'ordre où l'écran les a lus · et le lot de l'adresse s'il est dans la
 * portée sans attendre (un « Importer » l'y a mené · l'adresse reste l'état) ·
 * `null` quand aucun lot n'est à choisir (l'écran reste tel qu'il était).
 * `cible` est le lot déjà retenu par `lotCibleImport` (dans la portée) ou `null`.
 */
export function listeLotImport(lots: readonly LotListeImport[], cible: string | null, ctx: ContexteLots, seuil: SeuilMinimumMoteur): ListeLotImport | null {
  const retenus = lots.filter((l) => l.id === cible || lotAttendDesMesures(l, ctx, seuil));
  if (!retenus.length) return null;
  return {
    choisi: cible && retenus.some((l) => l.id === cible) ? cible : '',
    options: retenus.map((l) => ({
      id: l.id,
      libelle: [`Lot #${l.numero}`, l.but?.trim() || null, PRESENTATION_ETAT_LOT[etatLotSpatial(l, ctx)].statut].filter(Boolean).join(' · '),
    })),
  };
}

/** La sélection devient l'adresse · `''` (« Tous les lots ») → l'écran sans lot · un lot → l'écran ouvert sur lui. */
export function adresseListeLot(valeur: string): string {
  return valeur ? lienImportLot(valeur) : CHEMIN_IMPORT_RESULTATS;
}

/* ───────────── le compte « à importer » · la pastille du rail ───────────── */

/**
 * Le compte « à importer » · le nombre de lots de la liste « Lot » de l'écran
 * d'import qui ATTENDENT des mesures (`listeLotImport` sans lot dans l'adresse),
 * par la MÊME règle (`lotAttendDesMesures`, aucune copie), dans l'ordre reçu
 * (celui de la liste · le plus récent d'abord). DISTINCT du compte « à
 * conclure » (`compteAConclure`) · un lot à conclure n'attend aucune mesure,
 * un lot qui attend ses mesures n'a rien à arbitrer · les deux ne
 * s'additionnent jamais (deux pastilles, deux unités, deux destinations).
 */
export interface CompteAImporter {
  n: number;
  /** Les lots comptés, dans l'ordre de la liste. */
  lots: ReadonlyArray<{ id: string; numero: number }>;
}

export function compteAImporter(lots: ReadonlyArray<FaitsLotAImporter & { id: string; numero: number }>, ctx: ContexteLots, seuil: SeuilMinimumMoteur): CompteAImporter {
  const s = lots.filter((l) => lotAttendDesMesures(l, ctx, seuil));
  return { n: s.length, lots: s.map((l) => ({ id: l.id, numero: l.numero })) };
}

/** La pastille « à importer » du rail · un lien (jamais un simple point) vers l'import. */
export interface PastilleAImporter {
  /** Le compteur dessiné (`rbadge` de la maquette). */
  valeur: string;
  /** `/adsmap/import?lot=<id>` quand UN lot attend (l'écran s'ouvre sur lui) · `/adsmap/import` sinon (la liste « Lot » montre ceux qui attendent). */
  href: string;
  titre: string;
  /** Le compte dit en mots · nom du lien (lecteur d'écran) et bulle du rail replié. */
  libelle: string;
  /** Le sous-titre du rail ouvert · court (la colonne du libellé s'arrête avant le compteur, mesuré au rendu). */
  sous: string;
}

export const TITRE_PASTILLE_A_IMPORTER = 'À importer';

/** Posée s'il existe AU MOINS un lot qui attend ses mesures, absente sinon. */
export function pastilleAImporter(c: CompteAImporter): PastilleAImporter | null {
  if (c.n <= 0 || !c.lots.length) return null;
  const un = c.n === 1 ? c.lots[0]! : null;
  return {
    valeur: String(c.n),
    href: un ? lienImportLot(un.id) : CHEMIN_IMPORT_RESULTATS,
    titre: TITRE_PASTILLE_A_IMPORTER,
    libelle: un ? `Lot #${un.numero} · attend ses mesures` : `${c.n} lots attendent leurs mesures`,
    sous: un ? `Mesures du lot #${un.numero}` : `Mesures de ${c.n} lots`,
  };
}

/* ───────────────────────── après le dépôt d'un export ───────────────────────── */

type AnnonceVersLot = { cle: string; etat: string; cible: { lot: number | null; variante: string } | null };

/**
 * Les variantes du lot choisi qui restent SANS MESURE après ce fichier · celles
 * qui n'en ont aucune aujourd'hui (`sans-mesure`) et qu'aucune annonce qui
 * SERA écrite ne vise · une annonce rattachée, ou une proposition à confirmer
 * cochée (exactement ce que `applyMesuresAction` écrira) · une ambiguë ou non
 * rattachée n'est jamais écrite, elle ne couvre rien.
 */
export function variantesSansMesureApres(lot: Pick<LotImport, 'numero' | 'variantes'>, annonces: readonly AnnonceVersLot[], confirmees: ReadonlySet<string>): string[] {
  const couvertes = new Set(annonces
    .filter((a) => a.cible?.lot === lot.numero && (a.etat === 'rattachee' || (a.etat === 'a_confirmer' && confirmees.has(a.cle))))
    .map((a) => a.cible!.variante));
  return lot.variantes.filter((v) => v.etat === 'sans-mesure' && !couvertes.has(v.code)).map((v) => v.code);
}

/** La phrase · `null` quand aucune variante du lot n'était sans mesure (rien à dire). */
export function phraseSansMesureApres(lot: Pick<LotImport, 'numero' | 'variantes'>, restantes: readonly string[]): string | null {
  if (!lot.variantes.some((v) => v.etat === 'sans-mesure')) return null;
  if (!restantes.length) return `Avec ce fichier, plus aucune variante du lot #${lot.numero} ne reste sans mesure.`;
  const k = restantes.length;
  return `${k} variante${k > 1 ? 's' : ''} du lot #${lot.numero} ${k > 1 ? 'restent' : 'reste'} sans mesure après ce fichier · ${restantes.join(', ')}.`;
}

/* ───────────────────────── la fiche d'un lot ───────────────────────── */

/**
 * La fiche d'un lot « Mesures à importer » · le même geste que l'Accueil
 * (`finPrevueAccueil` · le cas mesuré, l'import ouvert sur CE lot, fermé avec
 * sa raison, ou aucune source dit) · rien pour un lot dans un autre état.
 */
export function importFicheLot(p: Parameters<typeof finPrevueAccueil>[0] & { etat: EtatLotSpatial }): FinPrevueAccueil | null {
  return p.etat === 'a_importer' ? finPrevueAccueil(p) : null;
}
