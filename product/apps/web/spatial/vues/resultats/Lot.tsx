import type { ReactNode } from 'react';
import { LIBELLE_NIVEAU, type NiveauPreuve } from '@tiktrends/core';
import { EnTete, Ic, Vue } from '../../communs';
import { Points, Pub } from './communs';

/**
 * Fiche d'un lot (« lot1 ») · `docs/spatial/reference/lot1.html`, balisage à
 * l'identique. Le verdict est celui du MOTEUR, variante par variante (cible CPA
 * de la marque, volume minimum, intervalle) · la fiche ne fabrique aucun écart
 * « B +6 pts » qui n'existe pas en base. Les gestes réels (composer, préparer,
 * lancer, arbitrer) arrivent par `actions`, sous la fiche.
 */

export interface PropsLot {
  sous: string;
  titre: string;
  verdict: { gagnant: boolean; titre: string; phrase: string; niveau: NiveauPreuve };
  variantes: ReadonlyArray<{ id: string; texte: string; image: string | null; tag: string; gagnante: boolean; barre: { libelle: string; part: number } }>;
  controles: ReadonlyArray<{ icone: string; titre: string; detail: string }>;
  coach: { avant: string; fort: string; apres: string };
  /** Les actions réelles permises à la personne sur ce lot · absentes en lecture. */
  actions?: ReactNode;
}

export function Lot(p: PropsLot) {
  return (
    <Vue>
      <EnTete titre={p.titre} sous={p.sous} />
      <section className="tile verdict">
        <div className="ico" style={p.verdict.gagnant
          ? { width: 56, height: 56, borderRadius: 18, background: '#7ef0b01f', color: 'var(--good)' }
          : { width: 56, height: 56, borderRadius: 18, background: '#ffffff12', color: 'var(--fg2)' }}>
          <Ic n={p.verdict.gagnant ? 'check' : 'chart'} s={false} />
        </div>
        <div style={{ display: 'grid', gap: 4 }}>
          <div className="lbl">Verdict du moteur, sur la règle de la marque</div>
          <div className="big num" style={{ fontSize: 47 }}>{p.verdict.titre}</div>
          <p className="muted">{p.verdict.phrase}</p>
        </div>
        <span className={`pill ${p.verdict.niveau === 3 ? 'g' : ''}`} style={{ marginLeft: 'auto' }}><Points n={p.verdict.niveau} /> {LIBELLE_NIVEAU[p.verdict.niveau]}</span>
      </section>
      <div className="lotgrid">
        {p.variantes.map((v) => (
          <figure style={{ margin: 0, display: 'grid', gap: 10 }} key={v.id}>
            <Pub texte={v.texte} image={v.image} classe={v.gagnante ? 'won' : undefined} tag={v.tag} />
            <div className={`bar ${v.gagnante ? 'w' : ''}`}><i><b style={{ width: `${v.barre.part}%` }} /></i><span>{v.barre.libelle}</span></div>
          </figure>
        ))}
      </div>
      <div className="checks">
        {p.controles.map((c) => (
          <div className="tile check" key={c.icone}><span className="ico"><Ic n={c.icone} /></span><div><strong>{c.titre}</strong><p className="muted" style={{ fontSize: '12.5px' }}>{c.detail}</p></div></div>
        ))}
      </div>
      <section className="tile" style={{ marginTop: 16, display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="orb">J</span>
        <p style={{ flex: 1, minWidth: 200 }}>{p.coach.avant} <b>{p.coach.fort}</b> {p.coach.apres}</p>
      </section>
      {p.actions}
    </Vue>
  );
}
