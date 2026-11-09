import { lienNouveauProjet, OBJECTIF_MAX } from '../../studios/anciennes-adresses';
import { SOURCES_MAX } from '../../studios/sources/reference';
import type { TagVeille } from './tags-veille';

/**
 * Spatial · Veille · Sauvegardes · « Créer un projet avec la sélection » (VB
 * SV01, lot 6 bis V5). Règles PURES · ni base, ni réseau, ni modèle.
 *
 * On coche des sauvegardes, on ouvre l'assistant Nouveau projet EXISTANT
 * (`lienNouveauProjet`, un `ref` par sauvegarde) · la préparation les relit
 * dans la portée (marque active) et les joint en références · leurs tags et
 * leurs notes deviennent un brief d'inspiration PROPOSÉ dans « Ton
 * intention » (texte modifiable, jamais une génération, 0 $).
 *
 * Un projet est d'UNE marque · une sélection qui en mêle plusieurs est
 * refusée avec sa raison, avant tout lien (`verdictSelectionProjet`) · la
 * préparation refait la garde (une sauvegarde hors de la marque active fait
 * tomber TOUTE la sélection, sans rien dire d'elle · `REFUS_SELECTION_PROJET`).
 */

/** Au plus les références qu'un projet accepte (`SOURCES_MAX` · le panneau « Depuis la Veille » s'arrête au même nombre). */
export const SELECTION_PROJET_MAX = SOURCES_MAX;

export interface SauvegardeSelectionnable {
  id: string;
  /** La marque de la sauvegarde (`saved_ads.brand_id`) · `null` = espace, sans marque. */
  marqueId: string | null;
  marqueNom?: string | null;
  video?: boolean;
}

export type VerdictSelectionProjet =
  | { ok: true; lien: string; n: number }
  | { ok: false; raison: string };

export const SELECTION_VIDE = 'Coche au moins une sauvegarde pour en faire un projet.';

const nomMarque = (s: SauvegardeSelectionnable): string => (s.marqueNom ?? '').trim() || 'une autre marque';

/**
 * Le geste « Créer un projet avec la sélection » · ouvert avec le lien de
 * l'assistant, ou fermé avec la raison réelle.
 *
 *  · rien de coché, ou plus de `SELECTION_PROJET_MAX` ;
 *  · plusieurs marques · un projet est d'une seule marque ;
 *  · une seule marque qui n'est pas la marque active · l'assistant ne la
 *    relirait pas (il travaille dans la marque active).
 *
 * Une sauvegarde sans marque (`null`, celles de l'espace) va avec toute marque,
 * comme la portée des Studios (`porteeSauvegarde`).
 */
export function verdictSelectionProjet(selection: ReadonlyArray<SauvegardeSelectionnable>, o: { marqueActive: { id: string; nom: string } | null }): VerdictSelectionProjet {
  const uniques = [...new Map(selection.map((s) => [s.id, s])).values()];
  if (uniques.length === 0) return { ok: false, raison: SELECTION_VIDE };
  if (uniques.length > SELECTION_PROJET_MAX) {
    return { ok: false, raison: `Un projet garde ${SELECTION_PROJET_MAX} références au plus · décoche-en ${uniques.length - SELECTION_PROJET_MAX}.` };
  }
  const marques = new Map<string, string>();
  for (const s of uniques) if (s.marqueId) marques.set(s.marqueId, nomMarque(s));
  if (marques.size > 1) {
    const noms = [...marques.values()];
    return { ok: false, raison: `Ta sélection mêle ${marques.size} marques (${noms.join(', ')}) · un projet se fait pour une seule marque · ne garde que les sauvegardes de l’une d’elles.` };
  }
  const [seule] = [...marques.entries()];
  if (seule && seule[0] !== o.marqueActive?.id) {
    return { ok: false, raison: `Ces sauvegardes sont gardées pour ${seule[1]} · ouvre cette marque pour en faire un projet.` };
  }
  const type = uniques.every((s) => s.video) ? 'video' : 'ads';
  return { ok: true, n: uniques.length, lien: lienNouveauProjet({ type, refs: uniques.map((s) => s.id) }) };
}

