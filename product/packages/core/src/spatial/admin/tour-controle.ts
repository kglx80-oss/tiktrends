/**
 * Tour de contrôle · lot 14 V5 · la RECHERCHE, la PAGINATION, les SEGMENTS et
 * l'EXPORT des listes que la Tour de contrôle affiche déjà. Pur · ni base, ni
 * réseau, ni modèle. Les pages lisent les lignes (après `porteAdmin`), ces
 * règles décident ce qui s'affiche et ce qui sort dans un fichier.
 *
 *  · recherche · insensible à la casse ET aux accents (« eclat » trouve
 *    « Éclat »), chaque mot doit se trouver, saisie bornée ;
 *  · pagination · des pages de taille fixe, la page demandée ramenée dans les
 *    bornes (une page 99 sur 3 rend la page 3, jamais une liste vide) ;
 *  · segments · CALCULÉS sur les faits lus (abonnement Stripe, essai, défaut de
 *    paiement, signaux de risque, inactivité), jamais saisis · ils reprennent
 *    les règles existantes de `plateforme.ts` et son seuil `JOURS_INACTIVITE`,
 *    aucun seuil nouveau ;
 *  · export · CE QUI EST AFFICHÉ (mêmes colonnes, mêmes textes que les cellules
 *    de la table), chaque cellule par `csvCell` (neutralisation des formules,
 *    #1017), secrets et adresses e-mail masqués avant d'écrire.
 */
import { csvCell } from '../../adsmap/sheet';
import { masquerSecrets } from '../../offre/diagnostic-v2';
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { adminDateCourte, adminEuros, adminNombre, adminPourcent } from './format';
import type { RentabiliteForfait } from './finances';
import {
  CLASSE_RISQUE, JOURS_INACTIVITE, enDefautDePaiement, estEnEssai, estPayant, libelleForfait, libelleRisque, mrrEspace, niveauRisque,
  partCreditsUtilises, prixForfait, signauxRisque,
  type EspacePlateforme, type TarifsPlateforme,
} from './plateforme';

const JOUR = 86_400_000;

/* ─────────────────────────────── Recherche ─────────────────────────────── */

/**
 * La saisie gardée · au-delà, le reste est ignoré (rien n'est refusé). Le nom
 * d'espace le plus long qu'on accepte à l'inscription n'est pas borné en base ·
 * 80 caractères couvrent un nom et son forfait, et gardent l'adresse courte.
 */
export const LONGUEUR_MAX_RECHERCHE = 80;
/** Au-delà de huit mots, les suivants sont ignorés · une recherche, pas un texte. */
export const TERMES_MAX_RECHERCHE = 8;

/** Ligatures que la décomposition Unicode ne sépare pas · « œuvre » se cherche « oeuvre ». */
const LIGATURES: Readonly<Record<string, string>> = { 'œ': 'oe', 'æ': 'ae', 'ß': 'ss' };

