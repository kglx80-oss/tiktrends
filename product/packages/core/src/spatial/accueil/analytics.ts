/**
 * La vue « Analytics » de l'Accueil Spatial (`/dashboard?vue=analytics`) · les
 * lectures RÉELLES de l'ancienne vue Analytics, portées sans changer un calcul :
 * les KPI Meta Ads de la marque active (30 j contre les 30 j précédents,
 * répartitions, top créas), la diversité créative (gabarits et accroches des
 * générations, tags des assets). L'« aperçu créas » de démonstration de
 * l'ancienne vue n'est PAS porté · ses chiffres ne venaient d'aucune source.
 *
 * Pur · ni base ni réseau. Les formes d'entrée sont structurelles (le noyau ne
 * dépend pas du paquet des intégrations).
 */
import { partDeMax } from '../../proportion';
import { niveauScore, LABEL_NIVEAU, type NiveauScore } from '../../score-jarvis';

/* ───────────────────────────── Assistant ───────────────────────────── */

/** Les questions proposées par l'assistant de l'Accueil (celles de l'ancienne interface). */
export const SUGGESTIONS_ASSISTANT_ACCUEIL: readonly string[] = [
  'Quelles créas devrais-je couper ou scaler ?',
  'Donne-moi 5 hooks pour ma marque',
  'Que font mes concurrents en ce moment ?',
  'Analyse ma performance de la semaine',
];

/**
 * Le prix d'une question, dit AVANT l'envoi · le coût du barème (`costFor('chat')`)
 * débité à l'envoi par l'action serveur, rien pour un compte illimité.
 */
export function prixQuestionAssistant(p: { cout: number; illimite: boolean }): string {
  if (p.illimite) return 'Compte illimité · aucune question n’est débitée';
  const n = Math.max(0, Math.round(p.cout));
  return `${n} crédit${n > 1 ? 's' : ''} par question, débité${n > 1 ? 's' : ''} à l’envoi · remboursé${n > 1 ? 's' : ''} si la réponse échoue`;
}

/* ───────────────────────────── KPI Meta ───────────────────────────── */

export interface KpiMetaEntree { spend: number; cpa: number; roas: number; revenue: number; aov: number; cpcAll: number; cpcLink: number; cpm: number }
export interface LigneRepartitionEntree { key: string; spend: number; roas: number }
export interface InsightsMetaEntree {
  accountName?: string | null;
  currency?: string | null;
  window: KpiMetaEntree;
  previous: KpiMetaEntree;
  topAds?: ReadonlyArray<{ name: string; spend: number; roas: number; cpa: number }> | null;
  breakdowns?: { platform: readonly LigneRepartitionEntree[]; ageGender: readonly LigneRepartitionEntree[] } | null;
}

type Genre = 'money' | 'x' | 'num' | 'pct';
const METRIQUES: ReadonlyArray<{ cle: keyof KpiMetaEntree; libelle: string; genre: Genre; hausseBonne: boolean }> = [
  { cle: 'spend', libelle: 'Dépense', genre: 'money', hausseBonne: true },
  { cle: 'cpa', libelle: 'CPA', genre: 'money', hausseBonne: false },
  { cle: 'roas', libelle: 'ROAS', genre: 'x', hausseBonne: true },
  { cle: 'revenue', libelle: 'Valeur d’achat', genre: 'money', hausseBonne: true },
  { cle: 'aov', libelle: 'Panier moyen', genre: 'money', hausseBonne: true },
  { cle: 'cpcAll', libelle: 'CPC (tous)', genre: 'money', hausseBonne: false },
  { cle: 'cpcLink', libelle: 'CPC (lien)', genre: 'money', hausseBonne: false },
  { cle: 'cpm', libelle: 'CPM', genre: 'money', hausseBonne: false },
];

/** Le format de l'ancienne vue · monnaie entière dès 1 000, 2 décimales sinon. */
function formatMeta(n: number, devise: string, genre: Genre): string {
  if (genre === 'x') return `${n.toFixed(2)}×`;
  if (genre === 'pct') return `${n.toFixed(2)} %`;
  if (genre === 'num') return Math.round(n).toLocaleString('fr-FR');
  const v = n >= 1000 ? Math.round(n).toLocaleString('fr-FR') : n.toFixed(2);
  return `${v} ${devise}`;
}

/** La variation en %, une décimale · `null` sans période précédente. */
export function variationMeta(courant: number, precedent: number): number | null {
  if (!precedent) return null;
  return Math.round(((courant - precedent) / precedent) * 1000) / 10;
}

