import type { TestedVariable, VerdictValue } from '../../adsmap/types';
import { verdictEffectif } from '../../adsmap/types';
import { LIBELLE_STATUT_AD, LIBELLE_VERDICT, TAUX_NON_CALCULABLE, tauxReussite } from '../../adsmap/verdict-libelle';
import { DEPUIS_STUDIO, PARAM_DEPUIS, lireLienProfondAdsmap } from '../../adsmap/passage-studio';
import { countGraph, findGaps, iterationParentSet, summarizeGaps, type Gap, type GraphCounts, type GraphNodeKind } from '../../adsmap/graph';
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';
import { costFor } from '../../credits';

/**
 * Spatial · Résultats · les règles des GESTES de l'ancienne interface portés
 * dans Spatial (vague 2) · tous les tests et leur fiche, la file de décisions,
 * la carte, le partage client, les suites, le tri, le radar. Pur · ni base, ni
 * réseau, ni horloge. Chaque valeur montrée vient d'un fait passé en entrée.
 */

/* ───────────────────────── adresses ───────────────────────── */

/** La fiche Spatial d'un test (une ad de la carte). */
export const lienFicheTest = (adId: string) => `/adsmap/tests/${encodeURIComponent(adId)}`;

/**
 * Le lien profond de l'ancienne Adsmap (`/adsmap?ad=<id>[&depuis=studio]`,
 * produit par les Studios, les suites, le radar) · Spatial l'ouvre sur la fiche
 * du test, le retour aux Studios conservé. `null` sans identifiant valide (la
 * vue d'ensemble s'affiche alors normalement).
 */
export function redirectionTestProfond(sp: Record<string, string | string[] | undefined>): string | null {
  const p = lireLienProfondAdsmap(sp);
  if (!p.adId) return null;
  return `${lienFicheTest(p.adId)}${p.depuisStudio ? `?${PARAM_DEPUIS}=${DEPUIS_STUDIO}` : ''}`;
}

/**
 * Les vues de l'ancienne Adsmap gardées dans l'adresse (`?vue=table`, `?vue=carte`,
 * favoris, ancien lien d'après import) · Spatial ouvre l'écran qui les porte.
 * `null` pour la vue par défaut (« À décider » n'était pas demandée explicitement).
 */
export function redirectionVueAdsmap(sp: Record<string, string | string[] | undefined>): string | null {
  const v = premier(sp.vue);
  return v === 'table' ? '/adsmap/tests' : v === 'carte' ? '/adsmap/carte' : v === 'decider' ? '/adsmap/decisions' : null;
}

/* ───────────────────────── les outils de la rubrique ───────────────────────── */

export interface OutilResultats { href: string; libelle: string; icone: string }

/**
 * Les écrans de Résultats hors de la maquette (gestes de l'ancienne Adsmap),
 * proposés sous la vue d'ensemble. Partage client et radar restent réservés aux
 * administrateurs (actions gardées `admin`) · un membre ne voit pas une porte
 * qui le renverrait.
 */
export function outilsResultats(o: { admin: boolean }): OutilResultats[] {
  return [
    { href: '/adsmap/tests', libelle: 'Tous les tests', icone: 'grid' },
    { href: '/adsmap/decisions', libelle: 'À décider', icone: 'bell' },
    { href: '/adsmap/carte', libelle: 'Carte', icone: 'loop' },
    { href: '/adsmap/suites', libelle: 'Suites', icone: 'bulb' },
    { href: '/adsmap/tri', libelle: 'Tri des propositions', icone: 'check' },
    { href: '/adsmap/essais', libelle: 'Essais et relectures', icone: 'flask' },
    ...(o.admin ? [
      { href: '/adsmap/partage', libelle: 'Partager au client', icone: 'users' },
      { href: '/adsmap/radar', libelle: 'Radar de veille', icone: 'eye' },
    ] : []),
  ];
}

/* ───────────────────────── tous les tests · filtres ───────────────────────── */

export interface FiltresTests { batchId?: string; status?: string; verdict?: string; comparableOnly?: boolean }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const premier = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? '';

