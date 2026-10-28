import type { RadarResult } from '../../radar';
import { lienNouveauProjet } from '../../studios/anciennes-adresses';

/**
 * Spatial · le « Radar créatif » de l'ancien écran (vague 3) · RÈGLES PURES.
 * Chaque créa Meta synchronisée est notée Hook / Hold / CTR / Conv (A→D, en
 * percentiles du compte), rangée dans une recommandation, avec un lien vers un
 * projet Studios. Seules les créas RÉELLES (`brands.ads_insights`) sont notées
 * · jamais d'exemple de démonstration.
 */

type Note = RadarResult['grades']['hook'];
const CLASSE_NOTE: Record<Note, 'g' | 'c' | 'w' | 'r'> = { A: 'g', B: 'c', C: 'w', D: 'r' };
const RECO: Record<RadarResult['bucket'], { libelle: string; classe: '' | 'g' | 'c' | 'w' | 'r'; geste: string }> = {
  winner: { libelle: 'Scaler', classe: 'g', geste: 'Décliner les gagnantes' },
  high_potential: { libelle: 'Pousser', classe: 'c', geste: 'Pousser dans un projet' },
  iteration: { libelle: 'Itérer', classe: 'w', geste: 'Itérer dans un projet' },
  fatigued: { libelle: 'Rafraîchir', classe: 'w', geste: 'Rafraîchir dans un projet' },
  kill_candidate: { libelle: 'Couper', classe: 'r', geste: 'Remplacer dans un projet' },
  insufficient: { libelle: 'Observer', classe: '', geste: 'Préparer un projet' },
};

export interface CreaNotee {
  title: string; platform: string; fingerprint: string; spend: number; impressions: number; daysActive?: number;
  grades: RadarResult['grades']; globalScore: number; bucket: RadarResult['bucket']; diagnosis: string[];
}

export function ligneRadarCreatif(r: CreaNotee) {
  const reco = RECO[r.bucket] ?? RECO.insufficient;
  return {
    cle: r.fingerprint, titre: r.title, plateforme: r.platform === 'tiktok' ? 'TikTok' : 'Meta',
    detail: `${Math.round(r.spend).toLocaleString('fr-FR')} € dépensés · ${r.impressions.toLocaleString('fr-FR')} impr. · ${r.daysActive != null ? `${r.daysActive} j` : 'âge inconnu'}`,
    notes: (['hook', 'hold', 'ctr', 'conv'] as const).map((k) => ({ cle: k, libelle: { hook: 'Hook', hold: 'Hold', ctr: 'CTR', conv: 'Conv' }[k], note: r.grades[k], classe: CLASSE_NOTE[r.grades[k]] })),
    score: r.globalScore.toFixed(2).replace('.', ','),
    reco: { libelle: reco.libelle, classe: reco.classe },
    diagnostic: r.diagnosis,
    projet: { href: lienNouveauProjet({ type: 'ads', angle: r.title }), libelle: reco.geste },
  };
}

/** Le résumé par recommandation · seulement celles qui ont au moins une créa. */
export function resumeRadarCreatif(rows: ReadonlyArray<Pick<CreaNotee, 'bucket'>>): Array<{ libelle: string; classe: string; n: number }> {
  return (Object.keys(RECO) as Array<RadarResult['bucket']>).map((b) => ({ libelle: RECO[b].libelle, classe: RECO[b].classe, n: rows.filter((r) => r.bucket === b).length })).filter((x) => x.n > 0);
}
