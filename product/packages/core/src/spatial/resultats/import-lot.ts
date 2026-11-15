import { CHEMIN_IMPORT_RESULTATS } from '../../parcours-boucle';
import type { SeuilMinimumMoteur } from '../../adsmap/verdict';
import { PRESENTATION_ETAT_LOT, etatLotSpatial, type ContexteLots, type EtatLotSpatial, type FaitsVerdictVariante } from './lots';
import {
  diagnosticFinPrevue, finPrevueAccueil, finPrevuePassee, lienImportLot, sourcesImportLot,
  type FinPrevueAccueil, type LotImport, type VarianteFinPrevue,
} from './fin-prevue';
import { jourCourt } from '../accueil/temps';

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
  /** `adsmap_batches.planned_end_at` (ISO) · `null` sans fin prévue (aucun écran ne l'écrit aujourd'hui · la fenêtre du moteur prend le relais). */
  finPrevue: string | null;
  ads: ReadonlyArray<VarianteListeImport>;
}

/** Ce que la règle `lotAttendDesMesures` lit d'un lot · son état (statut, lancement, verdicts) et ses variantes · ni son but, ni son identité, ni sa fin prévue. */
export type FaitsLotEnMesure = Pick<LotListeImport, 'statut' | 'lanceLe' | 'ads'>;
/** Ce que `casMesuresLot` lit · les mêmes faits, ET la fin prévue (obligatoire · l'oublier ferait taire la pastille sans le dire). */
export type FaitsLotAImporter = Pick<LotListeImport, 'statut' | 'lanceLe' | 'finPrevue' | 'ads'>;

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
export function lotAttendDesMesures(l: FaitsLotEnMesure, ctx: ContexteLots, seuil: SeuilMinimumMoteur): boolean {
  if (!ETATS_EN_MESURE.has(etatLotSpatial(l, ctx))) return false;
  if (!sourcesImportLot(l.ads).ok) return false;
  const d = diagnosticFinPrevue(l.ads, seuil);
  return !!d && d.cas !== 'autre';
}

/**
 * Un lot qui attend des mesures (`lotAttendDesMesures`) · À QUEL MOMENT de sa vie ·
 *  · `en-cours`     · en diffusion, fin prévue pas encore passée (ou aucune) ·
 *                     les mesures montent normalement sous le minimum du
 *                     moteur · rien à faire d'ici là, la pastille se tait ;
 *  · `manquantes`   · la fin prévue est passée (`finPrevuePassee`, la règle de
 *                     l'Accueil) OU le lot est « Mesures à importer » (la
 *                     fenêtre du moteur de la MARQUE est écoulée,
 *                     `etatLotSpatial`) · il manque vraiment quelque chose.
 * `null` · le lot n'attend rien. Aucun seuil nouveau · la fin prévue, la
 * fenêtre et le minimum du moteur sont ceux qui existent.
 *
 * Sans fin prévue (aujourd'hui, toujours · aucun écran n'écrit
 * `planned_end_at`), on ne devine pas la durée du protocole · le lot reste
 * « en cours » (silence plutôt que bruit) jusqu'à ce que la fenêtre du moteur
 * s'écoule · il passe alors « Mesures à importer », donc « manquantes ». Rien
 * n'est perdu · seulement plus tôt dit. Sans date de lancement, la fenêtre ne
 * s'écoule jamais (`etatLotSpatial`) · le lot reste en cours, dans la liste.
 *
 * Mesuré avant (#1090 · `lotAttendDesMesures` seul) · sur les semis des tests
 * existants, 5 lots allumés sur 19 l'étaient en pleine diffusion, sans fin
 * prévue (compte-a-importer-db · n6, borne1, borne2 · corpus du noyau · c, e),
 * 14 après la fenêtre · aucun semis n'avait de fin prévue en diffusion. Banc
 * construit (un lot de 4 variantes Meta, heure par heure sur 14 jours,
 * fenêtre 7 j, minimum par défaut, CPM 10 €, synchro chaque nuit) ·
 *
 * | scénario                                   | allumée en diffusion | allumée après fin / fenêtre |
 * |--------------------------------------------|----------------------|-----------------------------|
 * | 10 €/j/variante, synchro                   | 5,7 j sur 7,0        | 0,0 j sur 7,0               |
 * | 5 €/j/variante, synchro                    | 7,0 j sur 7,0        | 0,0 j sur 7,0               |
 * | 30 €/j/variante, synchro                   | 1,7 j sur 7,0        | 0,0 j sur 7,0               |
 * | 10 €/j, fin prévue J5                      | 5,0 j sur 5,0        | 0,7 j sur 9,0               |
 * | 10 €/j, une variante jamais rattachée      | 7,0 j sur 7,0        | 7,0 j sur 7,0               |
 * | aucune synchro, export importé à J9        | 7,0 j sur 7,0        | 2,0 j sur 7,0               |
 * | aucune synchro, fin prévue J5, import à J9 | 5,0 j sur 5,0        | 4,0 j sur 9,0               |
 *
 * Après · la pastille ne compte que `manquantes` · 0 j allumée en diffusion
 * dans chaque scénario, la colonne « après » inchangée (le vrai signal).
 */
