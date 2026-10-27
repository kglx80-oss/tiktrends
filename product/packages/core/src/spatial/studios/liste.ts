import { dateCourteUtc, type EtapeProjet, type ManqueProjet } from '../../studios/brief';
import { ORDRE_ETAPES_PROJET, rangEtapeProjet, type CarteIterationAccueil } from '../../accueil-v5';
import { compteursFiltreProjets, filtrerProjets, type CleFiltreProjet, type ProjetFiltrable } from '../../studios/liste-projets';
import { DEFINITIONS_CAPACITES, type CapaciteStudio } from '../../studios/interrupteurs';

/**
 * Spatial · Studios, la liste des projets (`/studio/projets`, maquette
 * `studios`). Pur · ni base, ni réseau. Ce que l'écran DÉCIDE (pastille d'étape,
 * barre d'avancement, phrase de reprise, libellés des filtres, pastille d'une
 * itération) vit ici, jamais dans le JSX.
 *
 * ── Honnêteté ────────────────────────────────────────────────────────────────
 *
 * La maquette filtre par STATUT (En cours / En revue / Brouillons / Archivés) ·
 * `studio_projects.status` ne vaut que `active` / `archived`. L'axe réel des
 * projets actifs est l'ÉTAPE (`completudeProjet`) · les filtres reprennent la
 * rangée de la maquette avec les étapes réelles et leurs compteurs réels
 * (`compteursFiltreProjets`), puis « Archivés » (statut réel, relu à part).
 */

/** Classe de la pastille d'étape (`span.pill`, maquette : c / w / neutre). */
export type ClassePastilleSpatiale = '' | 'c' | 'w' | 'g' | 'r';

/** Brief à compléter = neutre (brouillon), prêt = à lancer, production = en cours. */
export const CLASSE_ETAPE_SPATIALE: Readonly<Record<EtapeProjet, ClassePastilleSpatiale>> = {
  brief_a_completer: '',
  brief_pret: 'w',
  production: 'c',
};

/** La barre `steps4` · une case par étape réelle, `on` (faite), `cur` (en cours), vide (à venir). */
export function segmentsEtapeSpatiale(etape: EtapeProjet): Array<'on' | 'cur' | ''> {
  const rang = rangEtapeProjet(etape);
  return ORDRE_ETAPES_PROJET.map((_, i) => (i + 1 < rang ? 'on' : i + 1 === rang ? 'cur' : ''));
}

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

/** « il y a 12 min », « il y a 2 j », « il y a 1 sem. » (maquette) · au-delà de 5 semaines, la date. */
export function depuisSpatial(iso: string | null | undefined, maintenant: Date): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const d = Math.max(0, maintenant.getTime() - t);
  if (d < MINUTE) return 'à l’instant';
  if (d < HEURE) return `il y a ${Math.floor(d / MINUTE)} min`;
  if (d < JOUR) return `il y a ${Math.floor(d / HEURE)} h`;
  if (d < 7 * JOUR) return `il y a ${Math.floor(d / JOUR)} j`;
  if (d < 35 * JOUR) return `il y a ${Math.floor(d / (7 * JOUR))} sem.`;
  return `le ${dateCourteUtc(iso)}`;
}

/**
 * La phrase de reprise d'une carte (`.stp`, à droite) · ce qui bloque d'abord,
 * sinon le nombre de sources, puis la fraîcheur. Toujours des données réelles.
 */
export function repriseCarteSpatiale(c: { manques: readonly ManqueProjet[]; sources: number; updatedAt: string }, maintenant: Date): string {
  const bloquant = c.manques.find((m) => m.bloquant);
  const tete = bloquant ? bloquant.libelle : `${c.sources} source${c.sources > 1 ? 's' : ''}`;
  const quand = depuisSpatial(c.updatedAt, maintenant);
  return quand ? `${tete} · ${quand}` : tete;
}

/** Les filtres Spatial · les étapes réelles, plus « Archivés » (statut `archived`, relu à part). */
export type CleFiltreSpatial = CleFiltreProjet | 'archive';

export interface FiltreProjetSpatial { cle: CleFiltreSpatial; libelle: string }

/**
 * La rangée `seg` · « Tous · 6 », puis chaque étape réelle avec son compteur,
 * puis « Archivés · n » (maquette) quand les projets archivés ont été relus
 * (`archives` = leur nombre réel ; `null` · non relus, le filtre n'est pas
 * proposé plutôt que d'afficher un zéro faux).
 */
export function filtresProjetsSpatial(cartes: readonly ProjetFiltrable[], archives: number | null = null): FiltreProjetSpatial[] {
  const f: FiltreProjetSpatial[] = compteursFiltreProjets(cartes).map((o) => ({ cle: o.cle, libelle: `${o.libelle} · ${o.n}` }));
  if (archives !== null) f.push({ cle: 'archive', libelle: `Archivés · ${archives}` });
  return f;
}

