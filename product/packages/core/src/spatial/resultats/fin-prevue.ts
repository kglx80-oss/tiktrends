import { CHEMIN_IMPORT_RESULTATS } from '../../parcours-boucle';
import type { VerdictValue } from '../../adsmap/types';
import { sousLeMinimumDuMoteur, type SeuilMinimumMoteur } from '../../adsmap/verdict';

/**
 * Spatial · Résultats · un lot en diffusion dont la FIN PRÉVUE est passée,
 * mais qu'on ne peut pas conclure (aucun verdict n'attend · `lotsFinPrevuePassee`,
 * l'Accueil, sous « En diffusion »). Pur · ni base, ni réseau, ni horloge.
 *
 * Constat (#1080) · le libellé « Lot #3 · fin prévue passée, aucun verdict à
 * arbitrer » n'avait pas de geste. La cause habituelle · les mesures du lot ne
 * sont pas encore remontées. Ce module dit POURQUOI aucun verdict, sur les faits
 * du lot, et donne le geste qui y répond · l'import EXISTANT des mesures
 * (`/adsmap/import`), ouvert sur ce lot (`?lot=`).
 *
 * Ce qu'on lit · chaque variante du lot, son statut, sa plateforme, et son
 * verdict en base. Le moteur ne calcule un verdict que pour une variante qui a
 * des mesures (`verdictsDesMesures` · `mesurees = entrees.length > 0`) · un
 * verdict CALCULÉ dit donc « des mesures sont arrivées », et son agrégat dit ce
 * que le moteur a vu sur sa fenêtre (dépense, impressions). Un verdict importé
 * du tableau (jamais calculé, `calcule = null`) ne porte aucune mesure.
 *
 * Les cas, dans cet ordre (la première vérité l'emporte) ·
 *  · `sans-mesure`   · aucune variante n'a de verdict calculé ;
 *  · `sous-minimum`  · chaque variante mesurée reste sous le minimum du moteur
 *                      (`sousLeMinimumDuMoteur`, la règle 2 du verdict · le
 *                      seuil de la MARQUE, aucun seuil reposé ici) ;
 *  · `partielles`    · des variantes mesurées, d'autres non ;
 *  · `autre`         · chaque variante a ses mesures, au moins une au-dessus
 *                      du minimum · la cause n'est pas une mesure manquante
 *                      (verdicts déjà arbitrés, fenêtre du moteur pas écoulée…)
 *                      · aucun geste d'import n'est proposé.
 * Le SILENCE (`null`) · un lot sans variante, ou une variante mesurée dont
 * l'agrégat ne dit ni dépense ni impressions quand il faudrait les lire · on
 * ne tranche pas à la place des données.
 */

/** Une variante du lot, vue par le diagnostic. */
export interface VarianteFinPrevue {
  /** `adsmap_ads.status` · un brouillon n'a rien diffusé, aucune mesure ne s'y rattache (`adsDeLaMarque`). */
  statut: string;
  /** `adsmap_ads.platform` · seul Meta a une source de mesures (connexion, export Ads Manager). */
  plateforme: string;
  /** Le verdict en base · `null` sans verdict. */
  verdict: { calcule: VerdictValue | null; impressions: number | null; depense: number | null } | null;
}

export type CasFinPrevue = 'sans-mesure' | 'sous-minimum' | 'partielles' | 'autre';

export interface DiagnosticFinPrevue {
  cas: CasFinPrevue;
  variantes: number;
  /** Les variantes qui ont un verdict CALCULÉ (le moteur a lu leurs mesures). */
  mesurees: number;
}

const nombre = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * La FIN PRÉVUE d'un lot est-elle passée · une date lisible, au plus tard
 * `maintenant` (l'horloge est passée par l'appelant). Sans fin prévue, ou
 * illisible · jamais · on ne devine pas la durée d'un protocole. UNE règle ·
 * l'Accueil (`lotsFinPrevuePassee`, « fin prévue passée, aucun verdict à
 * arbitrer ») et le compte « à importer » (`casMesuresLot`) la lisent.
 */
