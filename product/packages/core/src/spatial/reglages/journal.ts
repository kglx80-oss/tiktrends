import { familleMouvement, libelleMotif, repartitionConsommation } from '../../compte-vue';

/**
 * Spatial · Crédits & factures · le journal des mouvements de crédits (repris de
 * l'écran V5 `/usage`) · motifs lisibles, famille, signe, et la répartition de
 * la consommation sur la fenêtre. Pur · les lignes arrivent triées de la plus
 * récente à la plus ancienne, bornées à `limite`.
 */
export interface LigneJournalCredits { id: string; libelle: string; famille: string; quand: string; delta: string; positif: boolean }

export interface JournalCredits {
  /** « 30 derniers jours », ou la limite lue quand elle ne couvre pas toute la fenêtre. */
  fenetre: string;
  familles: Array<{ libelle: string; total: number; part: number }>;
  lignes: LigneJournalCredits[];
  /** La limite de lignes est atteinte · l'écran dit que seules les plus récentes sont listées. */
  limiteAtteinte: boolean;
}

const nombre = (n: number) => n.toLocaleString('fr-FR');

export function journalCredits(
  lignes: ReadonlyArray<{ id: string; delta: number; reason: string; createdAt: Date }>,
  p: { depuis: Date; limite: number; jours: number; fuseau: string },
): JournalCredits {
  const r = repartitionConsommation(lignes.map((l) => ({ delta: l.delta, reason: l.reason, createdAt: l.createdAt })), p.depuis, p.limite);
  const max = r.familles[0]?.total || 1;
  return {
    fenetre: r.tronquee ? `${p.limite} derniers mouvements (une partie des ${p.jours} jours)` : `${p.jours} derniers jours`,
    familles: r.familles.map((f) => ({ libelle: f.label, total: f.total, part: Math.round((f.total / max) * 100) })),
    lignes: lignes.map((l) => ({
      id: l.id,
      libelle: libelleMotif(l.reason),
      famille: familleMouvement(l.reason).label,
      quand: l.createdAt.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: p.fuseau }),
      delta: `${l.delta > 0 ? '+' : ''}${nombre(l.delta)}`,
      positif: l.delta > 0,
    })),
    limiteAtteinte: lignes.length >= p.limite,
  };
}
