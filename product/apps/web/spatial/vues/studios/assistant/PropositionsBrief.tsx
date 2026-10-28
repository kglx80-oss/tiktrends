'use client';

import type { PropositionPresentee } from '../../../../lib/studios/propositions/types';
import type { CyclePropositionsBrief } from '../../../../lib/studios/propositions/use-propositions-brief';
import { Ic } from '../../../communs';

/**
 * Une proposition du BRIEF relue · l'avant / après de chaque changement, le
 * plan d'impact, et les deux gestes (appliquer, rejeter) seulement sur un état
 * `proposed`. Rien n'est appliqué sans ce geste · le serveur revérifie
 * (`appliquerProposition` · seul un état relu s'applique).
 */
export function CartePropositionBrief({ p, cycle, onApplied, libelleAppliquer = 'Appliquer', titre }: {
  p: PropositionPresentee; cycle: CyclePropositionsBrief; onApplied: () => void; libelleAppliquer?: string; titre?: string;
}) {
  const peutAgir = !!(cycle.liste?.ok && cycle.liste.peutProposer);
  const ouverte = p.etat === 'proposed';
  return (
    <div className="tile" style={{ display: 'grid', gap: 8 }} data-proposition={p.id} data-etat={p.etat}>
      <div className="kc" style={{ alignItems: 'center' }}>
        <span className={`pill ${ouverte ? 'c' : p.etat === 'approved' ? 'g' : ''}`}>{p.libelleEtat}</span>
        <strong style={{ fontSize: 13 }}>{titre ?? p.libelleCible}</strong>
        <span className="faint" style={{ fontSize: '11.5px' }}>{p.libelleOrigine} · version {p.baseVersion.n}</span>
      </div>
      {p.changements.map((c, i) => (
        <div key={`${c.chemin}-${i}`} style={{ display: 'grid', gap: 4 }}>
          <span className="lbl">{c.libelle}</span>
          {c.avant && <p className="faint" style={{ fontSize: '12.5px' }}>Avant · {c.avant}</p>}
          <p style={{ fontSize: '12.5px' }}>Après · {c.apres || 'retiré'}</p>
        </div>
      ))}
      {p.explication && <p className="muted" style={{ fontSize: '12.5px' }}>{p.explication}</p>}
      {p.impact && (p.impact.aRefaire.length > 0 || p.impact.obsoletes.length > 0) && (
        <p className="faint" style={{ fontSize: '11.5px' }}>
          À refaire · {p.impact.aRefaire.map((n) => n.libelle).join(', ') || 'rien'}{p.impact.obsoletes.length ? ` · devient obsolète : ${p.impact.obsoletes.map((n) => n.libelle).join(', ')}` : ''} · rien n’est lancé à l’application.
        </p>
      )}
      {p.sources.length > 0 && <p className="faint" style={{ fontSize: '11.5px' }}>Sources citées · {p.sources.join(', ')}</p>}
      {p.perimee && ouverte && <p className="faint" role="note" style={{ fontSize: '11.5px' }}>Base périmée · version {p.baseVersion.n}, projet en version {cycle.version.n}. Recharge puis demande une nouvelle proposition.</p>}
      {ouverte && !peutAgir && <p className="faint" role="note" style={{ fontSize: '11.5px' }}>Ton rôle permet de lire les propositions, pas de les trancher.</p>}
      {ouverte && (
        <div className="kc">
          <button className="btn pri sm" type="button" data-geste="appliquer" disabled={!peutAgir || !!cycle.occupe || p.perimee} onClick={() => void cycle.adopter(p, onApplied)}>
            <Ic n="check" />{cycle.occupe === p.id ? 'Application…' : libelleAppliquer}
          </button>
          <button className="btn sm" type="button" data-geste="rejeter" disabled={!peutAgir || !!cycle.occupe} onClick={() => void cycle.rejeter(p)}><Ic n="x" />Rejeter</button>
        </div>
      )}
    </div>
  );
}

/** La liste des propositions du brief à trancher (stratégie, direction) · lue, jamais appliquée seule. */
export function PropositionsBrief({ cycle, onApplied, exclure = [] }: { cycle: CyclePropositionsBrief; onApplied: () => void; exclure?: readonly string[] }) {
  const { liste, retour } = cycle;
  const propositions = liste?.ok ? liste.propositions.filter((p) => p.cible === 'brief' && !exclure.includes(p.id)) : [];
  return (
    <div data-zone="propositions-brief" style={{ display: 'grid', gap: 10 }}>
      {retour && <RetourCycle retour={retour} />}
      {liste === null && <p className="faint" role="status" style={{ fontSize: '12.5px' }}>Lecture des propositions…</p>}
      {liste && !liste.ok && <div className="banner" role="alert"><Ic n="x" /><span>{liste.message}</span></div>}
      {liste?.ok && propositions.length === 0 && <p className="faint" data-etat="aucune-proposition" style={{ fontSize: '12.5px' }}>Aucune proposition à trancher pour l’instant · écris ou demande une suggestion ci-dessus.</p>}
      {propositions.length > 0 && <div className="mtable">{propositions.map((p) => <CartePropositionBrief key={p.id} p={p} cycle={cycle} onApplied={onApplied} />)}</div>}
    </div>
  );
}

export function RetourCycle({ retour }: { retour: NonNullable<CyclePropositionsBrief['retour']> }) {
  return (
    <p role={retour.type === 'err' ? 'alert' : 'status'} data-retour={retour.type} className="muted" style={{ fontSize: '12.5px' }}>
      <span className={`pill ${retour.type === 'ok' ? 'g' : 'w'}`}>{retour.type === 'ok' ? 'Fait' : 'Refusé'}</span> {retour.message}
    </p>
  );
}