/** Les filtres de la table, lus dans l'adresse · une valeur inconnue est ignorée, jamais transmise. */
export function lireFiltresTests(sp: Record<string, string | string[] | undefined>): FiltresTests {
  const f: FiltresTests = {};
  const lot = premier(sp.lot);
  if (UUID.test(lot)) f.batchId = lot.toLowerCase();
  const statut = premier(sp.statut);
  if (statut in LIBELLE_STATUT_AD) f.status = statut;
  const verdict = premier(sp.verdict);
  if (verdict in LIBELLE_VERDICT) f.verdict = verdict;
  if (premier(sp.comparables) === '1') f.comparableOnly = true;
  return f;
}

/** L'adresse de la table pour des filtres donnés (la forme que `lireFiltresTests` relit). */
export function adresseTests(f: FiltresTests): string {
  const q = new URLSearchParams();
  if (f.batchId) q.set('lot', f.batchId);
  if (f.status) q.set('statut', f.status);
  if (f.verdict) q.set('verdict', f.verdict);
  if (f.comparableOnly) q.set('comparables', '1');
  const s = q.toString();
  return s ? `/adsmap/tests?${s}` : '/adsmap/tests';
}

export const filtresTestsActifs = (f: FiltresTests) => !!(f.batchId || f.status || f.verdict || f.comparableOnly);

/* ───────────────────────── tous les tests · repères ───────────────────────── */

export interface FaitsLigneTest {
  status: string;
  verdict: string | null;
  verdictStatus: string | null;
  comparable: boolean | null;
  hypothesis: string | null;
  killFlag: string | null;
}

export interface ReperesTests {
  total: number;
  /** Taux de réussite honnête · « Non calculable » sans test évaluable, jamais 0 %. */
  taux: string;
  detailTaux: string;
  comparables: string;
  aCouper: number;
  aArbitrer: number;
  sansHypothese: number;
}

/** Les repères de tête de la table (mêmes règles que l'ancienne vue Table · CDC v6 R01, N02). */
export function reperesTests(rows: readonly FaitsLigneTest[]): ReperesTests {
  const tr = tauxReussite(rows.map((r) => ({ value: r.verdict as VerdictValue | null, comparable: !!r.comparable })));
  const comparables = rows.filter((r) => r.comparable !== null);
  return {
    total: rows.length,
    taux: tr.taux === null ? TAUX_NON_CALCULABLE : `${Math.round(tr.taux * 100)} %`,
    detailTaux: tr.evaluables ? `${tr.succes}/${tr.evaluables} évaluées${tr.prometteuses ? ` · ${tr.prometteuses} prometteuses` : ''}` : 'aucun test évaluable',
    comparables: comparables.length ? `${Math.round((comparables.filter((r) => r.comparable).length / comparables.length) * 100)} %` : VALEUR_ABSENTE,
    aCouper: rows.filter((r) => r.killFlag).length,
    aArbitrer: rows.filter((r) => r.verdict && r.verdictStatus === 'computed').length,
    sansHypothese: rows.filter((r) => (r.status === 'ready' || r.status === 'live') && !r.hypothesis).length,
  };
}

export type ClassePastilleTest = '' | 'g' | 'w' | 'c' | 'r';

/**
 * La pastille d'un verdict · son libellé EFFECTIF (un gagnant non comparable se
 * lit « Prometteuse · relatif », N02) et la classe `.pill` de la maquette.
 * `null` sans verdict.
 */
export function pastilleVerdict(verdict: string | null | undefined, comparable: boolean | null | undefined): { libelle: string; classe: ClassePastilleTest; relatif: boolean } | null {
  const eff = verdictEffectif(verdict as VerdictValue | null, !!comparable);
  if (!eff) return null;
  const l = LIBELLE_VERDICT[eff];
  return { libelle: l.court, classe: l.ton === 'win' ? 'g' : l.ton === 'lose' ? 'r' : '', relatif: comparable === false };
}

export const libelleStatutTest = (s: string) => (LIBELLE_STATUT_AD as Record<string, string>)[s] ?? s;

/* ───────────────────────── fiche d'un test ───────────────────────── */

/** Les portées d'un apprentissage (même liste que l'action `validateVerdictAction`). */
export const PORTEES_APPRENTISSAGE = [
  ['ad', 'Cette ad'], ['concept', 'Le concept'], ['angle', 'L’angle'], ['desire', 'Le désir'],
  ['avatar', 'L’avatar'], ['format', 'Le format'], ['landing', 'La page'], ['offer', 'L’offre'],
] as const;
export type PorteeApprentissage = (typeof PORTEES_APPRENTISSAGE)[number][0];
export const libellePorteeTest = (s: string) => PORTEES_APPRENTISSAGE.find(([k]) => k === s)?.[1] ?? s;

