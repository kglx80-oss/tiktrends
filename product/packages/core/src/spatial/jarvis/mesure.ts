import type { TestedVariable } from '../../adsmap/types';
import { wilsonInterval } from '../../adsmap/stats';
import { LIBELLE_CHOIX_VARIABLE } from '../studios/iterer-variable';
import { nettoyerContexteJarvis } from './contexte';
import { MESURE_EXTRACTION_JARVIS, analyseReponseJarvis, phrasesJarvis } from './gestes';

/**
 * Jarvis mesuré sur ses VRAIES réponses (lot 5 quater V5) · RÈGLES PURES.
 *
 * Le banc (`MESURE_EXTRACTION_JARVIS`) est écrit par celui qui a réglé la
 * règle · il a ce biais. L'écran d'administration rejoue la MÊME règle
 * (`analyseReponseJarvis`, celle de « Créer l'itération ») sur les réponses
 * déjà stockées de l'espace, sans appeler aucun modèle, et dit pourquoi elle
 * se tait · le propriétaire lit le vrai taux, nous le rapporte.
 *
 * Les causes, dans l'ordre où la règle les rencontre :
 *  · `aucun_conseil` · aucune phrase de conseil (une analyse, un résumé) ;
 *  · `negation` · un conseil, des variables citées, TOUTES niées (« garde… ») ;
 *  · `hors_liste` · un conseil, aucune variable de la liste fermée citée ;
 *  · `plusieurs` · plusieurs variables conseillées (une itération n'en change qu'une) ;
 *  · `pub_ambigue` · une variable sûre, mais plusieurs pubs nommées (« V1 », « V2 »).
 * Une réponse stockée ne garde pas son contexte (le lot joint) · « pub
 * ambiguë » ne compte que les réponses qui nomment elles-mêmes plusieurs codes
 * de variante · c'est une borne BASSE (la liste fermée d'un lot en trouverait plus).
 */

export const CAUSES_SILENCE_JARVIS = ['aucun_conseil', 'negation', 'hors_liste', 'plusieurs', 'pub_ambigue'] as const;
export type CauseSilenceJarvis = typeof CAUSES_SILENCE_JARVIS[number];
export type ClasseReponseJarvis = 'sure' | CauseSilenceJarvis;

export const LIBELLE_CAUSE_JARVIS: Readonly<Record<ClasseReponseJarvis, string>> = {
  sure: 'Une variable sûre',
  aucun_conseil: 'Aucun conseil',
  negation: 'Variables toutes niées',
  hors_liste: 'Conseil hors de la liste des variables',
  plusieurs: 'Plusieurs variables',
  pub_ambigue: 'Pub ambiguë',
};

export interface ClassementReponse { classe: ClasseReponseJarvis; variables: TestedVariable[]; codes: string[] }

/** La classe d'UNE réponse · la règle de l'extraction, rejouée telle quelle. */
export function classerReponseJarvis(texte: string): ClassementReponse {
  const a = analyseReponseJarvis(texte);
  const variables = a.positives;
  if (!a.conseil) return { classe: 'aucun_conseil', variables, codes: a.codes };
  if (variables.length > 1) return { classe: 'plusieurs', variables, codes: a.codes };
  if (variables.length === 0) return { classe: a.niees.length ? 'negation' : 'hors_liste', variables: a.niees, codes: a.codes };
  if (a.codes.length > 1) return { classe: 'pub_ambigue', variables, codes: a.codes };
  return { classe: 'sure', variables, codes: a.codes };
}

/* ───────────────────────── les bornes ───────────────────────── */

/**
 * Au plus N réponses, les plus récentes de l'espace. N = 500 · mesuré
 * (`MESURE_TEMPS_MESURE_JARVIS`) et dérivé de l'intervalle · à 500 réponses et
 * un taux autour de 36 % (le banc), l'intervalle de Wilson à 95 % fait ±4,3
 * points · assez pour dire si le vrai taux s'écarte du banc, et la règle passe
 * sur 500 textes en un dixième de seconde. Au-delà, l'intervalle ne gagne qu'un point
 * par millier, la page grossit d'autant.
 */
export const BORNE_MESURE_JARVIS = 500;
/** Les exemples, dix par page · une page se lit d'un coup d'œil, la cause visible sur chacun. */
export const EXEMPLES_PAR_PAGE_JARVIS = 10;
/** Un extrait · la phrase où la règle se décide, tronquée · jamais la réponse entière. */
export const BORNE_EXTRAIT_JARVIS = 220;
/**
 * L'effectif sous lequel l'écran ne compare pas au banc · à 30 réponses
 * l'intervalle fait ±17 points, il contient presque tout · le chiffre s'affiche,
 * la comparaison se tait (`comparaisonBanc`).
 */
export const EFFECTIF_MIN_MESURE_JARVIS = 30;
const NIVEAU = 0.975; // Wilson UNILATÉRAL à 97,5 % de chaque côté · bilatéral à 95 %.

