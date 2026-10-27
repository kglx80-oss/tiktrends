/**
 * Consommation de crédits par semaine · les barres de l'écran « Crédits &
 * factures » (maquette Spatial). Pur.
 *
 * Seuls les DÉBITS comptent (delta < 0) · une recharge ou un remboursement
 * n'est pas une consommation. Semaines glissantes de 7 jours, la plus ancienne
 * d'abord, la dernière = la semaine en cours. Hauteur = part du maximum
 * (0 à 100, entier) · aucune semaine pleine n'est inventée quand tout vaut 0.
 */
export interface MouvementCredit {
  delta: number;
  createdAt: Date;
}

export interface SemaineConso {
  debut: Date;
  credits: number;
  /** Hauteur de la barre, 0 à 100. */
  hauteur: number;
  enCours: boolean;
}

const JOUR = 86_400_000;

export function consommationParSemaine(rows: readonly MouvementCredit[], maintenant: Date, semaines = 12): SemaineConso[] {
  const fin = maintenant.getTime();
  const debut0 = fin - semaines * 7 * JOUR;
  const totaux = new Array<number>(semaines).fill(0);
  for (const r of rows) {
    if (r.delta >= 0) continue;
    const t = new Date(r.createdAt).getTime();
    if (t <= debut0 || t > fin) continue;
    const i = Math.min(semaines - 1, Math.floor((t - debut0) / (7 * JOUR)));
    totaux[i]! += -r.delta;
  }
  const max = Math.max(0, ...totaux);
  return totaux.map((credits, i) => ({
    debut: new Date(debut0 + i * 7 * JOUR),
    credits,
    hauteur: max > 0 ? Math.round((credits / max) * 100) : 0,
    enCours: i === semaines - 1,
  }));
}

/** Part du solde sur la dotation, bornée 0 à 100 · l'anneau de crédits. */
export function partSolde(solde: number, dotation: number): number {
  if (!(dotation > 0)) return solde > 0 ? 100 : 0;
  return Math.max(0, Math.min(100, Math.round((solde / dotation) * 100)));
}

/** Crédits consommés (débits seulement) sur les `jours` derniers jours. */
export function consommationSur(rows: readonly MouvementCredit[], maintenant: Date, jours: number): number {
  const depuis = maintenant.getTime() - jours * JOUR;
  let total = 0;
  for (const r of rows) {
    const t = new Date(r.createdAt).getTime();
    if (r.delta < 0 && t > depuis && t <= maintenant.getTime()) total += -r.delta;
  }
  return total;
}