export function finPrevuePassee(finPrevue: string | null | undefined, maintenant: Date): boolean {
  const t = finPrevue ? Date.parse(finPrevue) : NaN;
  return Number.isFinite(t) && t <= maintenant.getTime();
}

/** Pourquoi aucun verdict n'attend · `null` quand les données ne permettent pas de trancher. */
export function diagnosticFinPrevue(variantes: readonly VarianteFinPrevue[], seuil: SeuilMinimumMoteur): DiagnosticFinPrevue | null {
  const n = variantes.length;
  if (n === 0) return null;
  const mesurees = variantes.filter((v) => !!v.verdict?.calcule);
  const m = mesurees.length;
  if (m === 0) return { cas: 'sans-mesure', variantes: n, mesurees: 0 };
  const lisibles = mesurees.filter((v) => nombre(v.verdict!.impressions) && nombre(v.verdict!.depense));
  if (lisibles.length === m && lisibles.every((v) => sousLeMinimumDuMoteur({ spend: v.verdict!.depense!, impressions: v.verdict!.impressions! }, seuil))) {
    return { cas: 'sous-minimum', variantes: n, mesurees: m };
  }
  if (m < n) return { cas: 'partielles', variantes: n, mesurees: m };
  // Toutes mesurées · « au-dessus du minimum » ne se dit que si chaque agrégat est lisible.
  if (lisibles.length < m) return null;
  return { cas: 'autre', variantes: n, mesurees: m };
}

const fr = (x: number) => x.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const pl = (k: number, un: string, plusieurs: string) => `${k} ${k > 1 ? plusieurs : un}`;

/** Le minimum du moteur, dans ses mots · « 5 000 impressions ou 105 € dépensés par variante ». */
export function phraseMinimumMoteur(seuil: SeuilMinimumMoteur): string {
  return `${fr(seuil.minImpressions)} impressions ou ${fr(seuil.minSpendMultiple * seuil.targetCpa)} € dépensés par variante`;
}

/** La phrase du cas mesuré · `null` au silence. */
export function phraseDiagnosticFinPrevue(numero: number, d: DiagnosticFinPrevue | null, seuil: SeuilMinimumMoteur): string | null {
  if (!d) return null;
  const sans = d.variantes - d.mesurees;
  const partiel = `${pl(sans, 'variante', 'variantes')} sur ${d.variantes} sans mesure`;
  switch (d.cas) {
    case 'sans-mesure': return `Lot #${numero} · aucune mesure reçue depuis le lancement`;
    case 'sous-minimum': return `Lot #${numero} · mesures reçues, sous le minimum du moteur (${phraseMinimumMoteur(seuil)})${sans > 0 ? ` · ${partiel}` : ''}`;
    case 'partielles': return `Lot #${numero} · ${partiel}`;
    case 'autre': return `Lot #${numero} · chaque variante a ses mesures, au moins une au-dessus du minimum du moteur`;
  }
}

/* ───────────────────────── les sources d'import ───────────────────────── */

const PLATEFORME: Readonly<Record<string, string>> = { meta: 'Meta', tiktok: 'TikTok', google: 'Google', snapchat: 'Snapchat', pinterest: 'Pinterest' };

/**
 * Peut-on importer des mesures pour ce lot · une source existe pour au moins
 * une de ses variantes · diffusée (pas un brouillon) ET sur Meta (la connexion
 * Meta et l'export Ads Manager sont les seules sources · TikTok et Google n'ont
 * ni connecteur ni export, « Bientôt » sur l'écran d'import).
 */
export type SourcesImportLot = { ok: true; importables: number } | { ok: false; raison: string };

export function sourcesImportLot(variantes: readonly VarianteFinPrevue[]): SourcesImportLot {
  const diffusees = variantes.filter((v) => v.statut !== 'draft');
  if (!diffusees.length) return { ok: false, raison: 'aucune source d’import · ses variantes sont en brouillon, rien n’a été diffusé' };
  const meta = diffusees.filter((v) => v.plateforme === 'meta');
  if (!meta.length) {
    const ps = [...new Set(diffusees.map((v) => PLATEFORME[v.plateforme] ?? v.plateforme))].join(' et ');
    return { ok: false, raison: `aucune source d’import · ${ps} n’a encore ni connexion ni export, seul Meta remonte des mesures` };
  }
  return { ok: true, importables: meta.length };
}

