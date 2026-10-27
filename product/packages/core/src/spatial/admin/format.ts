/**
 * Tour de contrôle (Spatial, rubrique Admin) · les formats d'affichage. Pur.
 *
 * Une seule façon d'écrire un montant, une part, une durée ou une date dans
 * les douze écrans admin · comme la maquette (`toLocaleString("fr-FR")`).
 * Une valeur absente s'écrit `VALEUR_ABSENTE` (« n.c. »), jamais un zéro
 * inventé ni un tiret cadratin.
 */
import { VALEUR_ABSENTE } from '../../ponctuation-ecran';

const JOUR = 86_400_000;

/** « 48 255 € » · deux décimales sous 1 000 € quand le montant n'est pas rond (« 122,16 € »). */
export function adminEuros(n: number | null | undefined, decimales?: number): string {
  if (n == null || !Number.isFinite(n)) return VALEUR_ABSENTE;
  const d = decimales ?? (Math.abs(n) < 1000 && !Number.isInteger(n) ? 2 : 0);
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} €`;
}

/** « 12,34 $ » · la dépense fournisseur est relevée en dollars (barrière de dépense). */
export function adminDollars(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return VALEUR_ABSENTE;
  const d = Math.abs(n) > 0 && Math.abs(n) < 1 ? 3 : 2;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d })} $`;
}

/** « 3,1 % » · une part donnée en POURCENTS (3.1 → « 3,1 % »). */
export function adminPourcent(n: number | null | undefined, decimales = 1): string {
  if (n == null || !Number.isFinite(n)) return VALEUR_ABSENTE;
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} %`;
}

export const adminNombre = (n: number) => n.toLocaleString('fr-FR');

/** Un nom et son accord (« 1 compte », « 3 comptes »). */
export function adminPluriel(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${adminNombre(n)} ${n > 1 ? pluriel : singulier}`;
}

/** Une durée en minutes · « 38 min », « 5 h 12 », « 2 j 4 h ». */
export function adminDuree(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return VALEUR_ABSENTE;
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  if (m < 24 * 60) { const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${String(r).padStart(2, '0')}` : `${h} h`; }
  const j = Math.floor(m / (24 * 60)), h = Math.floor((m % (24 * 60)) / 60);
  return h ? `${j} j ${h} h` : `${j} j`;
}

/** « à l’instant », « il y a 4 min », « il y a 3 h », « hier », « il y a 6 j », puis la date. */
export function adminIlYa(d: Date | string | null | undefined, maintenant: Date): string {
  if (!d) return VALEUR_ABSENTE;
  const ms = maintenant.getTime() - new Date(d).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.floor(ms / JOUR);
  if (j === 1) return 'hier';
  if (j < 30) return `il y a ${j} j`;
  return `le ${adminDateCourte(d)}`;
}

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'] as const;
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'] as const;

/** « nov. » · le mois court de la maquette. */
export const adminMoisCourt = (d: Date) => MOIS[d.getMonth()]!;
/** « octobre » */
export const adminMoisLong = (d: Date) => MOIS_LONGS[d.getMonth()]!;

/** « 12 sept. » */
export function adminDateCourte(d: Date | string): string {
  const x = new Date(d);
  return `${x.getDate()} ${MOIS[x.getMonth()]}`;
}

/**
 * Les `n` derniers mois calendaires, le plus ancien d'abord, le dernier = le
 * mois en cours · `debut` inclus, `fin` exclue.
 */
export function adminMois(maintenant: Date, n = 12): Array<{ debut: Date; fin: Date; libelle: string; enCours: boolean }> {
  const out: Array<{ debut: Date; fin: Date; libelle: string; enCours: boolean }> = [];
  for (let i = n - 1; i >= 0; i--) {
    const debut = new Date(maintenant.getFullYear(), maintenant.getMonth() - i, 1);
    const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() - i + 1, 1);
    out.push({ debut, fin, libelle: adminMoisCourt(debut), enCours: i === 0 });
  }
  return out;
}

/** Une variation en pourcents · « ▲ +14 % » (hausse) / « ▼ −6 % » (baisse) · `null` sans base de comparaison. */
export function adminVariation(pct: number | null, siAbsente: string): { texte: string; classe: '' | 'up' | 'dn' } {
  if (pct == null || !Number.isFinite(pct)) return { texte: siAbsente, classe: '' };
  const r = Math.round(pct);
  return r >= 0 ? { texte: `▲ +${r} %`, classe: 'up' } : { texte: `▼ −${Math.abs(r)} %`, classe: 'dn' };
}

/** « 12 sept. · 09:12 » */
export function adminDateHeure(d: Date | string): string {
  const x = new Date(d);
  return `${adminDateCourte(x)} · ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;
}
