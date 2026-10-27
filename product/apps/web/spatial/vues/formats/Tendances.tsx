'use client';

import { useState, type ReactNode } from 'react';
import {
  COULEUR_ETAPE_TENDANCE, EFFECTIF_MIN_FENETRE_TENDANCE, ETAPES_TENDANCE, LIBELLE_ETAPE_TENDANCE, ZONES_COURBE_TENDANCE,
  pointsCourbeTendances, pointsSparklineTendance, traceCourbeTendances,
  type CarteTendance, type EtapeTendance,
} from '@tiktrends/core';
import { Anneau, EnTete, Ic, Lien, SousNav, Vue } from '../../communs';

/**
 * « Tendances » · `docs/spatial/reference/tendances.html`, balisage à
 * l'identique (vue `vTendances` de la maquette). Écran NOUVEAU · aucune
 * équivalence V5. Toutes les valeurs arrivent en props, calculées par la page
 * serveur avec la règle du noyau (`detecterTendances`) sur les données
 * RÉELLES · sauvegardes classées et créas concurrentes décrites.
 *
 * Pas de « capteur » simulé · l'en-tête dit l'état RÉEL du radar concurrents
 * (armé ou non, dernier passage) ; son interrupteur est en lecture seule (le
 * radar dépense · il s'arme dans son écran, coût annoncé avant). Pas de score
 * composite inventé · l'anneau montre la PART mesurée. Pas de « pertinence pour
 * la marque » (aucune source). Le silence est un résultat · sans tendance
 * mesurée, l'écran le dit et donne les effectifs.
 */
export interface PropsTendances {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  capteur: { actif: boolean; etat: string; raisonInterrupteur: string };
  sources: ReadonlyArray<{ lettre: string; couleur: string; nom: string; detail: string; actif: boolean }>;
  /** « Ouvrir le radar » · `null` quand le radar concurrents n'est pas ouvert à la personne. */
  radar: string | null;
  surveille: { libelle: string; href: string };
  kpis: ReadonlyArray<readonly [string, string]>;
  tendances: readonly CarteTendance[];
  types: ReadonlyArray<{ cle: string; libelle: string }>;
  /** Le silence, expliqué · affiché quand aucune tendance n'est mesurée. */
  silence: string;
  alertes: ReadonlyArray<{ libelle: string; actif: boolean; raison: string }>;
  canaux: ReadonlyArray<{ libelle: string; actif: boolean }>;
}

function Courbe({ etapes }: { etapes: readonly EtapeTendance[] }) {
  const d = traceCourbeTendances();
  const pts = pointsCourbeTendances(etapes);
  const yb = 176;
  return (
    <svg className="trcv" viewBox="0 0 1000 230" role="img" aria-label="Cycle de vie des tendances mesurées">
      <defs><linearGradient id="trg" x1="0" x2="1"><stop offset="0" stopColor="#7cc6dd" /><stop offset=".45" stopColor="#7ef0b0" /><stop offset=".62" stopColor="#ffd76a" /><stop offset="1" stopColor="#ff8a8a" /></linearGradient></defs>
      <rect x="300" y="14" width="200" height={yb - 14} rx="14" fill="#7ef0b0" opacity=".1" /><text x="400" y="34" textAnchor="middle" className="trbest">Le bon moment pour itérer</text>
      {ZONES_COURBE_TENDANCE.map(([a, b, e], i) => (
        <g key={e}>{i > 0 && <line x1={a} x2={a} y1="20" y2={yb} stroke="#ffffff22" strokeDasharray="4 6" />}<text x={(a + b) / 2} y={yb + 30} textAnchor="middle" className="trzl">{LIBELLE_ETAPE_TENDANCE[e]}</text></g>
      ))}
      <line x1="0" x2="1000" y1={yb} y2={yb} stroke="#ffffff30" />
      <path d={`${d}L1000,${yb}L0,${yb}Z`} fill="url(#trg)" opacity=".14" /><path d={d} fill="none" stroke="url(#trg)" strokeWidth="4" strokeLinecap="round" />
      {etapes.map((e, i) => (
        <g className="trdot" key={i}><circle cx={pts[i]!.x} cy={pts[i]!.y} r="17" fill="#0d1424" stroke={COULEUR_ETAPE_TENDANCE[e]} strokeWidth="3" /><text x={pts[i]!.x} y={pts[i]!.y + 5.5} textAnchor="middle">{i + 1}</text><title>{LIBELLE_ETAPE_TENDANCE[e]}</title></g>
      ))}
    </svg>
  );
}