/* ───────────────────────── le geste ───────────────────────── */

/** Le paramètre d'adresse qui ouvre l'import sur un lot (`/adsmap/import?lot=…`). */
export const PARAM_LOT_IMPORT = 'lot';

export const lienImportLot = (id: string) => `${CHEMIN_IMPORT_RESULTATS}?${PARAM_LOT_IMPORT}=${encodeURIComponent(id)}`;

/** Pourquoi l'import est fermé à cette personne · écrite à côté du contrôle fermé. */
export const RAISON_IMPORT_FERME: Readonly<Record<'role' | 'plan', string>> = {
  role: 'Importer des mesures est réservé aux admins de l’espace · demande-le à un admin.',
  plan: 'Importer des mesures est disponible à partir de l’offre Plus.',
};

export type GesteFinPrevue =
  | { etat: 'ouvert'; libelle: string; href: string }
  | { etat: 'ferme'; libelle: string; raison: string }
  | { etat: 'sans-source'; raison: string };

/**
 * Le geste du libellé · l'import, seulement quand la cause est une mesure
 * (sans mesure, partielles, sous le minimum) · `null` pour `autre` et au
 * silence (l'import n'y répond pas). Aucune source · dit, jamais un écran vide.
 * Un import fermé (rôle, formule) · le contrôle fermé et sa raison.
 */
export function gesteFinPrevue(
  lot: { id: string; numero: number },
  d: DiagnosticFinPrevue | null,
  sources: SourcesImportLot,
  acces: { refus: 'role' | 'plan' | null },
): GesteFinPrevue | null {
  if (!d || d.cas === 'autre') return null;
  return gesteImportLot(lot, sources, acces);
}

/**
 * « Importer les mesures du lot #n » · UNE règle pour chaque bouton qui importe
 * les mesures d'un lot (l'Accueil, la fiche d'un lot « Mesures à importer ») ·
 * aucune source · dit ; import fermé (rôle, formule) · le contrôle fermé et sa
 * raison ; sinon · l'import ouvert sur CE lot (`lienImportLot`).
 */
export function gesteImportLot(
  lot: { id: string; numero: number },
  sources: SourcesImportLot,
  acces: { refus: 'role' | 'plan' | null },
): GesteFinPrevue {
  if (!sources.ok) return { etat: 'sans-source', raison: sources.raison };
  const libelle = `Importer les mesures du lot #${lot.numero}`;
  if (acces.refus) return { etat: 'ferme', libelle, raison: RAISON_IMPORT_FERME[acces.refus] };
  return { etat: 'ouvert', libelle, href: lienImportLot(lot.id) };
}

/** Ce que l'Accueil pose sous « En diffusion » pour le PREMIER lot à fin prévue passée (le plus ancien). */
export interface FinPrevueAccueil {
  lotId: string;
  /** Le cas mesuré, et l'absence de source quand il n'y en a pas · `null` au silence. */
  texte: string | null;
  geste: GesteFinPrevue | null;
}

export function finPrevueAccueil(p: {
  lot: { id: string; numero: number };
  variantes: readonly VarianteFinPrevue[];
  seuil: SeuilMinimumMoteur;
  acces: { refus: 'role' | 'plan' | null };
}): FinPrevueAccueil {
  const d = diagnosticFinPrevue(p.variantes, p.seuil);
  const geste = gesteFinPrevue(p.lot, d, sourcesImportLot(p.variantes), p.acces);
  const phrase = phraseDiagnosticFinPrevue(p.lot.numero, d, p.seuil);
  const texte = phrase && geste?.etat === 'sans-source' ? `${phrase} · ${geste.raison}` : phrase;
  return { lotId: p.lot.id, texte, geste };
}

/* ───────────────────────── l'écran d'import, ouvert sur un lot ───────────────────────── */