export type CasMesuresLot = 'en-cours' | 'manquantes';

export function casMesuresLot(l: FaitsLotAImporter, ctx: ContexteLots, seuil: SeuilMinimumMoteur): CasMesuresLot | null {
  if (!lotAttendDesMesures(l, ctx, seuil)) return null;
  return etatLotSpatial(l, ctx) === 'a_importer' || finPrevuePassee(l.finPrevue, ctx.maintenant) ? 'manquantes' : 'en-cours';
}

/** Le cas, dit sur la section « Lot #n · ses mesures » de l'écran d'import · `null` quand le lot n'attend rien. */
export function mesuresDuLot(l: FaitsLotAImporter & { numero: number }, ctx: ContexteLots, seuil: SeuilMinimumMoteur): { cas: CasMesuresLot; texte: string } | null {
  const cas = casMesuresLot(l, ctx, seuil);
  if (!cas) return null;
  const jour = (iso: string) => jourCourt(iso.slice(0, 10));
  const n = l.numero;
  if (cas === 'manquantes') {
    return {
      cas,
      texte: finPrevuePassee(l.finPrevue, ctx.maintenant)
        ? `Mesures manquantes · la fin prévue du lot #${n} (le ${jour(l.finPrevue!)}) est passée.`
        : `Mesures manquantes · la fenêtre du moteur du lot #${n} (${ctx.fenetreJours} jours) est écoulée.`,
    };
  }
  if (l.finPrevue) return { cas, texte: `Mesures en cours · le lot #${n} est en diffusion jusqu’au ${jour(l.finPrevue)} · sous le minimum du moteur d’ici là, c’est normal.` };
  const lance = l.lanceLe ? Date.parse(l.lanceLe) : NaN;
  return {
    cas,
    texte: Number.isFinite(lance)
      ? `Mesures en cours · le lot #${n} est en diffusion, sans fin prévue · s’il manque des mesures à la fin de la fenêtre du moteur (le ${jour(new Date(lance + ctx.fenetreJours * 86_400_000).toISOString())}), il passera « Mesures à importer ».`
      : `Mesures en cours · le lot #${n} est en diffusion, sans fin prévue ni date de lancement.`,
  };
}

export const LIBELLE_LISTE_LOT = 'Lot';
export const TOUS_LES_LOTS = 'Tous les lots';
export const AIDE_LISTE_LOT = 'Les lots de la marque qui attendent des mesures · « mesures manquantes » quand la fin prévue est passée ou la fenêtre du moteur écoulée (la pastille du rail les compte), « mesures en cours » pendant la diffusion. « Tous les lots » · l’export se rattache ligne par ligne, comme avant.';

