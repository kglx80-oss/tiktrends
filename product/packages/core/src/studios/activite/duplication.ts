/**
 * Studios · le LIEN DE DUPLICATION entre deux projets (V5 · suite des lots 8,
 * 10 et 11). Pur · ni base, ni réseau.
 *
 * `dupliquerProjet` (lot 8) crée la copie par le chemin de création existant ·
 * l'événement d'audit de cette création (`project.create`, cible la copie)
 * porte désormais `copieDe` · le projet et la version SOURCES, deux
 * identifiants, rien d'autre (`detailsCopieDe`). C'est la seule donnée du lien ·
 * aucune colonne, aucune migration, rien de réécrit.
 *
 *  · le journal du projet SOURCE relit ces événements et dit « Dupliqué en
 *    « … » » avec le lien vers la copie (`FaitDuplication`, `journal.ts`) ;
 *  · la lignée des deux projets les relie (`projeterLignee`, nœuds « Projet
 *    source » et « Copie », catégorie de lien « Copie » déclarée dans la légende) ;
 *  · une duplication PASSÉE (sans `copieDe`) n'est pas réécrite ni devinée ·
 *    seule la copie le dit, par la raison de sa version 1, et le journal de la
 *    copie précise que le projet source ne la mentionne pas (`NOTE_COPIE_SANS_LIEN`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** La clé des détails d'audit qui porte le lien. */
export const CLE_COPIE_DE = 'copieDe';

/** L'action d'audit qui porte le lien · la création de la copie. */
export const ACTION_COPIE_DE = 'project.create';

export interface CopieDe { projectId: string; versionId: string }

/** Les détails à écrire dans l'audit de la création de la copie. */
export function detailsCopieDe(c: CopieDe): Record<string, unknown> {
  return { [CLE_COPIE_DE]: { projectId: c.projectId.toLowerCase(), versionId: c.versionId.toLowerCase() } };
}

/** Le lien relu dans les détails d'un événement · `null` dès qu'un champ manque ou est mal formé · rien n'est deviné. */
export function lireCopieDe(details: unknown): CopieDe | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const c = (details as Record<string, unknown>)[CLE_COPIE_DE];
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.projectId !== 'string' || !UUID.test(o.projectId) || typeof o.versionId !== 'string' || !UUID.test(o.versionId)) return null;
  return { projectId: o.projectId.toLowerCase(), versionId: o.versionId.toLowerCase() };
}

/**
 * Les liens entre projets écrits dans l'audit · chacun est RELU par le projet
 * qu'il désigne (garde de recensement `lot10-journal-recensement`).
 */
export const LIENS_AUDIT_ENTRE_PROJETS: ReadonlyArray<{ cle: string; action: string; lu: string }> = [
  { cle: CLE_COPIE_DE, action: ACTION_COPIE_DE, lu: 'journal du projet source (« Dupliqué en … ») et lignée des deux projets' },
];

/** Ce que le journal de la copie ajoute quand la duplication est antérieure au lien · le projet source ne la dit pas. */
export const NOTE_COPIE_SANS_LIEN = 'copie faite avant que le lien soit enregistré · le projet source ne la mentionne pas';

/** Une duplication vue du projet SOURCE · relue dans l'audit de la création de la copie. */
export interface FaitDuplication {
  source: 'duplication';
  /** L'événement d'audit de la création de la copie. */
  id: string;
  le: string;
  acteur: string | null;
  /** La copie relue dans la portée · `null` quand elle n'est plus lisible (archivée hors portée, inconnue). */
  copie: { id: string; titre: string } | null;
  /** La version source copiée, quand elle est une version de CE projet. */
  versionN: number | null;
}

const court = (t: string, n = 120) => { const x = t.replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };

/** La phrase d'une duplication dans le journal du projet source. */
export function phraseDuplication(f: Pick<FaitDuplication, 'copie' | 'versionN'>): { phrase: string; detail: string | null; lien: { href: string; libelle: string } | null } {
  const depuis = f.versionN !== null ? `Depuis la version ${f.versionN} · la copie reprend la structure, sans générations, exports, tests ni mesures` : null;
  if (!f.copie) return { phrase: 'Projet dupliqué', detail: [depuis, 'la copie n’est pas lisible avec tes droits'].filter(Boolean).join(' · '), lien: null };
  return {
    phrase: `Dupliqué en « ${court(f.copie.titre)} »`,
    detail: depuis,
    lien: { href: `/studio/projets/${encodeURIComponent(f.copie.id)}`, libelle: 'Ouvrir la copie' },
  };
}
