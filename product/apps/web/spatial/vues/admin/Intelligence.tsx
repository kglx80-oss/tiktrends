import { PROVEN_DAYS, VALEUR_ABSENTE, type AnalyseSurvie, type BilanHypotheses, type PerfParAngle } from '@tiktrends/core';
import type { Cap, CapabilityRow, Competitor } from '../../../lib/intel';
import { Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Intelligence marché » · ancien `/admin/intelligence`. PRÉSENTATIONNEL ·
 * lecture seule. Le positionnement face aux concurrents directs (données
 * publiques et estimations du code, `lib/intel`) et trois MESURES réelles,
 * tous espaces confondus : la survie des créas concurrentes (seuil « éprouvé »),
 * la pertinence jugée par angle, la performance réelle par angle (Adsmap).
 * Une mesure sans effectif suffisant le dit · le silence est une conclusion.
 */
export interface PropsIntelligence {
  bandeau: BandeauAdmin;
  capacites: readonly CapabilityRow[];
  ecarts: ReadonlyArray<{ priority: 'haute' | 'moyenne'; title: string; detail: string; vs: string }>;
  avantages: readonly string[];
  pile: ReadonlyArray<{ layer: string; role: string; engines: string }>;
  concurrents: readonly Competitor[];
  survie: AnalyseSurvie | null;
  bilan: BilanHypotheses | null;
  perf: PerfParAngle | null;
}

const CAP: Record<Cap, { mot: string; c: '' | 'g' | 'w' }> = { yes: { mot: 'Oui', c: 'g' }, partial: { mot: 'Partiel', c: 'w' }, no: { mot: 'Non', c: '' } };
const pct = (x: number | null) => (x == null ? VALEUR_ABSENTE : `${Math.round(x * 100)} %`);
const COL_M = '1.6fr repeat(4, .7fr)';

function Position({ taux, reference, attendre }: { taux: number | null; reference: number | null; attendre: boolean }) {
  if (attendre) return <Pill>À confirmer</Pill>;
  if (taux == null || reference == null) return null;
  return taux >= reference ? <Pill c="g">Au-dessus</Pill> : <Pill c="w">En dessous</Pill>;
}

export function Intelligence(p: PropsIntelligence) {
  return (
    <Vue>
      <TeteAdmin titre="Intelligence marché" sous="intelligence" actif="/admin/intelligence" bandeau={p.bandeau} />
      <p className="muted" style={{ margin: '0 0 14px', fontSize: '12.5px' }}>Où l’on se situe face aux concurrents directs, et comment la pile IA maison fait la différence. Données publiques et estimations · les tarifs évoluent, à revérifier avant tout usage commercial.</p>
      <section className="tile">
        <div className="sech"><h2>Matrice comparative</h2></div>
        <div className="atable">
          <div className="atr ath" style={{ gridTemplateColumns: COL_M }}><span>Capacité</span><span>TikTrends</span><span>Atria</span><span>Foreplay</span><span>Higgsfield</span></div>
          {p.capacites.map((r) => (
            <div className="atr" key={r.capability} style={{ gridTemplateColumns: COL_M }}>
              <span style={{ whiteSpace: 'normal' }}><b>{r.capability}</b>{r.note && <small className="faint" style={{ display: 'block' }}>{r.note}</small>}</span>
              {[r.us, r.atria, r.foreplay, r.higgsfield].map((v, i) => <span key={i}><Pill c={CAP[v].c}>{CAP[v].mot}</Pill></span>)}
            </div>
          ))}
        </div>
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Où l’on doit faire mieux</h2></div>
          <div className="atable">
            {p.ecarts.map((g) => (
              <div className="atr" key={g.title} style={{ gridTemplateColumns: 'auto 1fr' }}>
                <span><Pill c={g.priority === 'haute' ? 'r' : 'w'}>{g.priority === 'haute' ? 'Haute' : 'Moyenne'}</Pill></span>
                <span style={{ whiteSpace: 'normal' }}><b>{g.title}</b> <small className="faint">vs {g.vs}</small><small className="muted" style={{ display: 'block' }}>{g.detail}</small></span>
              </div>
            ))}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Nos avantages à presser</h2></div>
          <ul className="muted" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8, fontSize: '12.5px' }}>{p.avantages.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Notre pile IA · orchestration maison</h2></div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Les modèles sont le moteur. Notre valeur, c’est la chaîne et la gouvernance · veille → contexte marque → règles Jarvis → concept → scène produit fidèle → design → vidéo → contrôle qualité. Interchangeable · si un meilleur modèle sort, on le branche sans changer la couche Jarvis.</p>
        <div className="atable">
          {p.pile.map((l, i) => (
            <div className="atr" key={l.layer} style={{ gridTemplateColumns: 'auto 1fr 1.6fr' }}><span className="pill">{i + 1}</span><span><b>{l.layer}</b><small className="faint" style={{ display: 'block' }}>{l.engines}</small></span><span className="muted" style={{ whiteSpace: 'normal' }}>{l.role}</span></div>
          ))}
        </div>
      </section>
      <div className="agrid2 sec">
        {p.concurrents.map((c) => (
          <section className="tile" key={c.key}>
            <div className="sech"><h2>{c.name}</h2><Pill c="c">{c.tag}</Pill><a className="faint" href={c.url} target="_blank" rel="noreferrer" style={{ marginLeft: 'auto', fontSize: 12 }}>{c.url.replace('https://', '')}</a></div>
            <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>{c.positioning}</p>
            <p style={{ margin: '0 0 10px', fontSize: '12.5px' }}><b>Tarif estimé · </b>{c.pricing}</p>
            <div className="agrid2" style={{ gap: 12 }}>
              <div><Pill c="g">Forces</Pill><ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>{c.strengths.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              <div><Pill c="w">Limites</Pill><ul className="muted" style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>{c.weaknesses.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
            </div>
            <p className="banner" style={{ margin: '12px 0 0' }}><b>Notre angle</b> · {c.ourEdge}</p>
          </section>
        ))}
      </div>
      <section className="tile sec" data-mesure="survie">
        <div className="sech"><h2>Seuil « éprouvé » · mesuré</h2></div>
        <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Le code fige PROVEN_DAYS = {PROVEN_DAYS} j, écrit de tête. Voici ce que dit la donnée réelle (âge de chaque créa concurrente décrite, tous espaces confondus). Rien ne change ici · la courbe sert à décider sur mesure, avec de la marge.</p>
        {!p.survie ? <Vide>Base indisponible.</Vide> : (
          <>
            <Kpis items={[
              { lbl: 'Créas mesurées', v: String(p.survie.effectifTotal) }, { lbl: 'Médiane', v: `${p.survie.mediane} j` }, { lbl: 'p75', v: `${p.survie.p75} j` },
              { lbl: 'p90', v: `${p.survie.p90} j` }, { lbl: 'Seuil actuel (posé)', v: `${PROVEN_DAYS} j` }, { lbl: 'Seuil mesuré', v: p.survie.recommande != null ? `${p.survie.recommande} j` : VALEUR_ABSENTE, c: 'up' },
            ]} />
            <div className="atable" style={{ marginTop: 12 }}>
              <div className="atr ath" style={{ gridTemplateColumns: '.7fr .8fr .8fr 1.6fr' }}><span>Seuil</span><span>Créas au-delà</span><span>Part du marché</span><span /></div>
              {p.survie.paliers.map((x) => (
                <div className="atr" key={x.jour} style={{ gridTemplateColumns: '.7fr .8fr .8fr 1.6fr' }}><span><b>{x.jour} j</b>{x.jour === PROVEN_DAYS ? <small className="faint"> · actuel</small> : null}{x.jour === p.survie!.recommande ? <> <Pill c="g">mesuré</Pill></> : null}</span><span>{x.effectif}</span><span>{Math.round(x.partAuDela * 100)} %</span><span><Barre part={x.partAuDela * 100} /></span></div>
              ))}
            </div>
            <p className="faint" style={{ margin: '10px 0 0', fontSize: 12 }}>{p.survie.raison}</p>
          </>
        )}
      </section>
      <div className="agrid2 sec">
        <section className="tile" data-mesure="pertinence">
          <div className="sech"><h2>Angles · ce qui convainc</h2></div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>Chaque créa générée porte l’angle qui l’a armée · reliée au jugement du client (validé, rejeté), comparée au taux général. Un angle sous 5 jugements attend plutôt que de trancher.</p>
          {!p.bilan || p.bilan.lignes.length === 0 ? <Vide>Aucune hypothèse d’angle encore mesurable · les créas générées depuis un angle de marché apparaîtront ici dès qu’elles seront jugées.</Vide> : (
            <>
              <small className="faint">Référence · taux général {pct(p.bilan.tauxGeneral)} sur {p.bilan.jugeesTotal} créa(s) jugée(s).</small>
              <div className="atable" style={{ marginTop: 8 }}>
                <div className="atr ath" style={{ gridTemplateColumns: '1.6fr .6fr .6fr .8fr auto' }}><span>Angle</span><span>Générées</span><span>Jugées</span><span>Pertinence</span><span /></div>
                {p.bilan.lignes.map((l) => (
                  <div className="atr" key={l.angle} style={{ gridTemplateColumns: '1.6fr .6fr .6fr .8fr auto' }}><span title={l.angle}>{l.angle}</span><span>{l.total}</span><span>{l.jugees}</span><span><b>{pct(l.tauxPertinence)}</b></span><span><Position taux={l.tauxPertinence} reference={p.bilan!.tauxGeneral} attendre={l.aConfirmer} /></span></div>
                ))}
              </div>
            </>
          )}
        </section>
        <section className="tile" data-mesure="performance">
          <div className="sech"><h2>Angles · ce qui a payé</h2><Pill c="w">Jointure à confirmer</Pill></div>
          <p className="muted" style={{ margin: '0 0 10px', fontSize: '12.5px' }}>La part de créas lancées jugées gagnantes par Adsmap (métriques réelles), par angle, comparée au taux général. Jointure ad → génération → angle non encore vérifiée sur données réelles · lien au niveau de l’annonce seul, les rattachements ambigus sont écartés.</p>
          {!p.perf || p.perf.lignes.length === 0 ? <Vide>Aucune créa lancée n’est encore rattachable à un angle · ce tableau se remplit quand des créas générées depuis un angle sont lancées via Adsmap et reçoivent un verdict.</Vide> : (
            <>
              <small className="faint">Référence · taux de gagnants général {pct(p.perf.tauxGeneral)} sur {p.perf.conclusifsTotal} créa(s) conclusive(s).</small>
              <div className="atable" style={{ marginTop: 8 }}>
                <div className="atr ath" style={{ gridTemplateColumns: '1.4fr .5fr .6fr .6fr .6fr auto' }}><span>Angle</span><span>Lancées</span><span>Conclusives</span><span>Gagnants</span><span>CTR</span><span /></div>
                {p.perf.lignes.map((l) => (
                  <div className="atr" key={l.angle} style={{ gridTemplateColumns: '1.4fr .5fr .6fr .6fr .6fr auto' }}><span title={l.angle}>{l.angle}</span><span>{l.total}</span><span>{l.conclusifs}</span><span><b>{pct(l.tauxGagnant)}</b></span><span>{l.ctrMoyen != null ? `${(l.ctrMoyen * 100).toFixed(2).replace('.', ',')} %` : VALEUR_ABSENTE}</span><span><Position taux={l.tauxGagnant} reference={p.perf!.tauxGeneral} attendre={l.aConfirmer} /></span></div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </Vue>
  );
}