/** Le refus de la préparation · une sauvegarde de la sélection est hors de portée · rien d'elle n'est dit. */
export const REFUS_SELECTION_PROJET = 'Une sauvegarde de cette sélection n’est pas accessible ici (supprimée, d’une autre marque ou hors de tes droits) · aucune n’est jointe, le projet partira de ton intention seule.';

/** Le titre proposé d'un projet né d'une sélection. */
export function titreSelectionProjet(annonceurs: readonly string[]): string {
  const noms = [...new Set(annonceurs.map((a) => a.trim()).filter(Boolean))];
  if (noms.length === 1) return `D’après ${noms[0]}`;
  return `D’après ${annonceurs.length} sauvegardes de la Veille`;
}

export interface InspirationSauvegarde { annonceur: string; tags: ReadonlyArray<TagVeille>; note: string | null }

const net = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * Le brief d'inspiration PROPOSÉ dans « Ton intention » · les tags (communs
 * d'abord, avec leur effectif) puis, sauvegarde par sauvegarde, son annonceur,
 * ses tags et sa note. Rien d'autre (ni le texte de la pub, ni un résultat
 * inventé) · tient dans `OBJECTIF_MAX` (la borne serveur de l'intention) ·
 * quand les notes sont trop longues, chacune est abrégée d'autant et finit
 * par « … » (la note elle-même n'est pas touchée).
 */
export function briefInspirationSauvegardes(items: ReadonlyArray<InspirationSauvegarde>): string {
  if (items.length === 0) return '';
  const compte = new Map<string, { nom: string; n: number }>();
  for (const i of items) for (const t of i.tags) { const x = compte.get(t.cle); if (x) x.n++; else compte.set(t.cle, { nom: t.nom, n: 1 }); }
  const tags = [...compte.values()].sort((a, b) => b.n - a.n || a.nom.localeCompare(b.nom, 'fr'));
  const tete = [
    `Inspiration · ${items.length} sauvegarde${items.length > 1 ? 's' : ''} de la Veille, jointe${items.length > 1 ? 's' : ''} en références`,
    tags.length ? `Tags · ${tags.map((t) => (t.n > 1 ? `${t.nom} (${t.n})` : t.nom)).join(', ')}` : '',
  ].filter(Boolean);
  const lignes = items.map((i, k) => `${k + 1} · ${net(i.annonceur) || 'Annonceur'}${i.tags.length ? ` · ${i.tags.map((t) => t.nom).join(', ')}` : ''}`);
  const notes = items.map((i) => (i.note ? net(i.note) : ''));
  const prefixe = 'Note · ';
  const compose = (budget: number) => [...tete, ...lignes.flatMap((l, k) => {
    const n = notes[k]!;
    if (!n) return [l];
    const court = [...n].length > budget ? `${[...n].slice(0, Math.max(0, budget - 1)).join('').trimEnd()}…` : n;
    return [l, `${prefixe}${court}`];
  })].join('\n');
  const plein = compose(Number.POSITIVE_INFINITY);
  if ([...plein].length <= OBJECTIF_MAX) return plein;
  // Les notes cèdent la place, à parts égales · le reste (tags, annonceurs) est toujours là.
  const avecNote = notes.filter(Boolean).length;
  const fixe = [...compose(0)].length - avecNote * 1;
  let budget = Math.max(1, Math.floor((OBJECTIF_MAX - fixe) / Math.max(1, avecNote)));
  let texte = compose(budget);
  while ([...texte].length > OBJECTIF_MAX && budget > 1) { budget--; texte = compose(budget); }
  return [...texte].slice(0, OBJECTIF_MAX).join('');
}