/** Un texte plié · minuscules, sans accents ni ligatures, apostrophes et espaces unifiés. Non borné. */
export function plierTexte(v: unknown): string {
  return String(v ?? '')
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[œæß]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[’‘`´]/g, '\'')
    .replace(/\s+/g, ' ')
    .trim();
}

/** La saisie de recherche, pliée et bornée à `LONGUEUR_MAX_RECHERCHE`. */
export function saisieRechercheTour(v: unknown): string {
  return plierTexte(v).slice(0, LONGUEUR_MAX_RECHERCHE).trim();
}

/** Les mots cherchés · distincts, au plus `TERMES_MAX_RECHERCHE`. */
export function termesRecherche(v: unknown): string[] {
  return [...new Set(saisieRechercheTour(v).split(' ').filter(Boolean))].slice(0, TERMES_MAX_RECHERCHE);
}

/** Vrai si CHAQUE mot cherché se trouve dans l'un des champs (pliés) · une recherche vide garde tout. */
export function correspondRecherche(champs: ReadonlyArray<string | null | undefined>, recherche: unknown): boolean {
  const termes = termesRecherche(recherche);
  if (!termes.length) return true;
  const botte = plierTexte(champs.filter((c) => c != null && c !== '').join(' '));
  return termes.every((t) => botte.includes(t));
}

/* ─────────────────────────────── Pagination ─────────────────────────────── */

/**
 * Lignes par page · mesuré le 10/11 au rendu serveur de la table « Comptes »
 * (`ComptesListe`, lignes réalistes · nom accentué, formule, MRR, crédits,
 * santé, profil, date), HTML de la table seule :
 *
 * | lignes | HTML de la table |
 * | ------ | ---------------- |
 * |   1    |   0,8 Ko         |
 * |   50   |  22,6 Ko         |
 * |  200   |  89,5 Ko (l'ancienne limite muette · 200 premiers espaces, le reste jamais montré) |
 *
 * Retenu · 50 · quatre fois moins de HTML que l'ancienne limite, et AUCUN
 * espace hors d'atteinte (la page suivante existe, la recherche porte sur
 * tous). Choisi sur cette mesure, ce n'est pas un seuil statistique.
 */
export const TAILLE_PAGE_TOUR = 50;
/** La plus grande page qu'on lise dans l'adresse · au-delà, la saisie est tenue pour fausse. */
export const PAGE_MAX_TOUR = 10_000;

/** Le numéro de page lu dans l'adresse · entier positif, 1 sinon. */
export function lirePageTour(v: unknown): number {
  const s = String(v ?? '').trim();
  if (!/^\d{1,5}$/.test(s)) return 1;
  const n = Number(s);
  return n >= 1 && n <= PAGE_MAX_TOUR ? n : 1;
}

export interface PageTour<T> {
  lignes: T[];
  /** La page RENDUE · la demande ramenée dans les bornes. */
  page: number;
  pages: number;
  total: number;
  /** Rang (1…) de la première et de la dernière ligne rendues · 0 et 0 sans ligne. */
  debut: number;
  fin: number;
}

export function paginer<T>(lignes: readonly T[], page: number, taille = TAILLE_PAGE_TOUR): PageTour<T> {
  const t = Math.max(1, Math.floor(taille));
  const total = lignes.length;
  const pages = Math.max(1, Math.ceil(total / t));
  const p = Math.min(Math.max(1, Math.floor(Number.isFinite(page) ? page : 1)), pages);
  const debut = total ? (p - 1) * t + 1 : 0;
  return { lignes: lignes.slice((p - 1) * t, p * t), page: p, pages, total, debut, fin: total ? Math.min(p * t, total) : 0 };
}

/** « 51 à 100 sur 132 comptes » · ce que la page montre, en mots. */
export function textePage(p: Pick<PageTour<unknown>, 'debut' | 'fin' | 'total'>, unite: { un: string; plusieurs: string }): string {
  if (!p.total) return `Aucun ${unite.un}`;
  if (p.debut === 1 && p.fin === p.total) return `${p.total.toLocaleString('fr-FR')} ${p.total > 1 ? unite.plusieurs : unite.un}`;
  return `${p.debut.toLocaleString('fr-FR')} à ${p.fin.toLocaleString('fr-FR')} sur ${p.total.toLocaleString('fr-FR')} ${p.total > 1 ? unite.plusieurs : unite.un}`;
}

/* ─────────────────────────────── Segments des comptes ─────────────────────────────── */

/** Les segments calculés · les forfaits payants s'y ajoutent, par leur clé de formule. */
export const SEGMENTS_COMPTES_CALCULES = ['payants', 'essai', 'impayes', 'risque', 'inactifs'] as const;
export type SegmentCompteCalcule = (typeof SEGMENTS_COMPTES_CALCULES)[number];

export const LIBELLE_SEGMENT_COMPTE: Readonly<Record<SegmentCompteCalcule | 'tous', string>> = {
  tous: 'Tous',
  payants: 'Payants',
  essai: 'Essais',
  impayes: 'Impayés',
  risque: 'À risque',
  inactifs: `Sans activité · ${JOURS_INACTIVITE} j`,
};

/** Ce que chaque segment veut dire · écrit sous la liste quand il est choisi. */
export const DEFINITION_SEGMENT_COMPTE: Readonly<Record<SegmentCompteCalcule | 'tous', string>> = {
  tous: 'Tous les espaces inscrits.',
  payants: 'Formule payante et abonnement Stripe actif ou en retard de paiement.',
  essai: 'Essai en cours (date de fin à venir ou abonnement Stripe en essai), sans abonnement payant.',
  impayes: 'Paiement Stripe en retard ou impayé.',
  risque: 'Payant ou en essai, avec au moins un signal de risque (paiement, inactivité, crédits épuisés, onboarding, ticket sans réponse).',
  inactifs: `Aucun mouvement de crédits depuis ${JOURS_INACTIVITE} jours, ou jamais.`,
};

/** Inactif · aucun mouvement de crédits depuis `JOURS_INACTIVITE` jours (la définition de `signauxRisque`). */
export function estInactif(e: EspacePlateforme, maintenant: Date): boolean {
  if (!e.derniereActivite) return true;
  return Math.floor((maintenant.getTime() - e.derniereActivite.getTime()) / JOUR) >= JOURS_INACTIVITE;
}

/**
 * Les clés de segment d'un espace · sa formule (payée ou non, comme la puce de
 * forfait de la maquette), puis les segments calculés auxquels il répond.
 */
export function clesSegmentCompte(e: EspacePlateforme, t: TarifsPlateforme, maintenant: Date): string[] {
  const payant = estPayant(e, t);
  const essai = !payant && estEnEssai(e, maintenant);
  const cles: string[] = [e.forfait];
  if (payant) cles.push('payants');
  if (essai) cles.push('essai');
  if (enDefautDePaiement(e)) cles.push('impayes');
  if ((payant || essai) && signauxRisque(e, maintenant).length > 0) cles.push('risque');
  if (estInactif(e, maintenant)) cles.push('inactifs');
  return cles;
}

export interface SegmentCompte { cle: string; libelle: string; n: number; definition: string }

/**
 * Les segments proposés, dans l'ordre · Tous, les formules payantes (ordre des
 * tarifs), puis les segments calculés · chacun avec son effectif, compté sur
 * TOUS les espaces lus (la recherche n'y entre pas).
 */
export function segmentsComptes(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date): SegmentCompte[] {
  const n = new Map<string, number>();
  for (const e of espaces) for (const c of clesSegmentCompte(e, t, maintenant)) n.set(c, (n.get(c) ?? 0) + 1);
  return [
    { cle: 'tous', libelle: LIBELLE_SEGMENT_COMPTE.tous, n: espaces.length, definition: DEFINITION_SEGMENT_COMPTE.tous },
    ...t.ordre.filter((f) => prixForfait(t, f) > 0).map((f) => ({ cle: f, libelle: libelleForfait(t, f), n: n.get(f) ?? 0, definition: `Espaces sur la formule ${libelleForfait(t, f)}, payée ou non.` })),
    ...SEGMENTS_COMPTES_CALCULES.map((c) => ({ cle: c, libelle: LIBELLE_SEGMENT_COMPTE[c], n: n.get(c) ?? 0, definition: DEFINITION_SEGMENT_COMPTE[c] })),
  ];
}

/** Le segment demandé, s'il est proposé · « tous » sinon (une clé inconnue n'ouvre rien). */
export function lireSegment(v: unknown, segments: ReadonlyArray<{ cle: string }>): string {
  const s = String(v ?? '');
  return segments.some((x) => x.cle === s) ? s : 'tous';
}

/** Le libellé d'une puce de segment · « Payants · 12 ». */
export const libellePuceSegment = (s: { libelle: string; n: number }) => `${s.libelle} · ${s.n.toLocaleString('fr-FR')}`;

/* ─────────────────────────────── Adresse ─────────────────────────────── */

export interface FiltresListeTour { q?: string; segment?: string; page?: number }

/** L'adresse d'une liste filtrée · seules les valeurs utiles y entrent (page 1, « tous » et recherche vide tus). */
export function adresseListeTour(chemin: string, f: FiltresListeTour, extra: Readonly<Record<string, string>> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  const q = saisieRechercheTour(f.q) ? String(f.q ?? '').trim().slice(0, LONGUEUR_MAX_RECHERCHE) : '';
  if (q) p.set('q', q);
  if (f.segment && f.segment !== 'tous') p.set('segment', f.segment);
  if (f.page && f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `${chemin}?${s}` : chemin;
}

/* ─────────────────────────────── Export ─────────────────────────────── */

/** Au-delà, l'export s'arrête et le dit · environ 1 Mo de CSV pour une table de huit colonnes. */
export const LIGNES_MAX_EXPORT_TOUR = 10_000;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Jetons d'API reconnaissables (Anthropic, OpenAI, Bearer, JWT) · en plus des clés Stripe de `masquerSecrets`. */
const JETONS: ReadonlyArray<[RegExp, string]> = [
  [/\bsk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-[masquée]'],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}/g, 'sk-[masquée]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [masqué]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[jeton masqué]'],
];

/**
 * Une cellule qui peut quitter l'application · aucune adresse e-mail brute
 * (« [adresse masquée] »), aucun secret reconnaissable. Le texte saisi par un
 * membre (nom d'espace, note d'incident) peut en contenir · le fichier, lui,
 * circule hors de la porte.
 */
export function celluleSansFuite(v: unknown): string {
  let s = masquerSecrets(String(v ?? ''));
  for (const [motif, par] of JETONS) s = s.replace(motif, par);
  return s.replace(EMAIL, '[adresse masquée]');
}

/**
 * Le CSV d'une table affichée · en-tête puis lignes, séparateur `;` (Excel en
 * français), BOM UTF-8, fins de ligne CRLF · chaque cellule par `csvCell`
 * (neutralisation des formules) après `celluleSansFuite`. Un nombre reste un
 * nombre.
 */
export function tableauCsv(colonnes: readonly string[], lignes: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  const sep = ';';
  const cellule = (v: string | number | null | undefined) => csvCell(typeof v === 'number' ? v : celluleSansFuite(v), { separateur: sep });
  const out = [colonnes.map(cellule).join(sep), ...lignes.slice(0, LIGNES_MAX_EXPORT_TOUR).map((l) => colonnes.map((_, i) => cellule(l[i])).join(sep))];
  return '﻿' + out.join('\r\n') + '\r\n';
}

/** « tour-de-controle_comptes_2026-11-10.csv » · aucun nom de client dans le nom du fichier. */
export function nomFichierExportTour(ecran: string, maintenant: Date): string {
  const jour = `${maintenant.getFullYear()}-${String(maintenant.getMonth() + 1).padStart(2, '0')}-${String(maintenant.getDate()).padStart(2, '0')}`;
  return `tour-de-controle_${ecran.toLowerCase().replace(/[^a-z0-9]+/g, '-')}_${jour}.csv`;
}

/** Ce que dit le bouton d'export · fermé sans ligne, avec sa raison. */
export function etatExportTour(n: number, unite: { un: string; plusieurs: string }): { ferme: boolean; raison: string | null; titre: string } {
  if (n <= 0) return { ferme: true, raison: `Rien à exporter · aucun ${unite.un} dans ce filtre.`, titre: 'Rien à exporter' };
  const borne = n > LIGNES_MAX_EXPORT_TOUR;
  const k = Math.min(n, LIGNES_MAX_EXPORT_TOUR).toLocaleString('fr-FR');
  return { ferme: false, raison: null, titre: `Exporter les ${k} ${n > 1 ? unite.plusieurs : unite.un} de ce filtre${borne ? ` (les ${k} premiers sur ${n.toLocaleString('fr-FR')})` : ''}, colonnes de la table` };
}

/* ─────────────────────────────── Les tables exportées ─────────────────────────────── */

/** Une ligne de la table « Comptes » · ce que la page rend, cellule par cellule. */
export interface LigneCompteTour {
  id: string;
  nom: string;
  /** Les clés de segment auxquelles la ligne répond (`clesSegmentCompte`). */
  cles: readonly string[];
  forfait: { libelle: string; classe: '' | 'c' };
  mrr: string;
  credits: { part: number; texte: string; over: boolean };
  sante: { libelle: string; classe: 'g' | 'w' | 'r' };
  profil: string;
  inscrit: string;
}

export function ligneCompteTour(e: EspacePlateforme, t: TarifsPlateforme, maintenant: Date): LigneCompteTour {
  const payant = estPayant(e, t), essai = !payant && estEnEssai(e, maintenant);
  const part = partCreditsUtilises(e, t);
  return {
    id: e.id, nom: e.nom,
    cles: clesSegmentCompte(e, t, maintenant),
    forfait: essai ? { libelle: 'Essai', classe: 'c' } : { libelle: libelleForfait(t, e.forfait), classe: '' },
    mrr: payant ? adminEuros(mrrEspace(e, t)) : VALEUR_ABSENTE,
    credits: { part: part ?? 0, texte: part == null ? VALEUR_ABSENTE : `${part} %`, over: (part ?? 0) > 100 },
    sante: { libelle: libelleRisque(signauxRisque(e, maintenant).length), classe: (CLASSE_RISQUE[niveauRisque(e, maintenant)] || 'g') as 'g' | 'w' | 'r' },
    profil: e.profil ?? VALEUR_ABSENTE,
    inscrit: adminDateCourte(e.creeLe),
  };
}

/** Les colonnes de la table « Comptes » · les MÊMES dans l'export (la dernière colonne de la table, sans titre, ne porte aucun texte). */
export const COLONNES_COMPTES_TOUR = ['Compte', 'Forfait', 'MRR', 'Crédits utilisés', 'Santé', 'Profil', 'Inscrit le'] as const;
export const cellulesCompteTour = (l: LigneCompteTour): string[] => [l.nom, l.forfait.libelle, l.mrr, l.credits.texte, l.sante.libelle, l.profil, l.inscrit];

export interface TableComptesTour {
  segments: SegmentCompte[];
  segment: string;
  /** La recherche telle qu'elle est gardée (bornée) · la saisie d'origine, sans pliage. */
  q: string;
  /** TOUTES les lignes du filtre (segment puis recherche) · ce que l'export reprend. */
  filtrees: LigneCompteTour[];
  page: PageTour<LigneCompteTour>;
}

/**
 * La table « Comptes » d'un filtre · segment, puis recherche (nom, formule,
 * profil), puis la page. La page et l'export appellent CETTE fonction · le
 * fichier est la table affichée, toutes pages.
 */
export function tableComptesTour(espaces: readonly EspacePlateforme[], t: TarifsPlateforme, maintenant: Date, f: FiltresListeTour): TableComptesTour {
  const segments = segmentsComptes(espaces, t, maintenant);
  const segment = lireSegment(f.segment, segments);
  const q = String(f.q ?? '').trim().slice(0, LONGUEUR_MAX_RECHERCHE);
  const filtrees = espaces
    .map((e) => ligneCompteTour(e, t, maintenant))
    .filter((l) => (segment === 'tous' || l.cles.includes(segment)) && correspondRecherche([l.nom, l.forfait.libelle, l.profil], q));
  return { segments, segment, q, filtrees, page: paginer(filtrees, f.page ?? 1) };
}

/** Une ligne de « Rentabilité par abonnement » · les textes de la table. */
export interface LigneRentabiliteTour { libelle: string; prix: string; abonnes: string; mrr: string; coutIa: string; frais: string; marge: number; margeTexte: string; churn: string; ltv: string }

export function ligneRentabiliteTour(r: RentabiliteForfait): LigneRentabiliteTour {
  return {
    libelle: r.libelle, prix: adminEuros(r.prix), abonnes: adminNombre(r.abonnes), mrr: adminEuros(r.mrr),
    coutIa: adminEuros(r.coutIaPireCas, 2), frais: adminEuros(r.fraisPaiement, 2), marge: r.margePct, margeTexte: adminPourcent(r.margePct),
    churn: VALEUR_ABSENTE, ltv: VALEUR_ABSENTE,
  };
}

/** La première cellule de la table réunit le forfait et son prix · l'export les sépare en deux colonnes. */
export const COLONNES_RENTABILITE_TOUR = ['Forfait', 'Prix', 'Abonnés', 'MRR', 'Coût IA / abonné', 'Frais paiement', 'Marge', 'Churn', 'LTV'] as const;
export const cellulesRentabiliteTour = (l: LigneRentabiliteTour): string[] => [l.libelle, l.prix, l.abonnes, l.mrr, l.coutIa, l.frais, l.margeTexte, l.churn, l.ltv];