/** Les variables qu'une itération peut changer · une seule à la fois. */
export const VARIABLES_ITERATION: ReadonlyArray<readonly [TestedVariable, string]> = [
  ['hook', 'Hook'], ['opening_visual', 'Visuel d’ouverture'], ['body', 'Corps'], ['length', 'Durée'], ['cta', 'CTA'],
  ['format', 'Format'], ['offer', 'Offre'], ['landing', 'Landing'], ['avatar_on_screen', 'Personne à l’écran'],
  ['proof', 'Preuve'], ['audio', 'Audio'], ['angle', 'Angle'], ['desire', 'Désir'],
];
export const libelleVariableTest = (v: string | null | undefined) =>
  !v ? null : v === 'none_control' ? 'Contrôle' : VARIABLES_ITERATION.find(([k]) => k === v)?.[1] ?? v;

export const MODES_ITERATION = [
  ['more', 'MORE', 'Refaire la même chose · on scale ce qui marche sans y toucher.'],
  ['better', 'BETTER', 'Changer une variable pour améliorer · le cœur de la boucle.'],
  ['new', 'NEW', 'Nouvelle piste · ce n’est plus une itération, on repart d’ailleurs.'],
] as const;

export const LIBELLE_ETAPE_TEST: Record<string, string> = { hook: 'Accroche', hold: 'Rétention', click: 'Clic', convert: 'Conversion' };

/**
 * L'arbitrage demandé · un verdict retenu différent du calcul exige le motif
 * (« ce que tu as vu et que le chiffre ignore »), comme l'action le vérifie.
 * Rend l'erreur à afficher AVANT l'envoi, ou `null` si l'envoi peut partir.
 */
export function controleArbitrage(a: { calcule: string | null; retenu: string; motif: string; enonce: string }): string | null {
  if (a.enonce.trim().length < 15) return 'L’apprentissage doit dire ce qu’on a compris, pas seulement « ok » : une phrase complète, réutilisable sur la prochaine créa.';
  if (a.calcule && a.retenu !== a.calcule && a.motif.trim().length < 10) return 'Tu t’écartes du verdict calculé · dis ce que tu as vu et que le chiffre ignore.';
  return null;
}

/* ───────────────────────── file de décisions ───────────────────────── */

export const LIBELLE_DECISION: Record<string, string> = {
  kill_suggested: 'À couper', unmapped_ad: 'Non mesurée', validate_verdict: 'À arbitrer', protocol_violation: 'Protocole',
  prelaunch_warning: 'Avant lancement', accept_iteration: 'À itérer', coverage_gap: 'Territoire',
};

/** La pastille d'une décision selon sa priorité · 1 = de l'argent brûle maintenant. */
export function classeDecision(priorite: number): ClassePastilleTest {
  return priorite <= 1 ? 'r' : priorite === 2 ? 'w' : priorite === 3 ? 'c' : '';
}

/** Ce qui se joue, en euros · `null` quand rien n'est engagé (on ne montre pas « 0 € »). */
export function enJeuDecision(spend: number | null | undefined): string | null {
  return typeof spend === 'number' && Number.isFinite(spend) && spend > 0 ? `${Math.round(spend).toLocaleString('fr-FR')} € en jeu` : null;
}

/* ───────────────────────── la carte ───────────────────────── */

export interface NoeudCarteFait {
  id: string; kind: GraphNodeKind; label: string; parentId: string | null; status: string;
  verdict?: string | null; comparable?: boolean | null; mechanism?: string | null; childCount: number;
}
export interface AreteCarteFait { source: string; target: string; kind: 'tree' | 'iteration'; label?: string }

export interface NoeudArbre {
  id: string; kind: GraphNodeKind; label: string; proposee: boolean;
  /** Le manque que la branche signale (branche morte, gagnante jamais itérée) · `null` sinon. */
  manque: string | null;
  /** Ads seulement · la pastille du verdict, et la variable de la filiation d'origine. */
  verdict: ReturnType<typeof pastilleVerdict>;
  iteration: string | null;
  mechanism: string | null;
  enfants: NoeudArbre[];
}

export interface LectureCarte {
  compte: GraphCounts;
  resume: string;
  avatars: Array<{ id: string; label: string }>;
  arbre: NoeudArbre[];
}

