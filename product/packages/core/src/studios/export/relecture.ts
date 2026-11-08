/**
 * Studios · lot 8 V5 · le contrôle HUMAIN avant export (fiche V5 `#review`,
 * PC F6, F7, D12).
 *
 * Pur. Le préflight (`preflight.ts`) dit si le fichier PEUT être fabriqué
 * (polices, médias, dimensions) · il ne dit rien de ce qu'une personne doit
 * voir : le produit fidèle, les textes justes, aucune promesse intenable, la
 * marque respectée, le format adapté. Ce module ajoute ce point de contrôle
 * SANS remplacer le préflight :
 *
 *  · cinq points à cocher, tous obligatoires (`POINTS_RELECTURE_EXPORT`) ;
 *  · la relecture vaut pour UNE version (les versions sont immuables · une
 *    nouvelle version demande une nouvelle relecture) ;
 *  · qui et quand · l'événement d'audit `project.export.review` (acteur,
 *    date, version, points) · le journal existant, ajout seul, aucune migration ;
 *  · l'export n'est ouvert que si le préflight passe ET que la version est
 *    relue (`etatExportHumain`) · le serveur refait les deux contrôles au clic.
 */

export const ACTION_AUDIT_RELECTURE_EXPORT = 'project.export.review';

export type CleRelectureExport = 'produit' | 'textes' | 'promesses' | 'marque' | 'diffusion';

export interface PointRelectureExport { cle: CleRelectureExport; libelle: string }

/** Les cinq cases, dans l'ordre de lecture d'une créa (le sujet, ses mots, ses promesses, sa marque, sa place). */
export const POINTS_RELECTURE_EXPORT: readonly PointRelectureExport[] = [
  { cle: 'produit', libelle: 'Le produit est fidèle · forme, couleur, étiquette lisible' },
  { cle: 'textes', libelle: 'Chaque texte est relu · orthographe, accents, chiffres et prix' },
  { cle: 'promesses', libelle: 'Aucune promesse que la marque ne peut prouver (santé, résultat, avant / après)' },
  { cle: 'marque', libelle: 'Logo, couleurs et ton sont ceux de la marque' },
  { cle: 'diffusion', libelle: 'Le format et les marges conviennent à l’emplacement prévu' },
];

const CLES = POINTS_RELECTURE_EXPORT.map((p) => p.cle);

/**
 * Les points envoyés par le client · une action serveur est appelable
 * directement, rien n'est cru sur parole : une liste de chaînes, chaque point
 * connu, TOUS présents. Sinon la liste de ce qui manque.
 */
export function pointsRelectureValides(x: unknown): { ok: true; points: CleRelectureExport[] } | { ok: false; manquants: CleRelectureExport[]; raison: string } {
  const recus = Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string') : [];
  const inconnus = recus.filter((v) => !(CLES as readonly string[]).includes(v));
  const manquants = CLES.filter((c) => !recus.includes(c));
  if (!Array.isArray(x) || inconnus.length || manquants.length) {
    return {
      ok: false, manquants,
      raison: manquants.length
        ? `${manquants.length} point${manquants.length > 1 ? 's' : ''} de relecture non coché${manquants.length > 1 ? 's' : ''} · coche les cinq avant de valider.`
        : 'Point de relecture inconnu · recharge la page puis recommence.',
    };
  }
  return { ok: true, points: [...CLES] };
}

/** Ce que l'audit garde d'une relecture · la version relue et les points validés. */
export interface TraceRelectureExport { projectId: string; versionId: string; versionN: number; points: CleRelectureExport[] }

/** Lecture défensive d'un `details` d'audit · `null` si ce n'est pas une relecture COMPLÈTE de cette forme. */
export function lireTraceRelecture(x: unknown): TraceRelectureExport | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null;
  const d = x as Record<string, unknown>;
  if (typeof d.projectId !== 'string' || typeof d.versionId !== 'string') return null;
  if (typeof d.versionN !== 'number' || !Number.isInteger(d.versionN) || d.versionN < 1) return null;
  const p = pointsRelectureValides(d.points);
  if (!p.ok) return null;
  return { projectId: d.projectId, versionId: d.versionId, versionN: d.versionN, points: p.points };
}

/** Une relecture enregistrée, telle que l'écran la dit · `par` est le nom (ou l'adresse) de la personne. */
export interface RelectureExport { par: string; le: string; versionN: number }

/** « Relue par Kevin le 08/11/2026 à 14:32 · version 2 » · heure de Paris, comme l'historique des exports. */
export function phraseRelectureExport(r: RelectureExport): string {
  const d = new Date(r.le);
  const quand = Number.isNaN(d.getTime()) ? '' : ` le ${new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(d)} à ${new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(d)}`;
  return `Relue par ${r.par.trim() || 'un membre de l’espace'}${quand} · version ${r.versionN}`;
}

export const MESSAGE_RELECTURE_REQUISE = 'Export refusé · la relecture humaine de cette version n’est pas validée. Coche les cinq points du contrôle humain, valide-les, puis exporte. Aucun fichier n’a été produit.';

/**
 * L'export s'ouvre-t-il ? Le préflight d'abord (rien ne se fabrique sans lui),
 * puis la relecture humaine de CETTE version. Fermé · la raison, en toutes
 * lettres, à écrire à côté des boutons.
 */
export function etatExportHumain(e: { peutExporter: boolean; preflightOk: boolean; relue: boolean }): { ouvert: boolean; raison: string | null } {
  if (!e.peutExporter) return { ouvert: false, raison: 'Ton rôle permet de consulter ce contrôle, pas d’exporter · demande un rôle Membre.' };
  if (!e.preflightOk && !e.relue) return { ouvert: false, raison: 'Les deux formats s’ouvrent quand le contrôle avant export ne signale plus aucun point ET que la relecture humaine est validée.' };
  if (!e.preflightOk) return { ouvert: false, raison: 'Les deux formats s’ouvrent dès que le contrôle avant export ne signale plus aucun point.' };
  if (!e.relue) return { ouvert: false, raison: 'Les deux formats s’ouvrent dès que la relecture humaine de cette version est validée (cinq points ci-dessus).' };
  return { ouvert: true, raison: null };
}

/** Le bouton « Valider la relecture » · ouvert quand les cinq cases sont cochées, sinon combien il en reste. */
export function etatValidationRelecture(coches: readonly string[]): { ouvert: boolean; raison: string | null } {
  const reste = CLES.filter((c) => !coches.includes(c)).length;
  return reste === 0 ? { ouvert: true, raison: null } : { ouvert: false, raison: `Encore ${reste} point${reste > 1 ? 's' : ''} à cocher · la validation s’ouvre quand les cinq sont relus.` };
}
