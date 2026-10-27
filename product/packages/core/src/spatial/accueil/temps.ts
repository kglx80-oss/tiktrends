/**
 * Spatial · Accueil · le temps lu par l'écran (dates courtes, « il y a … »).
 * Pur · l'horloge est TOUJOURS passée par l'appelant.
 */

export const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;

const JOUR = 86_400_000;

/** `YYYY-MM-DD` valide · sinon `null`. */
export function jourIso(v: unknown): string | null {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const t = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === v ? v : null;
}

/** `YYYY-MM-DD` décalé de `n` jours (UTC, sans fuseau · une date de calendrier). */
export function decalerJour(jour: string, n: number): string {
  return new Date(Date.parse(`${jour}T00:00:00Z`) + n * JOUR).toISOString().slice(0, 10);
}

/** Nombre de jours de `a` à `b` inclus (`a` ≤ `b`). */
export function joursEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / JOUR) + 1;
}

/** « 8 oct. » · une date de calendrier, telle que la maquette l'écrit. */
export function jourCourt(jour: string): string {
  const d = new Date(`${jour}T00:00:00Z`);
  return `${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}

/** Le jour de calendrier à Paris · `YYYY-MM-DD`. */
export function jourParis(maintenant: Date, fuseau = 'Europe/Paris'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: fuseau, year: 'numeric', month: '2-digit', day: '2-digit' }).format(maintenant);
  return p;
}

/**
 * « il y a 12 min », « il y a 2 h », « hier », « il y a 4 j » · comme la
 * maquette. Une date future ou illisible rend `null` (on ne date pas ce qu'on
 * ne sait pas dater).
 */
export function depuisRelatif(quand: Date | string | null | undefined, maintenant: Date): string | null {
  if (quand == null) return null;
  const t = typeof quand === 'string' ? Date.parse(quand) : quand.getTime();
  if (!Number.isFinite(t)) return null;
  const ecart = maintenant.getTime() - t;
  if (ecart < -60_000) return null;
  const min = Math.floor(Math.max(0, ecart) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(h / 24);
  if (j === 1) return 'hier';
  if (j < 30) return `il y a ${j} j`;
  const d = new Date(t);
  return `le ${d.getUTCDate()} ${MOIS_COURTS[d.getUTCMonth()]}`;
}