/**
 * La carte lue comme un arbre · avatar → désir → angle → concept → ad, une forêt
 * par avatar. Les manques sont ceux du moteur (`findGaps`) · une branche morte
 * ou une gagnante jamais itérée se voit là où elle est. `avatar` restreint la
 * forêt à un arbre (filtre d'affichage, rien n'est recalculé).
 */
export function lireCarte(nodes: readonly NoeudCarteFait[], edges: readonly AreteCarteFait[], avatar: string | null = null): LectureCarte {
  const gaps: Gap[] = findGaps([...nodes], iterationParentSet([...edges]));
  const manque = new Map(gaps.map((g) => [g.nodeId, g.message]));
  const iteration = new Map(edges.filter((e) => e.kind === 'iteration').map((e) => [e.target, e.label ?? null]));
  const enfants = new Map<string, NoeudCarteFait[]>();
  for (const n of nodes) if (n.parentId) enfants.set(n.parentId, [...(enfants.get(n.parentId) ?? []), n]);
  const bati = (n: NoeudCarteFait): NoeudArbre => ({
    id: n.id, kind: n.kind, label: n.label, proposee: n.status === 'proposed', manque: manque.get(n.id) ?? null,
    verdict: n.kind === 'ad' ? pastilleVerdict(n.verdict, n.comparable) : null,
    iteration: n.kind === 'ad' ? iteration.get(n.id) ?? null : null,
    mechanism: n.mechanism ?? null,
    enfants: (enfants.get(n.id) ?? []).map(bati),
  });
  const racines = nodes.filter((n) => n.kind === 'persona');
  const compte = countGraph([...nodes], gaps);
  return {
    compte,
    resume: summarizeGaps(compte),
    avatars: racines.map((r) => ({ id: r.id, label: r.label })),
    arbre: racines.filter((r) => !avatar || r.id === avatar).map(bati),
  };
}

/** Le décompte d'une carte, en une ligne. */
export function decompteCarte(c: GraphCounts): string {
  return `${c.personas} avatar(s) · ${c.desires} désir(s) · ${c.angles} angle(s) · ${c.concepts} concept(s) · ${c.ads} ad(s) · ${c.winners} gagnante(s)${c.promising > 0 ? ` · ${c.promising} piste(s) relative(s)` : ''}`;
}

/* ───────────────────────── suites ───────────────────────── */

/**
 * Le sens du mode, aligné sur la preuve disponible · « Décliner » affirme une
 * victoire, vrai seulement quand le parent est une victoire PROUVÉE (`edgeLegal`).
 * Sur une piste relative, la phrase est neutralisée (la suite part en nouveau
 * concept) · le `modeHint` du moteur est gardé quand il dit vrai.
 */
export function sensDuSuite(mode: 'more' | 'better' | 'new', modeHint: string, edgeLegal: boolean): string {
  if (mode === 'more' && !edgeLegal) {
    return 'On décline cette piste · le parent n’est pas une victoire prouvée, la suite part en nouveau concept.';
  }
  return modeHint;
}

/** L'hypothèse minimale d'une suite (même seuil que l'action `createIterationAction`). */
export const HYPOTHESE_MIN = 10;

/* ───────────────────────── partage client ───────────────────────── */

export const DUREES_PARTAGE: ReadonlyArray<readonly [number, string]> = [[30, '30 jours'], [90, '90 jours'], [180, '6 mois'], [365, '1 an']];

/** L'échéance d'un lien de partage, en clair. */
export function echeancePartage(l: { expired: boolean; expiresAt: string | null }): string {
  if (l.expired) return 'Expiré';
  if (!l.expiresAt) return 'Sans échéance';
  return `Jusqu’au ${new Date(l.expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
}

/* ───────────────────────── coûts annoncés AVANT le clic ───────────────────────── */

/**
 * Un brouillon de concept par Jarvis · un appel modèle (~0,03 $), une
 * réécriture en plus seulement quand une accroche réfutée l'impose (pire cas
 * 0,06 $) · cf. `draftConceptAction`. Sous le plafond de dépense de l'espace.
 */
export const COUT_BROUILLON_JARVIS = '≈ 0,03 $ · 0,06 $ au plus';
/** Une proposition d'agent sur la carte · le barème réel (`map_proposal`), remboursé quand l'agent ne rend rien. */
export const COUT_PROPOSITION_CARTE = `${costFor('map_proposal')} crédits`;