export function Tendances(p: PropsTendances) {
  const [type, setType] = useState('tous');
  const [etape, setEtape] = useState<EtapeTendance | 'tous'>('tous');
  const [masquees, setMasquees] = useState<ReadonlySet<string>>(new Set());
  const toutes = p.tendances.filter((t) => !masquees.has(t.cle));
  const liste = toutes.filter((t) => (type === 'tous' || t.type === type) && (etape === 'tous' || t.etape === etape));

  return (
    <Vue>
      <EnTete titre="Tendances" sous="Ce qui monte et ce qui recule, mesuré sur tes sauvegardes classées et les créas concurrentes repérées" />
      <SousNav items={p.sousNav} actif="/veille/tendances" />
      <section className="tile trhero">
        <div className="trstat">
          <div className="member">
            <span className={`trpulse ${p.capteur.actif ? 'on' : ''}`}><Ic n="eye" s={false} /></span>
            <div><h2>Radar concurrents</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.capteur.etat}</span></div>
            <button type="button" className="sw2" role="switch" aria-checked={p.capteur.actif} aria-label="Radar concurrents" disabled title={p.capteur.raisonInterrupteur} style={{ marginLeft: 'auto' }} />
          </div>
          <div className="trsrc">
            {p.sources.map((s) => (
              <div className={`trs ${s.actif ? '' : 'off'}`} key={s.nom}><span className="logo2" style={{ background: s.couleur }}>{s.lettre}</span><div><strong>{s.nom}</strong><small>{s.detail}</small></div>{s.actif && <span className="dotok" title="Des annonces lues" />}</div>
            ))}
          </div>
          <div className="kc">
            {p.radar && <Lien className="btn pri" href={p.radar}><Ic n="loop" />Ouvrir le radar concurrents</Lien>}
            <Lien className="btn" href={p.surveille.href}><Ic n="grid" />{p.surveille.libelle}</Lien>
          </div>
        </div>
        <div className="trkpi">{p.kpis.map(([b, s]) => <div key={s}><b>{b}</b><small>{s}</small></div>)}</div>
      </section>
      <section className="tile sec">
        <div className="sech" style={{ margin: '0 0 6px' }}><h2>Où en est chaque tendance</h2><span className="faint" style={{ fontSize: '12.5px' }}>Itère quand elle monte, pas quand tout le monde l’a déjà</span></div>
        <div className="dcw"><Courbe etapes={toutes.map((t) => t.etape)} /></div>
        <div className="trleg">{toutes.map((t, i) => <span key={t.cle}><i style={{ ['--c' as string]: COULEUR_ETAPE_TENDANCE[t.etape] }}>{i + 1}</i>{t.nom}</span>)}</div>
      </section>
      <div className="toolbar sec">
        <div className="pcats" style={{ margin: 0 }}>
          {[{ cle: 'tous', libelle: 'Toutes' }, ...p.types].map((x) => <button key={x.cle} type="button" className="chip" aria-pressed={type === x.cle} onClick={() => setType(x.cle)}>{x.libelle}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Étape" style={{ marginLeft: 'auto' }}>
          {(['tous', ...ETAPES_TENDANCE] as const).map((e) => <button key={e} type="button" aria-pressed={etape === e} onClick={() => setEtape(e)}>{e === 'tous' ? 'Toutes étapes' : LIBELLE_ETAPE_TENDANCE[e]}</button>)}
        </div>
      </div>
      <div className="trgrid">
        {liste.map((t) => {
          const i = toutes.indexOf(t), c = COULEUR_ETAPE_TENDANCE[t.etape];
          const v = { ['--c' as string]: c };
          return (
            <article className="tile trc" key={t.cle}>
              <div className="trh">
                <span className="trn" style={v}>{i + 1}</span><span className="pill">{t.type}</span><span className="trst" style={v}>{LIBELLE_ETAPE_TENDANCE[t.etape]}</span>
                <span className="trsc" title="Part des annonces entrées ces 30 derniers jours"><Anneau part={t.part} taille={46} libelle={String(t.part)} /></span>
                <button type="button" className="trx" aria-label="Masquer cette tendance" title="Masquer" onClick={() => setMasquees(new Set([...masquees, t.cle]))}><Ic n="x" /></button>
              </div>
              <div><h3>{t.nom}</h3><p className="muted" style={{ fontSize: '12.5px' }}>{t.sous}</p></div>
              {t.vignettes.length > 0 && <div className="trex">{t.vignettes.map((src) => <div className="comp" key={src}><img src={src} alt="" /></div>)}</div>}
              <div className="trsig">
                <div><b className={t.hausse ? 'pos' : 'neg'}>{t.ecart}</b><small>part, 30 j</small></div>
                <div><b>{t.marques}</b><small>marques</small></div>
                <div><b>{t.concurrents}</b><small>suivies</small></div>
                <div><b>{t.jours}</b><small>diffusion moy.</small></div>
              </div>
              <div className="trline"><svg className="trsp" viewBox="0 0 120 32" aria-hidden="true"><polyline points={pointsSparklineTendance(t.semaines)} fill="none" stroke={c} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg><span className="faint">10 dernières semaines</span></div>
              <p className="trwhy"><Ic n="bulb" /><span>{t.pourquoi}</span></p>
              <div className="trcta">
                {t.cta.primaire ? <Lien className="btn sm pri" href={t.cta.primaire.href}><Ic n="loop" />{t.cta.primaire.libelle}</Lien> : t.cta.alerte ? <span className="pill w"><Ic n="warn" />{t.cta.alerte}</span> : null}
                {t.cta.voir && <Lien className="btn sm" href={t.cta.voir.href}>{t.cta.voir.libelle}</Lien>}
              </div>
            </article>
          );
        })}
        {liste.length === 0 && (
          <div className="dempty" style={{ gridColumn: '1/-1' }}><span className="ico"><Ic n="search" s={false} /></span>
            <h3>{toutes.length === 0 ? 'Aucune tendance mesurée' : 'Aucune tendance avec ces filtres'}</h3>
            {toutes.length === 0 && <p className="muted">{p.silence}</p>}
          </div>
        )}
      </div>
      <section className="grid2 sec">
        <div className="tile">
          <h2 style={{ marginBottom: 12 }}>Comment une créa devient « tendance »</h2>
          <div className="trhow">
            {([
              ['chart', 'Sa part monte', 'Parmi les annonces entrées ces 30 jours, ce format, cette accroche ou ce visuel pèse nettement plus que le mois d’avant.'],
              ['users', 'Elle se propage', 'Le nombre de marques qui l’utilisent est affiché, et combien tu en suis.'],
              ['cal', 'Elle dure', 'La diffusion moyenne vient de la source : une marque ne garde pas une pub qui perd de l’argent.'],
              ['copy', 'Elle se compare', 'Au mois d’avant, jamais à zéro. Deux mois qui ne se départagent pas ne font pas une tendance.'],
            ] as const).map(([ico, a, b]) => <div key={a}><span className="ico2"><Ic n={ico} /></span><div><strong>{a}</strong><small>{b}</small></div></div>)}
          </div>
          <p className="faint" style={{ fontSize: '12px', marginTop: 12 }}>Une tendance n’apparaît que si les intervalles de confiance du mois en cours et du mois d’avant ne se touchent pas, avec au moins {EFFECTIF_MIN_FENETRE_TENDANCE} annonces par mois. Seules des pubs publiques et tes sauvegardes sont lues ; rien n’est publié en ton nom.</p>
        </div>
        <div className="tile">
          <h2 style={{ marginBottom: 12 }}>Alertes</h2>
          <div className="tral">
            {p.alertes.map((a) => (
              <div className="member" key={a.libelle}><span>{a.libelle}</span><button type="button" className="sw2" role="switch" aria-checked={a.actif} aria-label={a.libelle} disabled title={a.raison} style={{ marginLeft: 'auto' }} /></div>
            ))}
          </div>
          <div className="lbl" style={{ margin: '14px 0 8px' }}>Où recevoir les alertes</div>
          <div className="kc">{p.canaux.map((c) => <button key={c.libelle} type="button" className="chip" aria-pressed={c.actif} disabled>{c.actif && <Ic n="check" />}{c.libelle}</button>)}</div>
          <p className="faint" style={{ fontSize: '12px', marginTop: 12 }}>Pas encore d’alerte dédiée aux tendances · les nouvelles pubs des marques suivies arrivent déjà dans tes notifications et dans <Lien href="/saved" className="more">Sauvegardes</Lien>.</p>
        </div>
      </section>
    </Vue>
  );
}