/**
 * Le temps, MESURÉ par `test/lot5q-jarvis-mesure.test.ts` (règle seule, sans
 * base) et `W/test/lot5q-jarvis-mesure-db.test.tsx` (lecture pglite + règle +
 * rendu) · les réponses-types des trois corpus portées à ≈ 1 000 signes
 * (lecture du lot, conseil, vigilance), machine de développement partagée,
 * cinq passages à froid.
 *
 * | Semis                            | n   | règle seule | page entière (pglite) |
 * | -------------------------------- | --- | ----------- | --------------------- |
 * | réponses-types (≈ 1 000 signes)  | 500 | 95 à 130 ms | 78 à 119 ms           |
 *
 * « Règle seule » se mesure à froid (premier passage, sans compilation à la
 * volée) · la page passe après d'autres rendus, déjà chaude, d'où un chiffre
 * voisin malgré la lecture en base. Les gardes posent un plafond large
 * (règle 1 s, page 4 s · machine chargée), jamais le chiffre lui-même.
 */
export const MESURE_TEMPS_MESURE_JARVIS = { n: 500, regleMs: [95, 130], pageMs: [78, 119] } as const;

/* ───────────────────────── l'anonymisation des exemples ───────────────────────── */

const ADRESSES = [
  /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, // courriel
  /(?:\b(?:https?|ftp|s3|data|blob):|\bwww\.)\S+/gi, // adresse web
  /\b[\w-]+(?:\.[\w-]+)*\.(?:com|fr|io|co|net|org|shop|store|be|ch|eu|app)\b(?:\/\S*)?/gi, // domaine nu
  /(?<![\w@])@[\w.]{2,}/g, // compte social
  /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/g, // téléphone
];
const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Un extrait ANONYMISÉ · la phrase où la règle se décide (le premier conseil,
 * sinon le début), sans adresse (courriel, lien, domaine, compte, téléphone),
 * sans aucun nom de marque connu de la plateforme (`noms` · ceux de l'espace
 * ET des autres, lus au serveur pour être masqués, jamais affichés), sans le
 * nom du fournisseur de données, tronqué à `BORNE_EXTRAIT_JARVIS`.
 */
