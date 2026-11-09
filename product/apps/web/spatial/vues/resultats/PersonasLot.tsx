import { NOTE_GESTES_SILENCE, type GestesPersona as Gestes, type LecturePersona } from '@tiktrends/core';
import { Ic } from '../../communs';
import { GestesPersona } from './gestes-persona-client';

/**
 * Lot 9 V5 · « Pour qui » dans la fiche d'un lot (VB P06) · le persona de
 * chaque variante (carte Adsmap ou brief du projet, dit tel quel, jamais
 * fusionné) et ce que les verdicts de la MARQUE disent de ces personas
 * (`lecturePersonas` · effectif minimum, intervalle qui doit exclure le reste
 * de la marque). Le silence s'affiche comme une conclusion. PRÉSENTATIONNEL ·
 * tout est calculé par la page. Composant voisin de `Lot.tsx` · absent des
 * props du lot, rien n'est ajouté à la maquette.
 */

export interface PropsPersonasLot {
  variantes: ReadonlyArray<{ id: string; variante: string; libelle: string; desaccord: boolean; personaId: string | null }>;
  /**
   * Les personas de CE lot, lus sur toute la marque · dans l'ordre de la marque ·
   * `gestes` · « Itérer sur ce persona » et « Créer une hypothèse » (VB P06,
   * `gestesPersonaLot`) · seulement pour un persona qui se détache.
   */
  groupes: ReadonlyArray<{ id: string; nom: string; lecture: LecturePersona; phrase: string; gestes?: Gestes | null }>;
  parle: boolean;
  phrase: string;
  regle: string;
  /** Vrai quand la page a calculé les gestes P06 · le silence (aucun persona du lot ne se détache) se dit alors. */
  gestesLus?: boolean;
}

const TON: Record<LecturePersona, { pill: string; libelle: string }> = {
  au_dessus: { pill: 'g', libelle: 'Au-dessus de la marque' },
  en_dessous: { pill: 'r', libelle: 'En dessous de la marque' },
  dans_le_bruit: { pill: '', libelle: 'Dans le bruit' },
  effectif: { pill: '', libelle: 'Pas assez de verdicts' },
  reference: { pill: '', libelle: 'Référence trop mince' },
  trop_de_personas: { pill: '', libelle: 'Non mesuré' },
};

export function PersonasLot({ p }: { p: PropsPersonasLot }) {
  return (
    <section className="tile sec" aria-label="Pour qui · les personas du lot" data-lecture-personas={p.parle ? 'parle' : 'silence'}>
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic n="users" />Pour qui · ce que les tests disent par persona</h2>
      <div className="tl">
        {p.variantes.map((v) => (
          <div className="ev" key={v.id} data-persona-variante={v.variante} data-persona-id={v.personaId ?? ''}>
            <span className="ico"><Ic n={v.desaccord ? 'warn' : 'users'} /></span>
            <span><strong>{v.variante}</strong><br /><span className="faint" style={{ fontSize: '11.5px' }}>{v.libelle}</span></span>
          </div>
        ))}
      </div>
      {p.groupes.map((g) => (
        <div key={g.id} data-groupe-persona={g.id} data-lecture={g.lecture} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 10 }}>
          <strong style={{ fontSize: 13 }}>{g.nom.split(',')[0]!.trim()}</strong>
          <span className={`pill ${TON[g.lecture].pill}`.trim()}>{TON[g.lecture].libelle}</span>
          <span className="muted" style={{ fontSize: '12.5px', flex: '1 1 260px' }}>{g.phrase}</span>
          {g.gestes && <GestesPersona g={g.gestes} />}
        </div>
      ))}
      {p.gestesLus && !p.groupes.some((g) => g.gestes) && <p className="faint" data-gestes-persona-silence="" style={{ fontSize: '12.5px', marginTop: 10 }}>{NOTE_GESTES_SILENCE}</p>}
      <p data-phrase-personas="" style={{ fontSize: 13, marginTop: 12 }}>Sur toute la marque · {p.phrase}</p>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.regle}</p>
    </section>
  );
}