/**
 * Recherche dans les cartes déjà chargées · titre, marque, type (règle
 * `filtrerProjets`, insensible aux accents). « Archivés » montre les projets
 * archivés relus, filtrés par la même recherche, sans filtre d'étape.
 */
export function cartesFiltreesSpatial<T extends ProjetFiltrable>(actives: readonly T[], archives: readonly T[], f: { cle: CleFiltreSpatial; recherche: string }): T[] {
  return f.cle === 'archive' ? filtrerProjets(archives, { cle: 'tous', recherche: f.recherche }) : filtrerProjets(actives, { cle: f.cle, recherche: f.recherche });
}

/**
 * Les gestes de la carte (`.pacts`) qui ont un service réel, dans l'ordre de
 * la maquette (Itérer, Dupliquer, Archiver, Supprimer). « Itérer » ouvre les
 * variantes du projet (l'itération part d'une variante mesurée, `iterer`) ;
 * « Archiver » / « Restaurer » (`supprimerProjet` · statut `archived`,
 * réversible). « Dupliquer » et « Supprimer définitivement » n'ont pas de
 * service · ils ne sont pas rendus (aucune suppression de donnée sans mandat).
 */
export function gestesCarteSpatiale(c: { id: string; archive: boolean }, peutModifier: boolean): Array<{ cle: 'iterer'; href: string } | { cle: 'archiver' | 'restaurer' }> {
  const g: Array<{ cle: 'iterer'; href: string } | { cle: 'archiver' | 'restaurer' }> = [];
  if (!c.archive) g.push({ cle: 'iterer', href: `/studio/projets/${encodeURIComponent(c.id)}#variantes` });
  if (peutModifier) g.push({ cle: c.archive ? 'restaurer' : 'archiver' });
  return g;
}

/** La pastille d'une prochaine itération · verdict ARBITRÉ et lot réel, icône selon que le lot est conclu. */
export function pastilleIterationSpatiale(c: Pick<CarteIterationAccueil, 'verdict' | 'lot'>): { libelle: string; classe: ClassePastilleSpatiale; icone: 'check' | 'flask' } {
  const conclu = /conclu/.test(c.lot);
  return { libelle: `${c.verdict} · ${c.lot}`, classe: conclu ? 'g' : 'w', icone: conclu ? 'check' : 'flask' };
}

/** Le sous-titre du lien « Itérer sur une autre créa » · combien de gagnantes prouvées restent. */
export function autresIterationsSpatial(total: number, montrees: number): string {
  const reste = Math.max(0, total - montrees);
  return reste > 0
    ? `${reste} autre${reste > 1 ? 's' : ''} gagnante${reste > 1 ? 's' : ''} prouvée${reste > 1 ? 's' : ''} à reprendre`
    : 'Choisir une autre pub mesurée par tes tests';
}


export interface RefusStudiosSpatial { titre: string; texte: string; lien: { href: string; libelle: string } | null }

/**
 * Ce que dit un écran Studios refusé · capacité coupée, offre, rôle ou panne.
 * Mêmes cas et mêmes mots que la liste V5 (`/studio/projets`) · rien n'a été
 * écrit ni débité, l'identifiant support accompagne une panne.
 */
export function refusStudiosSpatial(e: { capacites: readonly CapaciteStudio[]; code: string; plan: boolean; message?: string; traceId?: string }): RefusStudiosSpatial {
  if (e.capacites.length) {
    return {
      titre: 'Non activé pour cet espace',
      texte: `${e.capacites.map((c) => DEFINITIONS_CAPACITES[c].libelle).join(' · ')} · coupé pour ton espace pendant sa recette. Rien n’a été écrit ni débité.`,
      lien: { href: '/dashboard', libelle: 'Accueil' },
    };
  }
  if (e.code === 'FORBIDDEN' || e.code === 'AUTH_REQUIRED') {
    return e.plan
      ? { titre: 'Inclus dès l’abonnement Core', texte: 'Les projets du Studio sont disponibles à partir du plan Core.', lien: { href: '/billing', libelle: 'Voir les forfaits' } }
      : { titre: 'Accès réservé', texte: 'Ton rôle ne permet pas d’ouvrir les projets du Studio · demande un rôle Membre à un administrateur de l’espace.', lien: null };
  }
  return { titre: 'Lecture impossible', texte: `${e.message ?? 'Les projets n’ont pas pu être lus.'}${e.traceId ? ` · identifiant support : ${e.traceId}` : ''}`, lien: null };
}

/** La note du pied d'une carte d'itération · aucun devis n'existe avant la génération, on dit quand il vient. */
export const NOTE_ITERATION_SPATIALE = {
  iterer: 'Gratuit ici · le devis vient dans le projet, avant tout lancement',
  role: 'Ton rôle ne permet pas de créer le projet de cette itération.',
} as const;
