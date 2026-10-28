import { PROVEN_DAYS } from '../../adsmap/market-stats';
import { FORMAT_INCERTAIN, FORMAT_NON_CLASSE, TRIS_FORMATS, dateCourteFormat, estFormatCreatif, libellePlateforme, type TriFormats } from '../../formats-creatifs';

/**
 * Spatial · Veille · les listes des écrans Sauvegardes, Ce qui scale, Radar et
 * Concurrents (pur). Toutes lisent des données RÉELLES (sauvegardes rangées
 * par dossier, nouveautés du suivi, rapports de concurrents) · aucune valeur
 * de la maquette n'est reprise.
 */

/* ───────────── Sauvegardes · les collections sont les dossiers ───────────── */

export const COLLECTION_TOUTES = 'all';
export const COLLECTION_NON_CLASSEES = 'none';

/**
 * Les collections de la maquette (`vSaved`) = les dossiers réels des
 * sauvegardes (`saved_ads.folder`) · « Toutes », chaque dossier par ordre
 * alphabétique, puis « Non classées » (sans dossier).
 */
export function collectionsSauvegardes(items: ReadonlyArray<{ folder: string | null }>): Array<{ cle: string; libelle: string; n: number }> {
  const parDossier = new Map<string, number>();
  let sans = 0;
  for (const i of items) {
    const f = i.folder?.trim();
    if (f) parDossier.set(f, (parDossier.get(f) ?? 0) + 1); else sans++;
  }
  const dossiers = [...parDossier.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([f, n]) => ({ cle: `f:${f}`, libelle: f, n }));
  return [{ cle: COLLECTION_TOUTES, libelle: 'Toutes les sauvegardes', n: items.length }, ...dossiers, { cle: COLLECTION_NON_CLASSEES, libelle: 'Non classées', n: sans }];
}

export function dansCollection(folder: string | null, cle: string): boolean {
  if (cle === COLLECTION_TOUTES) return true;
  if (cle === COLLECTION_NON_CLASSEES) return !folder?.trim();
  return cle.startsWith('f:') && folder?.trim() === cle.slice(2);
}

/** La collection demandée par l'adresse · inconnue → toutes. */
export function collectionValide(v: string | null | undefined, collections: ReadonlyArray<{ cle: string }>): string {
  return v && collections.some((c) => c.cle === v) ? v : COLLECTION_TOUTES;
}

/** Une sauvegarde « tourne longtemps » au seuil éprouvé du noyau (`PROVEN_DAYS`). */
export const tourneLongtemps = (jours: number | null | undefined) => (jours ?? 0) >= PROVEN_DAYS;

/* ───────────── Ce qui scale · classé par durée de diffusion ───────────── */

/**
 * La maquette (`vScale`) range « les créas que les marques gardent en ligne le
 * plus longtemps » · tri par jours de diffusion décroissants, et la barre est
 * la part de la plus longue (100 % pour la première).
 */
export function classerParDuree<T extends { daysRunning?: number | null }>(ads: readonly T[]): Array<{ ad: T; rang: number; part: number }> {
  const tri = [...ads].sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0));
  const max = Math.max(1, tri[0]?.daysRunning ?? 0);
  return tri.map((ad, i) => ({ ad, rang: i + 1, part: Math.round(((ad.daysRunning ?? 0) / max) * 1000) / 10 }));
}

/** La première ligne d'un texte publicitaire · l'accroche montrée en titre. */
export function accrocheDe(body: string | null | undefined, max = 120): string {
  const l = (body ?? '').split(/\r?\n/).map((x) => x.trim()).find(Boolean) ?? '';
  return l.length > max ? `${l.slice(0, max - 1).trimEnd()}…` : l;
}

/* ───────────── Radar · ce que le suivi a repéré ───────────── */

export interface EvenementSuivi { advertiserName: string; createdAt: Date; unseen: boolean }

/**
 * Les alertes de la semaine · une par marque suivie qui a sorti au moins une
 * nouvelle pub depuis 7 jours (nouveautés RÉELLES du suivi), la plus active
 * d'abord. Aucune alerte inventée · une semaine calme n'en donne aucune.
 */
