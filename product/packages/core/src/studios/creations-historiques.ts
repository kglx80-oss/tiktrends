/**
 * Les CRÉATIONS HISTORIQUES dans la bibliothèque · pubs, images, vidéos et
 * textes produits par les anciens studios (retirés le 10/10).
 *
 * Pur · ni base, ni réseau.
 *
 * Elles vivent dans `generations` (jamais supprimées, jamais modifiées ici).
 * Leurs écrans disparus, la bibliothèque devient leur SEUL accès : chacune y
 * entre en LECTURE SEULE, avec une adresse de lecture et une de
 * téléchargement, jamais un bouton qui renverrait vers un ancien générateur.
 *
 * Entrent : les créations TERMINÉES (`completed`) qui ont de quoi être lues ·
 *  · pub · la composition servie par `/api/ad/:id` (rendu, cache bucket) ;
 *  · image, vidéo · la première adresse produite, si c'est une URL http(s)
 *    (une donnée embarquée ou une adresse forgée n'est pas servie) ;
 *  · texte (script, copie) · servi en fichier texte par sa route gardée.
 * N'entrent pas : brouillons, échecs, en cours, archivées, aperçus d'univers.
 */

export const STATUT_CREATION_LIVREE = 'completed';

export const SORTES_CREATION_HISTORIQUE = ['ad', 'image', 'video', 'script', 'copy'] as const;
export type SorteCreationHistorique = (typeof SORTES_CREATION_HISTORIQUE)[number];

export const cheminTexteHistorique = (id: string): string => `/api/creations-historiques/${encodeURIComponent(id)}/texte`;
export const cheminPubHistorique = (id: string): string => `/api/ad/${encodeURIComponent(id)}`;

const LIBELLE: Record<SorteCreationHistorique, string> = { ad: 'Pub', image: 'Image', video: 'Vidéo', script: 'Texte', copy: 'Texte' };

export interface CreationHistoriqueLue {
  id: string;
  kind: string;
  status: string | null;
  assetUrls: readonly string[] | null;
  createdAt: Date | string;
}

export interface ElementCreationHistorique {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'other';
  url: string;
  createdAt: string;
  historique: { libelle: string; telecharger: string };
}

const HTTP = /^https?:\/\/[^\s"'<>]+$/i;

function dateCourte(d: string): string {
  const t = Date.parse(d);
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' });
}

/** Ce que la bibliothèque montre d'une création historique, ou `null` si elle n'a rien à montrer. */
export function elementCreationHistorique(g: CreationHistoriqueLue): ElementCreationHistorique | null {
  // Seul `completed` entre · les aperçus d'univers (`universe_preview`), brouillons et échecs non.
  if (g.status !== STATUT_CREATION_LIVREE) return null;
  if (!(SORTES_CREATION_HISTORIQUE as readonly string[]).includes(g.kind)) return null;
  const sorte = g.kind as SorteCreationHistorique;
  const createdAt = typeof g.createdAt === 'string' ? g.createdAt : g.createdAt.toISOString();
  const date = dateCourte(createdAt);
  const name = `${LIBELLE[sorte]}${date ? ` · ${date}` : ''}`;
  const historique = (telecharger: string) => ({ libelle: `Création historique · ${LIBELLE[sorte].toLowerCase()}`, telecharger });
  if (sorte === 'ad') {
    const url = cheminPubHistorique(g.id);
    return { id: g.id, name, kind: 'image', url, createdAt, historique: historique(url) };
  }
  if (sorte === 'script' || sorte === 'copy') {
    const url = cheminTexteHistorique(g.id);
    return { id: g.id, name, kind: 'other', url, createdAt, historique: historique(url) };
  }
  const premiere = (g.assetUrls ?? []).find((u) => typeof u === 'string' && HTTP.test(u.trim()));
  if (!premiere) return null;
  const url = premiere.trim();
  return { id: g.id, name, kind: sorte === 'video' ? 'video' : 'image', url, createdAt, historique: historique(url) };
}

/** Le texte d'une création historique (script ou copie), en clair · ce que le fichier téléchargé contient. */
export function texteCreationHistorique(output: unknown): string {
  if (!output || typeof output !== 'object') return '';
  const o = output as Record<string, unknown>;
  const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim()) : []);
  const blocs: string[] = [];
  const section = (titre: string, lignes: string[]) => { if (lignes.length) blocs.push(`${titre}\n${lignes.map((l) => `- ${l}`).join('\n')}`); };
  section('Angles', liste(o.angles));
  section('Hooks', liste(o.hooks));
  const script = Array.isArray(o.script)
    ? o.script.map((b) => (b && typeof b === 'object' ? `${String((b as { time?: unknown }).time ?? '').trim()} ${String((b as { line?: unknown }).line ?? '').trim()}`.trim() : '')).filter(Boolean)
    : [];
  section('Script', script);
  section('Textes principaux', liste(o.primaryTexts));
  section('Légendes', liste(o.captions));
  return blocs.join('\n\n');
}

/* ───────────────────── Vidéos historiques encore en cours ─────────────────── */

/**
 * Les vidéos lancées par l'ancien studio vidéo n'étaient suivies que par son
 * ÉCRAN (le suivi tournait quand on l'ouvrait). L'écran retiré, une tâche
 * planifiée termine ce suivi : la vidéo prête reçoit son adresse, l'échec ou
 * l'attente trop longue sont remboursés, une seule fois. Même délai qu'avant.
 */
export const DELAI_VIDEO_HISTORIQUE_MS = 15 * 60 * 1000;

export type StatutSuiviVideo = 'queued' | 'processing' | 'completed' | 'failed' | 'unknown';

export type DecisionSuiviVideo =
  | { action: 'terminer'; url: string | null }
  | { action: 'echouer'; motif: string }
  | { action: 'attendre' };

export const MOTIF_VIDEO_TROP_LONGUE = 'La génération a pris trop de temps et a été interrompue. Crédits remboursés.';
export const MOTIF_VIDEO_ECHOUEE = 'La génération vidéo a échoué. Crédits remboursés.';

/** Que faire d'une vidéo historique en cours, d'après la réponse du fournisseur et son âge. */
export function decisionSuiviVideo(job: { status: StatutSuiviVideo; videoUrl?: string | null; error?: string | null }, ageMs: number): DecisionSuiviVideo {
  if (job.status === 'completed') {
    const u = (job.videoUrl ?? '').trim();
    return { action: 'terminer', url: HTTP.test(u) ? u : null };
  }
  if (job.status === 'failed') return { action: 'echouer', motif: job.error?.trim() ? `${job.error.trim().slice(0, 300)} · Crédits remboursés.` : MOTIF_VIDEO_ECHOUEE };
  if (Number.isFinite(ageMs) && ageMs > DELAI_VIDEO_HISTORIQUE_MS) return { action: 'echouer', motif: MOTIF_VIDEO_TROP_LONGUE };
  return { action: 'attendre' };
}