export interface MetriquesMetaAnalytics {
  sous: string;
  kpis: Array<{ libelle: string; valeur: string; variation: string | null; ton: 'bon' | 'mauvais' | null }>;
  repartitions: Array<{ titre: string; lignes: Array<{ cle: string; texte: string; part: number }> }>;
  topAds: Array<{ nom: string; roas: string; roasBon: boolean; cpa: string; depense: string }>;
}

/**
 * Les KPI Meta de la marque active, tels que l'ancienne vue les affichait. Le
 * sous-titre s'ouvre sur LE libellé de la connexion (`etatConnexionMeta`, le
 * même que l'Accueil et le Radar), puis date les KPI eux-mêmes (`meta_synced_at`) ·
 * une mesure Adsmap plus récente ne fait pas passer des KPI anciens pour frais.
 */
export function metriquesMetaAnalytics(ins: InsightsMetaEntree, synchro: Date | string | null, connexion: string): MetriquesMetaAnalytics {
  const devise = ins.currency || '€';
  const date = synchro ? new Date(synchro) : null;
  const synchroTexte = date && !Number.isNaN(date.getTime()) ? ` · KPI du ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}` : '';
  const kpis = METRIQUES.map((m) => {
    const d = variationMeta(ins.window[m.cle], ins.previous[m.cle]);
    const bon = d == null ? null : (m.hausseBonne ? d >= 0 : d <= 0);
    return { libelle: m.libelle, valeur: formatMeta(ins.window[m.cle], devise, m.genre), variation: d == null ? null : `${d >= 0 ? '+' : ''}${d} %`, ton: bon == null ? null : bon ? 'bon' as const : 'mauvais' as const };
  });
  const rep = (titre: string, lignes: readonly LigneRepartitionEntree[]) => {
    const max = Math.max(1, ...lignes.map((r) => r.spend));
    return { titre, lignes: lignes.map((r) => ({ cle: r.key, texte: `${Math.round(r.spend).toLocaleString('fr-FR')} ${devise}${r.roas ? ` · ${r.roas}×` : ''}`, part: partDeMax(r.spend, max) })) };
  };
  const b = ins.breakdowns;
  const repartitions = [
    ...(b?.platform.length ? [rep('Par plateforme', b.platform)] : []),
    ...(b?.ageGender.length ? [rep('Par âge & genre', b.ageGender.slice(0, 8))] : []),
  ];
  return {
    sous: `${connexion} · 30 j vs 30 j précédents${ins.accountName ? ` · ${ins.accountName}` : ''}${synchroTexte}`,
    kpis,
    repartitions,
    topAds: (ins.topAds ?? []).slice(0, 8).map((a) => ({ nom: a.name, roas: `${a.roas}×`, roasBon: a.roas >= 2, cpa: formatMeta(a.cpa, devise, 'money'), depense: formatMeta(a.spend, devise, 'money') })),
  };
}

/* ───────────────────────── Diversité créative ───────────────────────── */

export const LIBELLE_GABARIT: Readonly<Record<string, string>> = { problem_solution: 'Problème/solution', before_after: 'Avant/après', testimonial: 'Témoignage', benefits: 'Bénéfices', ugc: 'UGC', stat: 'Stat', offer: 'Offre' };

export interface DiversiteCreative {
  score: number;
  niveau: NiveauScore;
  libelleNiveau: string;
  total: number;
  gabarits: Array<{ cle: string; libelle: string; n: number; part: number }>;
  tags: Array<{ tag: string; n: number; part: number }>;
}

/**
 * Le calcul de l'ancienne vue, à l'identique · moitié variété des gabarits
 * (sur 7), moitié unicité des accroches · top 14 des tags d'assets. `null`
 * sans aucune génération ni aucun tag (rien à dire).
 */
