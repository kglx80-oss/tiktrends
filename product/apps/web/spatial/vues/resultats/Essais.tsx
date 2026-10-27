import type { ReactNode } from 'react';
import {
  DEFECT_LABEL, DIMENSION_COPIE_LABEL, DIMENSION_LABEL, ESSAI_LABEL, MIN_NOTES, MIN_RELECTURES,
  type EssaiVariable, type SceneDefect,
} from '@tiktrends/core';
import type { bilanCopieAction, bilanNotesAction, calibrationScoreAction, essaisViewAction } from '../../../app/actions/adsmap-attribution';
import { EnTete, Lien, SousNav, Vue } from '../../communs';
import type { SousNavResultats } from './communs';

/**
 * « Essais et relectures » · la section « Ce que Jarvis a appris de tes tests »
 * de l'ancienne Adsmap · le cumul des lots d'essai, du Score Jarvis (et sa
 * calibration contre le marché), des relectures des pubs générées entièrement.
 * Mêmes actions, même provenance · aucun modèle appelé, rien de facturé pour
 * afficher un cumul déjà payé. PRÉSENTATIONNEL · trois révélations repliées.
 */

type R<F extends (...a: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;

export interface PropsEssais {
  sousNav: SousNavResultats;
  sous: string;
  essais: R<typeof essaisViewAction>;
  notes: R<typeof bilanNotesAction>;
  calibration: R<typeof calibrationScoreAction>;
  copies: R<typeof bilanCopieAction>;
  conseil: { question: string; pourquoi: string; avantTout: string | null; variable: string | null } | null;
}

function Revelation({ titre, badge, alerte, children }: { titre: string; badge: string; alerte?: boolean; children: ReactNode }) {
  return (
    <details className="tile sec" style={alerte ? { borderColor: '#7ef0b040' } : undefined}>
      <summary style={{ cursor: 'pointer', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', listStyle: 'none' }}>
        <span className="pill">{badge}</span><strong style={{ fontSize: '15px' }}>{titre}</strong>
      </summary>
      <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>{children}</div>
    </details>
  );
}

const Ligne = ({ a, b, c, fort }: { a: ReactNode; b: ReactNode; c?: ReactNode; fort?: string }) => (
  <div className="ev"><span style={{ minWidth: 130 }}>{a}</span><span><b style={fort ? { color: fort } : undefined}>{b}</b>{c && <span className="faint" style={{ fontSize: '11.5px' }}> · {c}</span>}</span><span /></div>
);

export function Essais(p: PropsEssais) {
  const ev = p.essais.view;
  const notes = p.notes.bilan;
  const calib = 'calibration' in p.calibration ? p.calibration.calibration : undefined;
  const rel = p.copies.bilan;
  return (
    <Vue>
      <EnTete titre="Essais et relectures" sous={p.sous} />
      <SousNav items={p.sousNav} actif="/adsmap/apprentissages" />
      <p className="muted" style={{ fontSize: '13px', maxWidth: 760, marginBottom: 14 }}>Le cumul de tes lots d’essai, de tes notes et des relectures · d’où vient tout ce que Jarvis sait de cette marque, additionné ici plutôt que dispersé test par test.</p>
      <div className="kpis rvk">
        <div className="tile kpi"><div className="lbl">Lots d’essai</div><div className="v">{ev?.lots.length ?? 0}</div><small>une seule variable par lot</small></div>
        <div className="tile kpi"><div className="lbl">Créas notées</div><div className="v">{notes?.notes ?? 0}</div><small>Score Jarvis · un pronostic</small></div>
        <div className="tile kpi"><div className="lbl">Pubs relues</div><div className="v">{rel?.relues ?? 0}</div><small>générées entièrement</small></div>
      </div>
      {p.conseil && (
        <section className="tile" style={{ marginBottom: 14, borderColor: p.conseil.avantTout ? '#ff9b9b40' : undefined }}>
          <div className="lbl">{p.conseil.avantTout ? 'Avant de tester' : 'Le prochain essai'}</div>
          <strong>{p.conseil.question}</strong>
          <span className="muted" style={{ fontSize: '12.5px' }}>{p.conseil.pourquoi}</span>
          {p.conseil.avantTout && <span style={{ fontSize: '12.5px', color: 'var(--bad)' }}>{p.conseil.avantTout}</span>}
          {p.conseil.variable && (
            <span className="faint" style={{ fontSize: '12px' }}>Prépare ton prochain essai depuis les variantes d’un projet Studios : au moins deux variantes, une seule variable. <Lien href="/studio/projets">Ouvrir les projets</Lien></span>
          )}
        </section>
      )}

      <Revelation titre="Qu’ont répondu tes lots d’essai ?" badge="Essais" alerte={ev?.cumuls.some((c) => c.conclusif)}>
        <p className="muted" style={{ fontSize: '12.5px' }}>Un lot d’essai fait varier <b>une seule chose</b> et tient tout le reste · c’est la seule comparaison de l’outil où l’écart est vraiment attribuable à ce qu’on testait.</p>
        {p.essais.error ? <p role="alert" style={{ color: 'var(--bad)', fontSize: '12.5px' }}>{p.essais.error}</p>
          : !ev?.lots.length ? <p className="muted" style={{ fontSize: '12.5px' }}>Aucun lot d’essai poussé dans la carte. Pour préparer un nouvel essai, ouvre les variantes d’un projet Studios · les fiches rattachées et leurs lots se suivent dans Résultats.</p>
            : (
              <>
                {ev.cumuls.filter((c) => c.essais > 0).map((c) => (
                  <div className="tile" key={c.variable} style={c.conclusif ? { borderColor: '#7ef0b040' } : undefined}>
                    <strong style={{ fontSize: '13px' }}>{ESSAI_LABEL[c.variable as EssaiVariable]} · {c.resume}</strong>
                    <div className="tl">
                      {c.lignes.map((l) => <Ligne key={l.valeur} a={l.valeur} b={`${l.victoires}/${l.participations}`} c={`${Math.round((l.taux ?? 0) * 100)} % de victoires · le hasard en donnerait ${Math.round(c.hasard * 100)} %`} fort={l.gagne ? 'var(--good)' : undefined} />)}
                    </div>
                  </div>
                ))}
                <div className="tl">
                  {ev.lots.slice(0, 8).map((e) => (
                    <Ligne key={e.groupe} a={ESSAI_LABEL[e.variable as EssaiVariable]} b={e.bras.map((b) => `${b.valeur}${b.gagnant ? ' (gagnant)' : b.arbitre ? '' : ' (en cours)'}`).join(', ')} c={e.resume} />
                  ))}
                </div>
              </>
            )}
        <p className="faint" style={{ fontSize: '11.5px' }}>Un lot seul donne <b>une observation par bras</b> · pas un taux. C’est en répétant l’essai que l’écart devient une mesure, et on ne conclut qu’au-dessus de ce que le hasard expliquerait.</p>
      </Revelation>

      <Revelation titre="Ce que tes notes disent ensemble" badge="Score Jarvis" alerte={!!calib?.predictif}>
        {calib && calib.predictif !== null && (
          <p style={{ fontSize: '12.5px' }}><b style={{ color: calib.predictif ? 'var(--good)' : undefined }}>{calib.predictif ? 'Ton Score Jarvis prédit le marché.' : 'Ton Score Jarvis ne se détache pas encore du hasard.'}</b> {calib.resume} <span className="faint">· sur {calib.conclusifs} créa(s) notée(s) et mesurée(s).</span></p>
        )}
        {p.notes.error ? <p role="alert" style={{ color: 'var(--bad)', fontSize: '12.5px' }}>{p.notes.error}</p>
          : !notes?.notes ? <p className="muted" style={{ fontSize: '12.5px' }}>Aucune créa notée pour l’instant · les notes existantes restent lues ici.</p>
            : (
              <>
                <p style={{ fontSize: '12.5px', color: notes.defauts.avecDefaut ? 'var(--bad)' : 'var(--good)' }}><b>{notes.defauts.resume}</b></p>
                {notes.defauts.parType.length > 0 && <div className="tl">{notes.defauts.parType.map((d) => <Ligne key={d.defaut} a={DEFECT_LABEL[d.defaut as SceneDefect]} b={`${d.n}×`} />)}</div>}
                {notes.dimensions.filter((d) => d.conclusif).map((d) => (
                  <div className="tile" key={d.dimension}>
                    <strong style={{ fontSize: '13px' }}>{DIMENSION_LABEL[d.dimension]} · {d.resume}</strong>
                    <div className="tl">
                      {d.lignes.filter((l) => l.n >= MIN_NOTES).map((l) => <Ligne key={l.cle} a={l.cle} b={`${Math.round(l.moyenne)}/100`} c={`sur ${l.n} note(s)${l.tranche ? '' : ' · écart non tranché'}`} fort={l.tranche ? (l.ecart > 0 ? 'var(--good)' : 'var(--bad)') : undefined} />)}
                    </div>
                  </div>
                ))}
                <p className="faint" style={{ fontSize: '11.5px' }}>{notes.notes} note(s), moyenne {Math.round(notes.moyenne ?? 0)}/100. Une note est un <b>pronostic</b>, pas un résultat · les vraies performances sont dans les verdicts. Un écart n’est retenu qu’au-dessus de {MIN_NOTES} notes et s’il dépasse la dispersion.</p>
              </>
            )}
      </Revelation>

      <Revelation titre="Quel moteur écrit tes mots, et garde ton produit" badge="Pubs générées entièrement" alerte={rel?.dimensions.some((d) => d.conclusif)}>
        <p className="muted" style={{ fontSize: '12.5px' }}>En mode « générée entièrement », c’est le modèle d’images qui écrit la typographie. Chaque pub est relue à sa génération · voici la somme de ces relectures.</p>
        {p.copies.error ? <p role="alert" style={{ color: 'var(--bad)', fontSize: '12.5px' }}>{p.copies.error}</p>
          : !rel?.relues ? <p className="muted" style={{ fontSize: '12.5px' }}>Aucune publicité relue pour l’instant · les relectures existantes restent lues ici.</p>
            : (
              <>
                <p style={{ fontSize: '12.5px', color: (rel.tauxReecriture ?? 0) > 0 || (rel.tauxProduit ?? 0) > 0 ? 'var(--bad)' : 'var(--good)' }}><b>{rel.resume}</b></p>
                {p.copies.temoin?.resume && <p style={{ fontSize: '12px', color: p.copies.temoin.evolutions.some((e) => e.sens === 'degradation') ? 'var(--bad)' : 'var(--good)' }}>Témoin · {p.copies.temoin.resume}</p>}
                {rel.dimensions.filter((d) => d.conclusif).map((d) => (
                  <div className="tile" key={d.dimension}>
                    <strong style={{ fontSize: '13px' }}>{DIMENSION_COPIE_LABEL[d.dimension]} · {d.resume}</strong>
                    <div className="tl">
                      {d.lignes.map((l) => <Ligne key={l.cle} a={l.cle} b={`${Math.round(l.tauxReecriture * 100)} % réécrites`} c={`sur ${l.n} pub(s)${l.tauxProduit !== null ? ` · ${Math.round(l.tauxProduit * 100)} % de produits modifiés sur ${l.avecReference}` : ''}${l.verdict === null ? ' · écart non tranché' : ''}`} fort={l.verdict === 'meilleur' ? 'var(--good)' : l.verdict === 'pire' ? 'var(--bad)' : undefined} />)}
                    </div>
                  </div>
                ))}
                <p className="faint" style={{ fontSize: '11.5px' }}>Un groupe ne se détache qu’au-dessus de {MIN_RELECTURES} publicités relues, et seulement si son écart au taux général tient. La fidélité du produit ne se compte que sur les pubs qui avaient une photo de référence.</p>
              </>
            )}
      </Revelation>
    </Vue>
  );
}
