import { resumeMarcheEnTete, type Contrast, type MarketRow } from '../../adsmap/market-stats';
import { LIBELLE_CANAL, LIBELLE_QUALIFICATION } from '../../adsmap/source-pertinence';

/**
 * Spatial · « Mémoire marché de Jarvis » sur Pubs du moment (vague 3) · RÈGLES
 * PURES. Ce que l'ancien panneau marché montrait, mis en forme · la
 * confrontation d'abord (elle fait décider), puis les parts d'USAGE (jamais
 * des taux de réussite), deux axes distincts (canal · qualification).
 */

const TITRE_CONTRASTE: Record<Contrast['kind'], { titre: string; ton: 'r' | 'w' | 'g' }> = {
  contredit: { titre: 'Le marché dit l’inverse de tes chiffres', ton: 'r' },
  inexploite: { titre: 'Pratique majoritaire jamais testée chez toi', ton: 'w' },
  confirme: { titre: 'Le marché confirme tes chiffres', ton: 'g' },
};
const DIMENSION_MARCHE: Record<string, string> = {
  hook_type: 'Accroches', opening_type: 'Ouvertures', talent: 'Présence à l’écran', length_bucket: 'Durées', format: 'Formats',
};

export interface VueMarche { rows: MarketRow[]; contrasts: Contrast[]; sampleSize: number; provenSize: number; advertisers: number; summary: string }

export function lectureMarche(v: VueMarche) {
  const groupes = new Map<string, MarketRow[]>();
  for (const r of v.rows) groupes.set(r.dimension, [...(groupes.get(r.dimension) ?? []), r]);
  return {
    compte: v.sampleSize > 0
      ? `${v.sampleSize} créa(s) décrites · ${v.provenSize} qui tiennent · ${v.advertisers} annonceur(s).`
      : 'Aucune créa concurrente décrite pour l’instant · suis des marques dans la Veille, puis lance « Apprendre » pour nourrir cette lecture.',
    resume: resumeMarcheEnTete(v.summary, v.contrasts),
    contrastes: v.contrasts.slice(0, 6).map((c) => ({ cle: `${c.dimension}:${c.key}`, ...TITRE_CONTRASTE[c.kind], phrase: c.statement, sources: `${c.sources} source${c.sources > 1 ? 's' : ''}` })),
    groupes: [...groupes.entries()].map(([dim, rows]) => ({
      dimension: dim, libelle: DIMENSION_MARCHE[dim] ?? dim,
      lignes: rows.slice(0, 5).map((r) => ({
        cle: r.key, part: Math.round(r.shareOfProven * 100), partTexte: `${Math.round(r.shareOfProven * 100)} %`,
        canal: LIBELLE_CANAL[r.canal].court, qualification: LIBELLE_QUALIFICATION[r.qualification].court,
        detail: `${r.nProven} créas · ${r.advertisers} ann.`,
      })),
    })),
    aDesDonnees: v.contrasts.length > 0 || v.rows.length > 0,
  };
}
