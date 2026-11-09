import type { LecturePersona } from '@tiktrends/core';
import { Ic } from '../../communs';

/**
 * Lot 9 bis V5 · « Quelle offre » dans la fiche d'un lot (VB M07) · l'offre de
 * chaque variante (celle que le test diffuse ou celle du brief du projet, dite
 * telle quelle, jamais fusionnées) et ce que les verdicts de la MARQUE disent
 * de ces offres (`lectureOffres` · LA règle de la lecture par persona · effectif
 * minimum, niveau corrigé pour le nombre d'offres, intervalle qui doit exclure
 * le reste de la marque). Le silence s'affiche comme une conclusion.
 * PRÉSENTATIONNEL · tout est calculé par la page. Composant voisin de
 * `Lot.tsx` (comme `PersonasLot`) · absent des props du lot, rien n'est ajouté.
 */

export interface PropsOffresLot {
  variantes: ReadonlyArray<{ id: string; variante: string; libelle: string; desaccord: boolean; offreId: string | null }>;
  /** Les offres de CE lot, lues sur toute la marque · actives d'abord. */
  groupes: ReadonlyArray<{ id: string; nom: string; lecture: LecturePersona; phrase: string }>;
  parle: boolean;
  phrase: string;
  regle: string;
}

const TON: Record<LecturePersona, { pill: string; libelle: string }> = {
  au_dessus: { pill: 'g', libelle: 'Au-dessus de la marque' },
  en_dessous: { pill: 'r', libelle: 'En dessous de la marque' },
  dans_le_bruit: { pill: '', libelle: 'Dans le bruit' },
  effectif: { pill: '', libelle: 'Pas assez de verdicts' },
  reference: { pill: '', libelle: 'Référence trop mince' },
  trop_de_personas: { pill: '', libelle: 'Non mesuré' },
};

export function OffresLot({ p }: { p: PropsOffresLot }) {
  return (
    <section className="tile sec" aria-label="Quelle offre · les offres du lot" data-lecture-offres={p.parle ? 'parle' : 'silence'}>
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic n="tag" />Quelle offre · ce que les tests disent par offre</h2>
      <div className="tl">
        {p.variantes.map((v) => (
          <div className="ev" key={v.id} data-offre-variante={v.variante} data-offre-id={v.offreId ?? ''}>
            <span className="ico"><Ic n={v.desaccord ? 'warn' : 'tag'} /></span>
            <span><strong>{v.variante}</strong><br /><span className="faint" style={{ fontSize: '11.5px' }}>{v.libelle}</span></span>
          </div>
        ))}
      </div>
      {p.groupes.map((g) => (
        <div key={g.id} data-groupe-offre={g.id} data-lecture={g.lecture} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 10 }}>
          <strong style={{ fontSize: 13 }}>{g.nom}</strong>
          <span className={`pill ${TON[g.lecture].pill}`.trim()}>{TON[g.lecture].libelle}</span>
          <span className="muted" style={{ fontSize: '12.5px', flex: '1 1 260px' }}>{g.phrase}</span>
        </div>
      ))}
      <p data-phrase-offres="" style={{ fontSize: 13, marginTop: 12 }}>Sur toute la marque · {p.phrase}</p>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.regle}</p>
    </section>
  );
}