/**
 * Le lot demandé par l'adresse (`?lot=`) · seulement s'il fait partie des lots
 * LUS pour la marque active de l'espace (la portée de l'écran) · sinon ignoré
 * (autre marque, autre espace, identifiant inconnu ou malformé).
 */
export function lotCibleImport<L extends { id: string }>(lots: readonly L[], demande: unknown): L | null {
  const v = Array.isArray(demande) ? demande[0] : demande;
  if (typeof v !== 'string' || !v) return null;
  return lots.find((l) => l.id === v) ?? null;
}

export type EtatVarianteImport = 'brouillon' | 'hors-meta' | 'sans-mesure' | 'sous-minimum' | 'mesuree';

export const LIBELLE_VARIANTE_IMPORT: Readonly<Record<EtatVarianteImport, string>> = {
  brouillon: 'Brouillon · rien diffusé',
  'hors-meta': 'Hors Meta · aucune source',
  'sans-mesure': 'Sans mesure',
  'sous-minimum': 'Sous le minimum du moteur',
  mesuree: 'Mesurée',
};

/** Une variante du lot ciblé, telle que l'écran d'import la montre. */
export interface LigneVarianteImport { code: string; nomRegie: string | null; etat: EtatVarianteImport; libelle: string }

export interface LotImport {
  id: string;
  numero: number;
  titre: string;
  /** Le cas mesuré · `null` au silence. */
  diagnostic: string | null;
  /** Aucune source · la phrase · `null` sinon. */
  sansSource: string | null;
  variantes: LigneVarianteImport[];
  /** À quel moment de sa vie le lot attend ses mesures (`mesuresDuLot`) · absent ou `null`, le lot n'attend rien. */
  mesures?: { cas: 'en-cours' | 'manquantes'; texte: string } | null;
}

/** L'état d'une variante · le même que le diagnostic lit (statut, plateforme, verdict calculé, minimum du moteur). */
export function etatVarianteImport(v: VarianteFinPrevue, seuil: SeuilMinimumMoteur): EtatVarianteImport {
  if (v.statut === 'draft') return 'brouillon';
  if (v.plateforme !== 'meta') return 'hors-meta';
  if (!v.verdict?.calcule) return 'sans-mesure';
  const { impressions, depense } = v.verdict;
  if (nombre(impressions) && nombre(depense) && sousLeMinimumDuMoteur({ spend: depense, impressions }, seuil)) return 'sous-minimum';
  return 'mesuree';
}

export function lotImport(
  l: { id: string; numero: number; but: string | null },
  variantes: ReadonlyArray<VarianteFinPrevue & { code: string; nomRegie: string | null }>,
  seuil: SeuilMinimumMoteur,
): LotImport {
  const sources = sourcesImportLot(variantes);
  return {
    id: l.id,
    numero: l.numero,
    titre: l.but?.trim() ? `Lot #${l.numero} · ${l.but.trim()}` : `Lot #${l.numero}`,
    diagnostic: phraseDiagnosticFinPrevue(l.numero, diagnosticFinPrevue(variantes, seuil), seuil),
    sansSource: sources.ok ? null : `Lot #${l.numero} · ${sources.raison}`,
    variantes: variantes.map((v) => {
      const etat = etatVarianteImport(v, seuil);
      return { code: v.code, nomRegie: v.nomRegie, etat, libelle: LIBELLE_VARIANTE_IMPORT[etat] };
    }),
  };
}

/** Après l'aperçu d'un export · combien de ses annonces vont aux variantes du lot ciblé. */
export function phraseAnnoncesDuLot(numero: number, annonces: ReadonlyArray<{ cible: { lot: number | null } | null }>): string {
  const k = annonces.filter((a) => a.cible?.lot === numero).length;
  if (k === 0) return `Aucune annonce de ce fichier ne va au lot #${numero} · vérifie le nom régie ou l’identifiant Meta de ses variantes.`;
  return `${pl(k, 'annonce', 'annonces')} de ce fichier ${k > 1 ? 'vont' : 'va'} aux variantes du lot #${numero}.`;
}