export function diversiteCreative(generations: ReadonlyArray<{ template?: unknown; headline?: unknown }>, tagsParAsset: ReadonlyArray<readonly string[] | null>): DiversiteCreative | null {
  const parGabarit = new Map<string, number>();
  const accroches = new Set<string>();
  for (const g of generations) {
    if (typeof g.template === 'string' && g.template) parGabarit.set(g.template, (parGabarit.get(g.template) ?? 0) + 1);
    if (typeof g.headline === 'string' && g.headline) accroches.add(g.headline.toLowerCase().trim());
  }
  const total = generations.length;
  const scoreGabarits = Math.min(1, parGabarit.size / 7);
  const scoreAccroches = total ? Math.min(1, accroches.size / total) : 0;
  const score = Math.round((scoreGabarits * 0.5 + scoreAccroches * 0.5) * 100);
  const parTag = new Map<string, number>();
  for (const tags of tagsParAsset) for (const t of tags ?? []) { const k = t.trim().toLowerCase(); if (k) parTag.set(k, (parTag.get(k) ?? 0) + 1); }
  const tags = [...parTag.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n).slice(0, 14);
  if (total === 0 && tags.length === 0) return null;
  const gabarits = [...parGabarit.entries()].map(([cle, n]) => ({ cle, libelle: LIBELLE_GABARIT[cle] ?? cle, n })).sort((a, b) => b.n - a.n);
  const maxG = Math.max(1, ...gabarits.map((t) => t.n));
  const maxT = Math.max(1, ...tags.map((t) => t.n));
  const niveau = niveauScore(score);
  return {
    score, niveau, libelleNiveau: LABEL_NIVEAU[niveau], total,
    gabarits: gabarits.map((g) => ({ ...g, part: partDeMax(g.n, maxG) })),
    tags: tags.map((t) => ({ ...t, part: partDeMax(t.n, maxT) })),
  };
}

/** La pastille du palier de diversité (classes de la maquette). */
export const CLASSE_NIVEAU_SCORE: Readonly<Record<NiveauScore, 'g' | 'w' | 'r'>> = { fort: 'g', correct: 'w', faible: 'r' };

/* ───────────────────────── Bilan avancé (Jarvis) ───────────────────────── */

type Ton = 'bon' | 'mauvais' | null;
interface Tranche { liftPoints: number | null; conclusive: boolean }
const tonTranche = (t: Tranche): Ton => (t.conclusive ? ((t.liftPoints ?? 0) > 0 ? 'bon' : 'mauvais') : null);

export interface BilanAvanceAccueil {
  marque: string;
  tendance: { jours: string; resume: string; ton: Ton } | null;
  attribution: {
    resume: string;
    ton: Ton;
    manque: string | null;
    exclus: string | null;
    parts: Array<{ cle: string; libelle: string; ecart: string; ton: Ton; detail: string }>;
  };
}

/**
 * Le « Bilan avancé · Jarvis » de l'ancienne vue Analytics, mis en phrases ·
 * tendance (deux fenêtres glissantes) et attribution (avec ou sans la mémoire),
 * lues par les actions existantes (`creativeTrendAction`, `attributionViewAction`).
 * Un résultat ne se colore que s'il est TRANCHÉ (intervalles disjoints).
 */
export function bilanAvanceAccueil(p: {
  marque: string;
  tendance: (Tranche & { days: number; summary: string }) | null;
  attribution: { overall: Tranche & { summary: string; excluded: number }; parts: ReadonlyArray<Tranche & { part: string; label: string; withIt: { wins: number; n: number }; withoutIt: { wins: number; n: number } }>; total: number } | null;
  erreur: string | null;
}): BilanAvanceAccueil {
  const a = p.attribution;
  return {
    marque: p.marque,
    tendance: p.tendance ? { jours: `${p.tendance.days} jours`, resume: p.tendance.summary, ton: tonTranche(p.tendance) } : null,
    attribution: {
      resume: p.erreur ?? a?.overall.summary ?? 'Lecture indisponible.',
      ton: p.erreur ? 'mauvais' : a ? tonTranche(a.overall) : null,
      manque: a && !a.overall.conclusive
        ? `Il faut 6 tests arbitrés dans chacun des deux groupes · les créas nées du Studio avec la mémoire, et les autres. ${a.total > 0 ? `${a.total} test(s) arbitré(s) alimentent la comparaison pour l’instant.` : 'Aucun test arbitré ne l’alimente pour l’instant.'}`
        : null,
      exclus: a && a.overall.excluded > 0
        ? `${a.overall.excluded} test(s) arbitré(s) sont écartés des deux groupes · plusieurs créas partagent leur concept et rien ne dit laquelle est née de quelle génération. Les ranger parmi les témoins gonflerait le témoin de créas qui ont peut-être profité de la mémoire. Les créas suivies depuis maintenant portent le lien sur elles.`
        : null,
      parts: (a?.parts ?? []).filter((x) => x.liftPoints !== null).map((x) => ({
        cle: x.part, libelle: x.label,
        ecart: `${(x.liftPoints ?? 0) > 0 ? '+' : ''}${Math.round((x.liftPoints ?? 0) * 100)} pt`,
        ton: tonTranche(x),
        detail: `${x.withIt.wins}/${x.withIt.n} contre ${x.withoutIt.wins}/${x.withoutIt.n}${x.conclusive ? '' : ' · pas encore tranché'}`,
      })),
    },
  };
}