export function alertesSemaine(evenements: ReadonlyArray<EvenementSuivi>, maintenant: Date, max = 3): Array<{ marque: string; n: number; titre: string }> {
  const depuis = maintenant.getTime() - 7 * 86_400_000;
  const parMarque = new Map<string, number>();
  for (const e of evenements) if (e.createdAt.getTime() >= depuis) parMarque.set(e.advertiserName, (parMarque.get(e.advertiserName) ?? 0) + 1);
  return [...parMarque.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr')).slice(0, max)
    .map(([marque, n]) => ({ marque, n, titre: `${marque} a lancé ${n} nouvelle${n > 1 ? 's' : ''} pub${n > 1 ? 's' : ''} cette semaine` }));
}

/** Le libellé de nouveautés d'une marque suivie (non vues), ou `null` (rien de neuf). */
export function nouveautesMarque(n: number): string | null {
  if (n <= 0) return null;
  return `${n} nouvelle${n > 1 ? 's' : ''} non vue${n > 1 ? 's' : ''}`;
}

/* ───────────── Concurrents · lecture d'un rapport réel ───────────── */

export interface RapportLu {
  analyzedAt: string;
  aggregates: { adCount: number; byPlatform: Record<string, number>; byMedia: Record<string, number>; avgDaysRunning: number };
  ads: ReadonlyArray<{ body?: string | null; daysRunning?: number | null; status?: string | null; estimatedSpend?: number | null }>;
  insights: { adAngles?: string[]; summary?: string } | null;
}

/**
 * Les chiffres d'une carte concurrent (`ccc` de la maquette), tirés du rapport
 * en cache (`analyzeCompetitorAction`) · parts média et plateforme en %, les
 * accroches des pubs qui tournent le plus longtemps, l'angle de l'analyse IA
 * quand elle a eu lieu.
 */
export function lectureRapportConcurrent(r: RapportLu) {
  const total = r.aggregates.adCount || 0;
  const pc = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const actives = r.ads.filter((a) => (a.status ?? 'active').toLowerCase() === 'active').length;
  const depense = r.ads.reduce((s, a) => s + (a.estimatedSpend ?? 0), 0);
  const medias = Object.entries(r.aggregates.byMedia).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, n]) => ({ libelle: k === 'video' ? 'Vidéo' : k === 'image' ? 'Image' : k.charAt(0).toUpperCase() + k.slice(1), part: pc(n) }));
  const accroches = [...r.ads].filter((a) => (a.body ?? '').trim()).sort((a, b) => (b.daysRunning ?? 0) - (a.daysRunning ?? 0))
    .map((a) => accrocheDe(a.body, 90)).filter((v, i, t) => t.indexOf(v) === i).slice(0, 3);
  return {
    pubs: total,
    actives,
    dureeMoyenne: r.aggregates.avgDaysRunning,
    depense: depense > 0 ? depense : null,
    metaTiktok: `${pc(r.aggregates.byPlatform.meta ?? 0)} / ${pc(r.aggregates.byPlatform.tiktok ?? 0)}`,
    medias,
    accroches,
    angle: r.insights?.adAngles?.[0] ?? null,
  };
}

