'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CHEMIN_NOUVEAU_PROJET, budgetPrevuLot, lienFicheTest, type VerdictValue } from '@tiktrends/core';
import { launchBatchAction, prepareBatchAction, setBatchAdAction } from '../../../app/actions/adsmap-batch';
import { validateVerdictAction, type ValidateInput } from '../../../app/actions/adsmap-verdict';
import { Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';

/**
 * Les gestes RÉELS sur un lot, sous sa fiche · chacun appelle l'action serveur
 * existante, qui garde (rôle, marque, invariants) et écrit. Aucun succès n'est
 * affiché sans retour positif de l'action.
 *
 *  · composer · `setBatchAdAction` (admin · refusé par l'action sur un lot lancé) ;
 *  · préparer · `prepareBatchAction` (noms régie, passage en « prêt » si complet) ;
 *  · lancer · `launchBatchAction` (date la fenêtre d'évaluation) ;
 *  · conclure · `validateVerdictAction`, variante par variante · un verdict ne se
 *    valide qu'avec un apprentissage écrit (invariant §2.4, vérifié par l'action).
 */

export interface VarianteComposee {
  id: string; variante: string; concept: string; manques: string[]; nom: string | null;
  /** Ce qui bloque le lancement, l'avis d'avant lancement, l'ad set proposé (`batchDetailAction`) · absents hors du lot. */
  blocage?: string | null; avis?: string | null; adset?: string | null;
}
export interface VarianteAArbitrer { id: string; variante: string; verdict: string; raison: string | null; calcule: VerdictValue }
export interface BriefLot { campagne: string; structure: string; budgetJour: number; jours: number; audience: string; total: number; conclusivite: string }

export type PropsActionsLot =
  | { mode: 'composition'; lotId: string; pret: boolean; variantes: VarianteComposee[]; vivier: VarianteComposee[]; brief: BriefLot | null }
  | { mode: 'arbitrage'; lotId: string; aArbitrer: VarianteAArbitrer[] };

const PORTEES: ReadonlyArray<[ValidateInput['learning']['scope'], string]> = [
  ['ad', 'Cette variante'], ['concept', 'Le concept'], ['angle', 'L’angle'], ['desire', 'Le désir'],
  ['avatar', 'L’avatar'], ['format', 'Le format'], ['landing', 'La page'], ['offer', 'L’offre'],
];

export function ActionsLot(p: PropsActionsLot) {
  return p.mode === 'composition' ? <Composition {...p} /> : <Arbitrage {...p} />;
}

function useGeste() {
  const router = useRouter();
  const { toast } = useSpatial();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  async function geste<T extends { error?: string }>(cle: string, f: () => Promise<T>, reussi: (r: T) => string) {
    if (occupe) return;
    setOccupe(cle); setMessage(null);
    try {
      const r = await f();
      if (r.error) { setMessage({ texte: r.error, erreur: true }); return; }
      const t = reussi(r);
      setMessage({ texte: t, erreur: false });
      toast(t);
      router.refresh();
    } finally {
      setOccupe(null);
    }
  }
  return { occupe, message, geste };
}

function Composition(p: Extract<PropsActionsLot, { mode: 'composition' }>) {
  const { occupe, message, geste } = useGeste();
  const noms = p.variantes.map((v) => v.nom).filter((x): x is string => !!x);
  const { toast } = useSpatial();
  return (
    <section className="tile sec" aria-label="Composer et préparer le lot">
      <h2>Composer et préparer</h2>
      <div className="lbl" style={{ marginTop: 12 }}>Dans ce lot</div>
      <div className="tl">
        {p.variantes.map((v) => (
          <div className="ev" key={v.id}>
            <span className="ico"><Ic n="img" /></span>
            <span><strong>{v.variante}</strong> · {v.concept}<br /><span className="faint" style={{ fontSize: '11.5px' }}>{v.manques.length ? `Il manque ${v.manques.join(', ')}` : v.nom ? `Nom régie · ${v.nom}${v.adset ? ` · ad set ${v.adset}` : ''}` : 'Complète · nom régie généré à la préparation'}</span>
              {v.blocage && <><br /><span style={{ fontSize: '11.5px', color: 'var(--warn)' }}>{v.blocage}</span></>}
              {v.avis && <><br /><span className="faint" style={{ fontSize: '11.5px' }}>Avant lancement · {v.avis}</span></>}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <Lien className="btn sm" href={lienFicheTest(v.id)}>Fiche</Lien>
              <button className="btn sm" type="button" disabled={!!occupe} onClick={() => geste(`retirer-${v.id}`, () => setBatchAdAction({ batchId: p.lotId, adId: v.id, inBatch: false }), () => `${v.variante} retirée du lot`)}>Retirer</button>
            </span>
          </div>
        ))}
        {p.variantes.length === 0 && <div className="ev"><span className="ico"><Ic n="img" /></span><span className="faint">Aucune variante · ajoute-en depuis les variantes disponibles.</span><span /></div>}
      </div>
      <div className="lbl" style={{ marginTop: 16 }}>Variantes disponibles (rangées dans aucun lot)</div>
      <div className="tl">
        {p.vivier.map((v) => (
          <div className="ev" key={v.id}>
            <span className="ico"><Ic n="plus" /></span>
            <span><strong>{v.variante}</strong> · {v.concept}{v.manques.length > 0 && <><br /><span className="faint" style={{ fontSize: '11.5px' }}>Il manque {v.manques.join(', ')}</span></>}</span>
            <button className="btn sm" type="button" disabled={!!occupe} onClick={() => geste(`ajouter-${v.id}`, () => setBatchAdAction({ batchId: p.lotId, adId: v.id, inBatch: true }), () => `${v.variante} ajoutée au lot`)}>Ajouter</button>
          </div>
        ))}
        {p.vivier.length === 0 && <div className="ev"><span className="ico"><Ic n="plus" /></span><span className="faint">Aucune variante libre · crée une itération depuis une gagnante, ou prépare une créa dans un projet Studios.</span><Lien className="btn sm" href={CHEMIN_NOUVEAU_PROJET}>Préparer un projet</Lien></div>}
      </div>
      {p.brief && (
        <>
          <div className="lbl" style={{ marginTop: 16 }}>Brief à recopier dans le gestionnaire de publicités</div>
          <div className="tl">
            <div className="ev"><span className="ico"><Ic n="tag" /></span><span>Campagne</span><strong>{p.brief.campagne}</strong></div>
            <div className="ev"><span className="ico"><Ic n="grid" /></span><span>Structure</span><strong>{p.brief.structure}</strong></div>
            <div className="ev"><span className="ico"><Ic n="cal" /></span><span>Budget et durée</span><strong className="num">{p.brief.budgetJour} € / jour / variante · {p.brief.jours} jours</strong></div>
            <div className="ev"><span className="ico"><Ic n="users" /></span><span>Audience</span><strong>{p.brief.audience}</strong></div>
            <div className="ev"><span className="ico"><Ic n="chart" /></span><span>Budget total (rien n’est dépensé ici)</span><strong className="num">{budgetPrevuLot(p.brief.total, p.variantes.length)}</strong></div>
          </div>
          <p className="faint" style={{ fontSize: '12.5px', marginTop: 8 }}>{p.brief.conclusivite}</p>
        </>
      )}
      <div className="foot2" style={{ marginTop: 14 }}>
        <button className="btn pri sm" type="button" disabled={!!occupe || p.variantes.length === 0} onClick={() => geste('preparer', () => prepareBatchAction(p.lotId), (r) =>
          r.skipped?.length ? `${r.named ?? 0} nom(s) générés · ${r.skipped.length} variante(s) à compléter (${r.skipped.map((s) => s.variantCode).join(', ')})` : `${r.named ?? 0} nom(s) générés · ${r.ready ?? 0} variante(s) prêtes`)}>
          {occupe === 'preparer' ? 'Préparation…' : 'Préparer le lot'}
        </button>
        {noms.length > 0 && (
          <button className="btn sm" type="button" onClick={() => { navigator.clipboard?.writeText(noms.join('\n')).then(() => toast('Noms copiés'), () => toast('Copie impossible ici · sélectionne les noms')); }}><Ic n="copy" />Copier les noms</button>
        )}
        {p.pret && (
          <button className="btn sm" type="button" disabled={!!occupe} onClick={() => geste('lancer', () => launchBatchAction(p.lotId), () => 'Lot marqué lancé · la fenêtre d’évaluation démarre')}>
            {occupe === 'lancer' ? 'Lancement…' : 'Marquer le lot lancé'}
          </button>
        )}
        <small>{message ? message.texte : p.pret ? 'Lance les annonces dans Meta avec ces noms, puis marque le lot lancé · rien n’est créé dans Meta depuis l’outil.' : 'Préparer génère les noms attendus côté régie et passe en « prêt » ce qui est complet.'}</small>
      </div>
    </section>
  );
}

function Arbitrage(p: Extract<PropsActionsLot, { mode: 'arbitrage' }>) {
  const { occupe, message, geste } = useGeste();
  const [enonces, setEnonces] = useState<Record<string, string>>({});
  const [portees, setPortees] = useState<Record<string, ValidateInput['learning']['scope']>>({});
  return (
    <section className="tile sec" aria-label="Conclure le lot">
      <h2>Conclure le lot</h2>
      <p className="muted" style={{ fontSize: '12.5px', marginTop: 4 }}>Un verdict ne se valide qu’avec ce qu’il t’apprend · une phrase complète, réutilisable sur la prochaine créa.</p>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {p.aArbitrer.map((v) => (
          <form className="blform" key={v.id} onSubmit={(e) => {
            e.preventDefault();
            void geste(`valider-${v.id}`, () => validateVerdictAction({ adId: v.id, value: v.calcule, learning: { statement: enonces[v.id] ?? '', scope: portees[v.id] ?? 'ad', confidence: 3 } }), () => `${v.variante} · verdict validé, apprentissage enregistré`);
          }}>
            <strong>{v.variante} · {v.verdict}</strong>
            {v.raison && <span className="faint" style={{ fontSize: '12px' }}>{v.raison}</span>}
            <textarea value={enonces[v.id] ?? ''} onChange={(e) => setEnonces((x) => ({ ...x, [v.id]: e.target.value }))} maxLength={600} placeholder="Ce que cette variante t’apprend…" aria-label={`Apprentissage de ${v.variante}`} />
            <div className="kc">
              {PORTEES.map(([cle, libelle]) => (
                <button type="button" className="chip" key={cle} aria-pressed={(portees[v.id] ?? 'ad') === cle} onClick={() => setPortees((x) => ({ ...x, [v.id]: cle }))}>{libelle}</button>
              ))}
              <button className="btn sm pri" type="submit" disabled={!!occupe} style={{ marginLeft: 'auto' }}>{occupe === `valider-${v.id}` ? 'Validation…' : 'Valider le verdict'}</button>
            </div>
          </form>
        ))}
      </div>
      {message && <p className="faint" role={message.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', marginTop: 10 }}>{message.texte}</p>}
    </section>
  );
}
