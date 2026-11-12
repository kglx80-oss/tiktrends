import type { BilanProvenances as Bilan, LectureProvenance } from '@tiktrends/core';
import { Ic } from '../../communs';

/**
 * Boucler la preuve · « D'où viennent les hypothèses qui gagnent » (page
 * Hypothèses) · chaque provenance (tag de Veille, pub de la Veille,
 * apprentissage, persona, offre, à la main, Jarvis, commentaire, itération) contre le RESTE de la marque,
 * effectif minimum, intervalles disjoints au niveau mesuré (`bilanProvenances`,
 * noyau). Le silence s'affiche comme une conclusion. PRÉSENTATIONNEL · tout est
 * calculé par la page. Absent des props d'`Hypotheses`, rien n'est ajouté à la
 * maquette.
 */

export type PropsBilanProvenances = Bilan & {
  /** Les provenances lues, dans l'ordre du noyau · dites même quand aucune n'a de verdict. */
  provenances: readonly string[];
  noteJarvis: string;
  /** Ce qui range une hypothèse dans « Offre » · dit sous le bilan. */
  noteOffre?: string;
  /** Ce qui range une itération dans « Commentaire » · dit sous le bilan. */
  noteCommentaire?: string;
  /** Lot 11 · ce qui compte dans « Note de la lignée ». */
  noteNote?: string;
};

const TON: Record<LectureProvenance, { pill: string; libelle: string }> = {
  au_dessus: { pill: 'g', libelle: 'Gagne plus souvent' },
  en_dessous: { pill: 'r', libelle: 'Gagne moins souvent' },
  dans_le_bruit: { pill: '', libelle: 'Dans le bruit' },
  effectif: { pill: '', libelle: 'Pas assez de verdicts' },
  reference: { pill: '', libelle: 'Référence trop mince' },
  trop_de_personas: { pill: '', libelle: 'Non mesuré' },
  non_mesure: { pill: '', libelle: 'Non mesuré' },
};

const pc = (k: number, n: number) => (n ? `${Math.round((k / n) * 100)} %` : '–');

export function BilanProvenances({ p }: { p: PropsBilanProvenances }) {
  return (
    <section className="tile sec" aria-label="D’où viennent les hypothèses qui gagnent" data-bilan-provenances={p.parle ? 'parle' : 'silence'} style={{ marginTop: 16 }}>
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic n="chart" />D’où viennent les hypothèses qui gagnent</h2>
      <p className="muted" style={{ fontSize: '12.5px' }} data-taux-general="">
        Taux général · {p.general.k} gagnante{p.general.k > 1 ? 's' : ''} sur {p.general.n} variante{p.general.n > 1 ? 's' : ''} tranchée{p.general.n > 1 ? 's' : ''} au protocole ({pc(p.general.k, p.general.n)}) · provenances lues · {p.provenances.join(', ')}.
      </p>
      {p.groupes.map((g) => (
        <div key={g.cle} data-groupe-provenance={g.cle} data-lecture={g.lecture} style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap', marginTop: 10 }}>
          <strong style={{ fontSize: 13 }}>{g.libelle}</strong>
          <span className={`pill ${TON[g.lecture].pill}`.trim()}>{TON[g.lecture].libelle}</span>
          <span className="muted" style={{ fontSize: '12.5px', flex: '1 1 260px' }}>{g.phrase}</span>
        </div>
      ))}
      <p data-phrase-provenances="" style={{ fontSize: 13, marginTop: 12 }}>{p.phrase}</p>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>{p.regle}</p>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 4 }}>{p.noteJarvis}</p>
      {p.noteOffre && <p className="faint" data-note-offre="" style={{ fontSize: '11.5px', marginTop: 4 }}>{p.noteOffre}</p>}
      {p.noteCommentaire && <p className="faint" data-note-commentaire="" style={{ fontSize: '11.5px', marginTop: 4 }}>{p.noteCommentaire}</p>}
      {p.noteNote && <p className="faint" data-note-note="" style={{ fontSize: '11.5px', marginTop: 4 }}>{p.noteNote}</p>}
    </section>
  );
}