/** Les groupes de la liste « Lot », dans cet ordre · `adresse` · le lot de l'adresse qui n'attend rien (un « Importer » l'y a mené). */
export type GroupeListeLot = CasMesuresLot | 'adresse';
export const ORDRE_GROUPES_LISTE_LOT: readonly GroupeListeLot[] = ['manquantes', 'en-cours', 'adresse'];
export const LIBELLE_GROUPE_LISTE_LOT: Readonly<Record<GroupeListeLot, string>> = {
  manquantes: 'Mesures manquantes · fin prévue passée ou fenêtre écoulée',
  'en-cours': 'Mesures en cours · en diffusion',
  adresse: 'Ouvert par le lien',
};

export interface OptionLotImport {
  id: string;
  libelle: string;
  /** Le groupe de l'option · posé par `listeLotImport` · absent, l'option est rendue sans groupe. */
  groupe?: GroupeListeLot;
}

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
  const retenus = lots
    .map((l) => ({ l, groupe: casMesuresLot(l, ctx, seuil) ?? (l.id === cible ? 'adresse' as const : null) }))
    .filter((x): x is { l: LotListeImport; groupe: GroupeListeLot } => x.groupe !== null);
  if (!retenus.length) return null;
  // Regroupés par cas, dans l'ordre des groupes · dans un groupe, l'ordre lu (tri stable).
  const rang = (g: GroupeListeLot) => ORDRE_GROUPES_LISTE_LOT.indexOf(g);
  return {
    choisi: cible && retenus.some((x) => x.l.id === cible) ? cible : '',
    options: [...retenus].sort((a, b) => rang(a.groupe) - rang(b.groupe)).map(({ l, groupe }) => ({
      id: l.id,
      libelle: [`Lot #${l.numero}`, l.but?.trim() || null, PRESENTATION_ETAT_LOT[etatLotSpatial(l, ctx)].statut].filter(Boolean).join(' · '),
      groupe,
    })),
  };
}

/** Les options consécutives d'un même groupe, réunies · le libellé du groupe (`optgroup`) · une option sans groupe reste seule. */
export function groupesListeLot(options: readonly OptionLotImport[]): Array<{ groupe: GroupeListeLot | null; libelle: string | null; options: OptionLotImport[] }> {
  const out: Array<{ groupe: GroupeListeLot | null; libelle: string | null; options: OptionLotImport[] }> = [];
  for (const o of options) {
    const g = o.groupe ?? null;
    const dernier = out.at(-1);
    if (dernier && g !== null && dernier.groupe === g) dernier.options.push(o);
    else out.push({ groupe: g, libelle: g ? LIBELLE_GROUPE_LISTE_LOT[g] : null, options: [o] });
  }
  return out;
}

/** La sélection devient l'adresse · `''` (« Tous les lots ») → l'écran sans lot · un lot → l'écran ouvert sur lui. */
export function adresseListeLot(valeur: string): string {
  return valeur ? lienImportLot(valeur) : CHEMIN_IMPORT_RESULTATS;
}

/* ───────────── le compte « à importer » · la pastille du rail ───────────── */

/**
 * Le compte « à importer » · le nombre de lots de la liste « Lot » de l'écran
 * d'import dont les mesures MANQUENT (`listeLotImport` sans lot dans
 * l'adresse, groupe « Mesures manquantes »), par la MÊME règle
 * (`casMesuresLot`, aucune copie), dans l'ordre reçu (celui de la liste · le
 * plus récent d'abord). Un lot dont les mesures sont « en cours » (en
 * diffusion, fin prévue pas passée) reste dans la liste, jamais dans le
 * compte · la pastille ne s'allume que quand il manque vraiment quelque
 * chose (mesuré · `casMesuresLot`). DISTINCT du compte « à
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
  const s = lots.filter((l) => casMesuresLot(l, ctx, seuil) === 'manquantes');
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