/** « il y a 12 min », « il y a 2 h », « il y a 3 j ». */
export function ilYa(iso: string | Date, maintenant: Date): string {
  const d = Math.max(0, maintenant.getTime() - new Date(iso).getTime());
  const min = Math.floor(d / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

/* ───────────── Sauvegardes · filtres portés de l'écran Formats (vague 3) ───────────── */

export const FORMAT_TOUS = 'tous' as const;
export interface FiltresSauvegardes { texte: string; format: string; media: 'tous' | 'video' | 'image'; plateforme: string; tri: TriFormats }
export const FILTRES_SAUVEGARDES: FiltresSauvegardes = { texte: '', format: FORMAT_TOUS, media: 'tous', plateforme: 'tous', tri: 'recent' };

/**
 * Filtre les sauvegardes · texte (corps ou annonceur), format classé
 * (`non_classe` = la file à classer · `incertain` = les classements sous le
 * seuil de confiance, exclus des formats et de la file), média et plateforme.
 * Aucun filtre = tout. L'appelant passe `format: 'incertain'` pour une
 * sauvegarde incertaine (`formatFiltrable`).
 */
export function filtrerSauvegardes<T extends { platform: string; video: boolean; texte: string; annonceur: string; format: string | null }>(items: readonly T[], f: FiltresSauvegardes): T[] {
  const q = f.texte.trim().toLowerCase();
  return items.filter((i) =>
    (!q || `${i.texte} ${i.annonceur}`.toLowerCase().includes(q))
    && (f.format === FORMAT_TOUS || (f.format === 'non_classe' ? !i.format : i.format === f.format))
    && (f.media === 'tous' || (f.media === 'video') === i.video)
    && (f.plateforme === 'tous' || i.platform === f.plateforme));
}

/* ───────────── Sauvegardes · ce que l'écran Formats V5 savait faire (vague 4) ───────────── */

/** La valeur de format d'une sauvegarde pour `filtrerSauvegardes` · l'incertaine a sa propre file. */
export function formatFiltrable(f: { id: string | null; etat?: string } | null | undefined): string | null {
  if (!f) return null;
  if (f.etat === FORMAT_INCERTAIN) return FORMAT_INCERTAIN;
  return f.id ?? null;
}

/**
 * Les filtres de départ lus dans l'adresse (`/saved?format=non_classe&tri=duree`) ·
 * le lien « Classer maintenant » de Formats et les anciennes adresses de
 * l'écran Formats y mènent. Une valeur inconnue est ignorée (défaut).
 */
export function lireFiltresSauvegardes(sp: Readonly<Record<string, string | string[] | undefined>>): FiltresSauvegardes {
  const un = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const format = un(sp.format);
  const tri = un(sp.tri);
  const media = un(sp.media);
  return {
    ...FILTRES_SAUVEGARDES,
    format: format === FORMAT_NON_CLASSE || format === FORMAT_INCERTAIN || estFormatCreatif(format) ? format : FORMAT_TOUS,
    tri: TRIS_FORMATS.some((t) => t.id === tri) ? (tri as TriFormats) : FILTRES_SAUVEGARDES.tri,
    media: media === 'video' || media === 'image' ? media : 'tous',
  };
}

const instant = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isNaN(t) ? -Infinity : t; };

/**
 * Les quatre tris de l'écran Formats V5 (`TRIS_FORMATS`) appliqués aux
 * sauvegardes · mêmes comparaisons que `grilleFormat`. Une date absente passe
 * en dernier. Ne modifie pas la liste reçue.
 */
export function trierSauvegardes<T extends { sauvegardeLe?: string | null; classeeLe?: string | null; jours?: number | null }>(items: readonly T[], tri: TriFormats): T[] {
  const cmp: Record<TriFormats, (a: T, b: T) => number> = {
    recent: (a, b) => instant(b.sauvegardeLe) - instant(a.sauvegardeLe),
    ancien: (a, b) => instant(a.sauvegardeLe) - instant(b.sauvegardeLe),
    classe: (a, b) => instant(b.classeeLe) - instant(a.classeeLe) || instant(b.sauvegardeLe) - instant(a.sauvegardeLe),
    duree: (a, b) => (b.jours ?? -1) - (a.jours ?? -1) || instant(b.sauvegardeLe) - instant(a.sauvegardeLe),
  };
  return [...items].sort((a, b) => cmp[tri](a, b) || 0);
}

/**
 * La provenance d'une sauvegarde, comme l'écran Formats V5 · « Meta ·
 * sauvegardée le 05/10/2026 · classée le 06/10/2026 par Kevin ». Le nom n'est
 * dit que s'il a été lu chez un membre de l'espace (la page s'en charge).
 */
export function provenanceSauvegarde(p: { platform: string; sauvegardeLe: string | null; classeeLe: string | null; auteur: string | null }): string {
  const parts = [`${libellePlateforme(p.platform)} · sauvegardée le ${dateCourteFormat(p.sauvegardeLe) ?? 'n/c'}`];
  const classe = dateCourteFormat(p.classeeLe);
  if (classe) parts.push(`classée le ${classe}${p.auteur ? ` par ${p.auteur}` : ''}`);
  return parts.join(' · ');
}
