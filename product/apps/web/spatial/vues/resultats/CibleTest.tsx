import type { CibleTest as Cible, CoteCibleTest, LecturePersona } from '@tiktrends/core';
import { Ic } from '../../communs';
import { GestesGroupe } from './gestes-persona-client';

/**
 * « Pour qui · quelle offre » sur la fiche d'un test (`/adsmap/tests/[id]`) ·
 * le persona et l'offre de CE test (carte, annonce et brief LUS, jamais
 * recopiés · « à trancher » en désaccord), la lecture de ce persona et de
 * cette offre sur toute la marque (seuils du module des personas · le silence
 * s'affiche) et, SEULEMENT quand l'un se détache, « Itérer » et « Créer une
 * hypothèse » (`GestesGroupe`, la brique de la fiche d'un lot). PRÉSENTATIONNEL ·
 * tout est calculé par la page (`cibleDuTest`, noyau). La fiche d'un test n'a
 * pas d'écran dans la maquette · section ajoutée sous « Hypothèse et
 * apprentissages », absente des props, rien n'est ajouté.
 */

export type PropsCibleTest = Cible & { raisonHypothese: string | null };

const TON: Record<LecturePersona | 'aucun', { pill: string; libelle: string }> = {
  au_dessus: { pill: 'g', libelle: 'Au-dessus de la marque' },
  en_dessous: { pill: 'r', libelle: 'En dessous de la marque' },
  dans_le_bruit: { pill: '', libelle: 'Dans le bruit' },
  effectif: { pill: '', libelle: 'Pas assez de verdicts' },
  reference: { pill: '', libelle: 'Référence trop mince' },
  trop_de_personas: { pill: '', libelle: 'Non mesuré' },
  aucun: { pill: '', libelle: 'Rien à lire' },
};

function Cote({ c, titre, raisonHypothese }: { c: CoteCibleTest; titre: string; raisonHypothese: string | null }) {
  return (
    <div data-cible-test={c.groupe} data-cible-id={c.id ?? ''} data-a-trancher={c.desaccord ? '' : undefined} style={{ display: 'grid', gap: 6, marginTop: 10 }}>
      <div className="lbl" style={{ margin: 0 }}>{titre}</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }} data-cible-libelle="">
          <Ic n={c.desaccord ? 'warn' : c.groupe === 'persona' ? 'users' : 'tag'} />{c.libelle}
        </span>
        {c.desaccord && <span className="pill w">À trancher</span>}
        {c.lecture && <span className={`pill ${TON[c.lecture].pill}`.trim()} data-cible-lecture={c.lecture}>{TON[c.lecture].libelle}</span>}
      </div>
      <span className="muted" data-cible-phrase="" style={{ fontSize: '12.5px' }}>{c.phrase}</span>
      {c.gestes
        ? <GestesGroupe g={c.gestes} raisonHypothese={raisonHypothese} />
        : c.silence && <small className="faint" data-cible-silence={c.groupe} style={{ fontSize: '11.5px' }}>{c.silence}</small>}
      {c.id && <small className="faint" style={{ fontSize: 11 }}>{c.regle}</small>}
    </div>
  );
}

export function CibleTest({ p }: { p: PropsCibleTest }) {
  return (
    <section className="tile sec" aria-label="Pour qui · quelle offre · ce test">
      <h2 style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Ic n="users" />Pour qui · quelle offre</h2>
      <Cote c={p.persona} titre="Persona" raisonHypothese={p.raisonHypothese} />
      <Cote c={p.offre} titre="Offre" raisonHypothese={p.raisonHypothese} />
    </section>
  );
}
