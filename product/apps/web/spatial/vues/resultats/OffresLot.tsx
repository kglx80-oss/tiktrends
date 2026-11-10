import { NOTE_GESTES_OFFRE_SILENCE, type GestesLecture, type LecturePersona } from '@tiktrends/core';
import { Ic } from '../../communs';
import { GestesGroupe } from './gestes-persona-client';

/**
 * Lot 9 bis V5 · « Quelle offre » dans la fiche d'un lot (VB M07) · l'offre de
 * chaque variante (celle que le test diffuse ou celle du brief du projet, dite
 * telle quelle, jamais fusionnées) et ce que les verdicts de la MARQUE disent
 * de ces offres (`lectureOffres` · LA règle de la lecture par persona · effectif
 * minimum, niveau corrigé pour le nombre d'offres, intervalle qui doit exclure
 * le reste de la marque). Le silence s'affiche comme une conclusion.
 * PRÉSENTATIONNEL · tout est calculé par la page. Composant voisin de
 * `Lot.tsx` (comme `PersonasLot`) · absent des props du lot, rien n'est ajouté.
 *
 * Quand une offre du lot SE DÉTACHE · « Itérer sur cette offre » et « Créer une
 * hypothèse » (`gestesLectureGroupe`, la règle et la brique des personas,
 * `GestesGroupe`) · rien n'est écrit sans le clic · aucune offre détachée,
 * aucun geste, et c'est dit.
 */

export interface PropsOffresLot {
  variantes: ReadonlyArray<{ id: string; variante: string; libelle: string; desaccord: boolean; offreId: string | null }>;
  /** Les offres de CE lot, lues sur toute la marque · actives d'abord · `gestes` seulement pour une offre qui se détache. */
  groupes: ReadonlyArray<{ id: string; nom: string; lecture: LecturePersona; phrase: string; gestes?: GestesLecture | null }>;
  parle: boolean;
  phrase: string;
  regle: string;
  /** Vrai quand la page a calculé les gestes · le silence (aucune offre du lot ne se détache) se dit alors. */
  gestesLus?: boolean;
  /** « Créer une hypothèse » fermé (rôle) · la raison écrite à côté. */
  raisonHypothese?: string | null;
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
          {g.gestes && <GestesGroupe g={g.gestes} raisonHypothese={p.raisonHypothese ?? null} />}
        </div>
      ))}
      {p.gestesLus && !p.groupes.some((g) => g.gestes) && <p className="faint" data-gestes-offre-silence="" style={{ fontSize: '12.5px', marginTop: 10 }}>{NOTE_GESTES_OFFRE_SILENCE}</p>}
      <p data-phrase-offres="" style={{ fontSize: 13, marginTop: 12 }}>Sur toute la marque · {p.phrase}</p>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.regle}</p>
    </section>
  );
}