export function extraitAnonymise(texte: string, noms: readonly string[]): string {
  // Masquer AVANT de couper en phrases · un courriel ou un domaine porte des points (« k@x.fr » serait coupé en deux).
  let t = texte;
  for (const re of ADRESSES) t = t.replace(re, '[adresse]');
  const tri = [...new Set(noms.map((n) => n.trim()).filter((n) => n.length >= 2))].sort((a, b) => b.length - a.length);
  for (const n of tri) t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${echapper(n)}(?![\\p{L}\\p{N}])`, 'giu'), '[marque]');
  t = t.replace(/trend\s*track/gi, '[source]');
  const p = phrasesJarvis(t);
  const i = Math.max(0, p.findIndex((x) => x.conseil));
  return nettoyerContexteJarvis(p.slice(i, i + 2).map((x) => x.brute).join(' ') || t, BORNE_EXTRAIT_JARVIS);
}

/* ───────────────────────── la vue ───────────────────────── */

export interface ReponseStockee {
  /** Lue dans l'espace de la session, rôle « assistant » · son texte lisible. */
  texte: string;
  le: string;
  /** Une réponse de la personne qui lit · seules celles-là fournissent des exemples. */
  mienne: boolean;
}

export interface LigneCauseJarvis { cle: ClasseReponseJarvis; libelle: string; n: number; part: number; href: string }
export interface ExempleJarvis { rang: number; le: string; classe: ClasseReponseJarvis; libelle: string; variables: string; extrait: string }
export interface VueMesureJarvis {
  n: number;
  borne: number;
  /** n a atteint la borne · les plus anciennes ne sont pas lues. */
  tronque: boolean;
  rienDeSur: number;
  /** Le taux « rien de sûr », en pourcentage arrondi, et son intervalle à 95 % · `null` à n = 0. */
  taux: { pct: number; bas: number; haut: number } | null;
  banc: { pct: number; n: number; rienDeSur: number };
  comparaison: string;
  causes: LigneCauseJarvis[];
  filtre: ClasseReponseJarvis | null;
  exemples: ExempleJarvis[];
  page: number;
  pages: number;
  /** Les exemples viennent des réponses de la personne qui lit · les autres membres ne sont que comptés. */
  exemplesPossibles: number;
  precedente: string | null;
  suivante: string | null;
}

const pct = (x: number) => Math.round(x * 1000) / 10;
export const CHEMIN_MESURE_JARVIS = '/admin/jarvis-mesure';
const lien = (classe: ClasseReponseJarvis | null, page: number) => {
  const q = new URLSearchParams();
  if (classe) q.set('cause', classe);
  if (page > 1) q.set('page', String(page));
  const s = q.toString();
  return s ? `${CHEMIN_MESURE_JARVIS}?${s}` : CHEMIN_MESURE_JARVIS;
};

/** `?cause=` et `?page=` · une valeur inconnue est ignorée (aucun filtre, page 1). */
export function lireFiltreMesureJarvis(sp: Readonly<Record<string, string | readonly string[] | undefined>>): { classe: ClasseReponseJarvis | null; page: number } {
  const v = (k: string) => { const x = sp[k]; return (Array.isArray(x) ? x[0] : x) as string | undefined; };
  const c = v('cause');
  const classe = c && (c === 'sure' || (CAUSES_SILENCE_JARVIS as readonly string[]).includes(c)) ? c as ClasseReponseJarvis : null;
  const p = Number(v('page'));
  return { classe, page: Number.isInteger(p) && p >= 1 && p <= 1000 ? p : 1 };
}

/**
 * Comparer au BANC, jamais à zéro · le banc dit 24 / 64 (38 %) de « rien de
 * sûr » sur le corpus de réglage. Sous l'effectif minimal, on se tait ;
 * au-dessus, on ne dit « s'écarte » que si l'intervalle EXCLUT le taux du banc.
 */
export function comparaisonBanc(n: number, rienDeSur: number): string {
  const b = MESURE_EXTRACTION_JARVIS.reglage.total!;
  const ref = b.rienDeSur / b.n;
  if (n < EFFECTIF_MIN_MESURE_JARVIS) return `Trop peu de réponses pour comparer au banc (${n} sur ${EFFECTIF_MIN_MESURE_JARVIS} au moins) · le chiffre se lit, il ne conclut rien.`;
  const lo = wilsonInterval(rienDeSur, n, NIVEAU).lo;
  const hi = wilsonInterval(rienDeSur, n, NIVEAU).hi;
  if (lo > ref) return `Plus de silences que le banc (${pct(ref)} %) · l’intervalle l’exclut · les vraies réponses échappent davantage à la règle que le corpus écrit à la main.`;
  if (hi < ref) return `Moins de silences que le banc (${pct(ref)} %) · l’intervalle l’exclut.`;
  return `Compatible avec le banc (${pct(ref)} %) · l’intervalle le contient, rien ne dit que les vraies réponses s’en écartent.`;
}

/**
 * La mesure · chaque réponse classée par la règle, les causes comptées, les
 * exemples (de la personne qui lit seulement) filtrés, paginés, anonymisés.
 * `reponses` · déjà bornées et triées (les plus récentes d'abord) par la lecture.
 */
export function vueMesureJarvis(reponses: readonly ReponseStockee[], o: { classe: ClasseReponseJarvis | null; page: number; noms: readonly string[]; borne?: number }): VueMesureJarvis {
  const borne = o.borne ?? BORNE_MESURE_JARVIS;
  const lues = reponses.slice(0, borne);
  const classees = lues.map((r) => ({ r, c: classerReponseJarvis(r.texte) }));
  const n = classees.length;
  const compte = new Map<ClasseReponseJarvis, number>();
  for (const x of classees) compte.set(x.c.classe, (compte.get(x.c.classe) ?? 0) + 1);
  const rienDeSur = n - (compte.get('sure') ?? 0);
  const iv = n ? { lo: wilsonInterval(rienDeSur, n, NIVEAU).lo, hi: wilsonInterval(rienDeSur, n, NIVEAU).hi } : null;
  const b = MESURE_EXTRACTION_JARVIS.reglage.total!;
  const causes: LigneCauseJarvis[] = (['sure', ...CAUSES_SILENCE_JARVIS] as ClasseReponseJarvis[]).map((cle) => {
    const k = compte.get(cle) ?? 0;
    return { cle, libelle: LIBELLE_CAUSE_JARVIS[cle], n: k, part: n ? pct(k / n) : 0, href: lien(cle, 1) };
  });
  const possibles = classees.filter((x) => x.r.mienne && (!o.classe || x.c.classe === o.classe));
  const pages = Math.max(1, Math.ceil(possibles.length / EXEMPLES_PAR_PAGE_JARVIS));
  const page = Math.min(o.page, pages);
  const debut = (page - 1) * EXEMPLES_PAR_PAGE_JARVIS;
  const exemples = possibles.slice(debut, debut + EXEMPLES_PAR_PAGE_JARVIS).map((x, i) => ({
    rang: debut + i + 1, le: x.r.le.slice(0, 10), classe: x.c.classe, libelle: LIBELLE_CAUSE_JARVIS[x.c.classe],
    variables: x.c.variables.map((v) => LIBELLE_CHOIX_VARIABLE[v]).join(', '),
    extrait: extraitAnonymise(x.r.texte, o.noms),
  }));
  return {
    n, borne, tronque: reponses.length >= borne, rienDeSur,
    taux: n && iv ? { pct: pct(rienDeSur / n), bas: pct(iv.lo), haut: pct(iv.hi) } : null,
    banc: { pct: pct(b.rienDeSur / b.n), n: b.n, rienDeSur: b.rienDeSur },
    comparaison: n ? comparaisonBanc(n, rienDeSur) : 'Aucune réponse de Jarvis dans cet espace · rien à mesurer.',
    causes, filtre: o.classe, exemples, page, pages, exemplesPossibles: possibles.length,
    precedente: page > 1 ? lien(o.classe, page - 1) : null,
    suivante: page < pages ? lien(o.classe, page + 1) : null,
  };
}
