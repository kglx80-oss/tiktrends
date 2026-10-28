'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { RELECTURE_CREATIONS_MS, valeursRattachement, type ValeursRattachement } from '@tiktrends/core';
import { creerVariante, iterer } from '../../../app/actions/studios/variantes';
import { rattacherVarianteAuTest, relireApprentissage } from '../../../app/actions/studios/tests';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Ad, Message } from './briques';
import { FormulaireRattachement, LotEssai, type Saisie } from './Rattachement';
import type { LotSpatial, PropsCreationsProjet, SortieSpatiale, VarianteSpatiale } from './types';

/**
 * Onglet « Créations » · la grille de la maquette (`div.lib2`, une `figure`
 * par création) avec les sorties RÉELLES des lots du projet et leur état réel
 * (en file, en cours, échec, prête) · jamais un rendu simulé. Puis, dans les
 * tuiles Spatial, ce que la fiche V5 portait ici : variantes et tests
 * (choisir, itérer, relire l'apprentissage, rattacher à un test Adsmap,
 * préparer un lot d'essai), tâches de génération.
 *
 * Tant qu'un lot travaille, la page se relit toutes les 4 s (lecture seule).
 */
export function OngletCreations(p: PropsCreationsProjet) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string } | null>(null);
  const [relireOuverte, setRelireOuverte] = useState<string | null>(null);
  // Le formulaire « Rattacher au test » ouvert, et la saisie d'un plan d'essai qui le préremplit.
  const [rattacher, setRattacher] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Record<string, Saisie>>({});
  const aujourdHui = new Date().toISOString().slice(0, 10);

  async function envoyerTest(variantId: string, v: ValeursRattachement) {
    const r = await rattacherVarianteAuTest({ variantId, saisie: v });
    if (!r.ok) return r;
    const texte = r.deja ? 'Cette variante était déjà rattachée · fiche Adsmap inchangée.' : 'Variante rattachée · la fiche Adsmap est en brouillon.';
    setRattacher(null); setRetour({ ton: 'ok', texte }); toast(texte); router.refresh();
    return { ok: true as const };
  }
  const ouvrirAvecPlan = (variantId: string, saisie: Saisie) => {
    setPrefill((p) => ({ ...p, [variantId]: saisie }));
    setRattacher(variantId);
    document.querySelector(`[data-variante="${variantId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    if (!p.relire) return;
    const t = setTimeout(() => router.refresh(), RELECTURE_CREATIONS_MS);
    return () => clearTimeout(t);
  }, [p.relire, p.lots, router]);

  async function geste(cle: string, f: () => Promise<{ ok: boolean; message?: string; traceId?: string; code?: string }>, succes: string) {
    setEnCours(cle); setRetour(null);
    try {
      const r = await f();
      if (!r.ok) {
        setRetour({ ton: 'err', texte: r.code === 'VERSION_CONFLICT' ? 'Le projet a changé depuis l’ouverture de cette page · recharge-la, puis recommence. Rien n’a été écrasé.' : `${r.message ?? 'Refusé.'}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}` });
        return;
      }
      setRetour({ ton: 'ok', texte: succes });
      toast(succes);
      router.refresh();
    } catch {
      setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.' });
    } finally {
      setEnCours(null);
    }
  }

  const figures = p.lots.flatMap((l): Array<{ cle: string; lot: LotSpatial; sortie: SortieSpatiale | null }> => (l.sorties.length
    ? l.sorties.map((s) => ({ cle: s.assetId, lot: l, sortie: s }))
    : [{ cle: l.jobId, lot: l, sortie: null }]));

  return (
    <>
      {figures.length === 0 ? (
        <section className="tile">
          <div className="lbl">Créations</div>
          <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>{p.messageVide}</p>
          <div className="kc" style={{ marginTop: 12 }}>
            {p.preparerHref && <Lien className="btn sm pri" href={p.preparerHref}><Ic n="spark" />Préparer une création</Lien>}
            {p.videoHref && <Lien className="btn sm" href={p.videoHref}><Ic n="phone" />Studio vidéo</Lien>}
          </div>
        </section>
      ) : (
        <div className="lib2">
          {figures.map(({ cle, lot, sortie }) => (
            <figure key={cle} data-lot={lot.jobId} data-etat={lot.etat.libelle}>
              {sortie?.apercu
                ? <Ad src={sortie.apercu} classe="nob" alt={sortie.libelle} />
                : <div className="ad nob"><div className="ph" /><div className="band" /></div>}
              <div className="rights">
                <strong>{sortie ? sortie.libelle : lot.titre}</strong>
                <span className={lot.etat.pret ? 'faint' : `pill ${lot.etat.classe}`}>{lot.etat.pret ? (lot.qualite ?? lot.etat.libelle) : lot.etat.libelle}</span>
              </div>
              {!sortie && lot.message && <small className="faint" style={{ fontSize: '11.5px' }}>{lot.message}</small>}
              {sortie && (
                <div className="kc">
                  {/* « Ouvrir l'image » de la fiche V5 · la sortie en grand, dans un nouvel onglet (route média, droits relus). */}
                  {sortie.apercu && <a className="btn sm" href={sortie.apercu} target="_blank" rel="noopener noreferrer" data-ouvrir-image=""><Ic n="eye" />Ouvrir</a>}
                  {p.editeurHref && <Lien className="btn sm" href={p.editeurHref}><Ic n="brush" />Éditer</Lien>}
                  {sortie.choisir && (
                    <button className="btn sm" type="button" disabled={!!enCours} title="Retenir cette sortie comme variante · aucun coût"
                      onClick={() => void geste(`choisir:${sortie.assetId}`, () => creerVariante({ assetId: sortie.assetId }), `${sortie.libelle} est maintenant une variante.`)}>
                      <Ic n="check" />{enCours === `choisir:${sortie.assetId}` ? 'Enregistrement…' : 'Retenir'}
                    </button>
                  )}
                  {sortie.varianteId && <span className="pill g">Variante</span>}
                </div>
              )}
            </figure>
          ))}
        </div>
      )}
      {retour && <div className="sec"><Message ton={retour.ton}>{retour.texte}</Message></div>}

      <section className="tile sec" id="variantes">
        <div className="sech" style={{ margin: 0 }}><h2>Variantes et tests</h2><span className="faint" style={{ fontSize: '12.5px' }}>Une variante = une sortie retenue, prête à être testée</span>
        </div>
        {p.peutProposer && p.adsmap && !p.adsmap.acces && p.variantes.some((v) => !v.test) && (
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 6 }}>Le rattachement à un test passe par Adsmap, disponible à partir de l’offre Plus.</p>
        )}
        {p.erreurVariantes ? <Message ton="err">{p.erreurVariantes}</Message> : p.variantes.length === 0 ? (
          <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Aucune variante · retiens une sortie livrée pour la tester.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
            {p.variantes.map((v) => (
              <CarteVariante key={v.id} v={v} enCours={enCours} relecture={p.relecture} ouverte={relireOuverte === v.id}
                surRattacher={p.adsmap?.acces && v.gestes.rattacher ? () => setRattacher((o) => (o === v.id ? null : v.id)) : null}
                formulaire={rattacher === v.id && p.adsmap ? (
                  <FormulaireRattachement key={`${v.id}:${prefill[v.id] ? 'essai' : 'libre'}`} idVariante={v.id} adsmap={p.adsmap} aUnParent={v.rattachement.aUnParent}
                    initial={valeursRattachement({
                      hypothese: prefill[v.id]?.hypothese ?? v.rattachement.hypothese, variable: prefill[v.id]?.variable ?? v.rattachement.variable,
                      valeurVariable: prefill[v.id]?.valeurVariable ?? null, protocole: p.adsmap.protocoleMarque, aujourdHui,
                    })}
                    envoyer={(x) => envoyerTest(v.id, x)} fermer={() => setRattacher(null)} />
                ) : null}
                surIterer={() => p.versionCouranteId && void geste(`iterer:${v.id}`, () => iterer({ variantId: v.id, baseVersionId: p.versionCouranteId }), `Nouveau brief créé depuis ${v.libelle} · aucune génération lancée.`)}
                surOuvrirRelecture={() => setRelireOuverte((o) => (o === v.id ? null : v.id))}
                surRelire={() => void geste(`relire:${v.id}`, async () => {
                  const r = await relireApprentissage({ linkId: v.lienTest, coutAnnonceUsd: p.relecture.coutMaxUsd });
                  if (r.ok && r.indisponible) return { ok: false, message: r.indisponible.message };
                  return r;
                }, 'Relecture enregistrée · la conclusion reste celle que les données permettent.')} />
            ))}
          </div>
        )}
      </section>

      {p.peutProposer && !p.erreurVariantes && p.lots.length > 0 && (
        <LotEssai projectId={p.projectId} variantes={p.variantes.map((v) => ({ id: v.id, libelle: v.libelle, version: v.version }))} ouvrirRattachement={ouvrirAvecPlan} />
      )}

      <section className="tile sec" id="taches">
        <div className="sech" style={{ margin: 0 }}><h2>Tâches</h2><span className="faint" style={{ fontSize: '12.5px' }}>Les générations de ce projet et leur état réel · rien n’est relancé d’ici</span></div>
        {p.erreurTaches ? <Message ton="err">{p.erreurTaches}</Message> : !p.taches || p.taches.length === 0 ? (
          <p className="muted" style={{ fontSize: '12.5px', marginTop: 10 }}>Aucune tâche lancée pour ce projet.</p>
        ) : (
          <div className="tl">
            {p.taches.map((t) => (
              <div className="ev" key={t.id} data-tache={t.id}>
                <span className="ico"><Ic n={t.interrompue ? 'warn' : 'spark'} /></span>
                <span>{t.detail}<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{t.explication}{t.interrompue ? ' · relance bloquée jusqu’au rapprochement du coût.' : ''}</small></span>
                <span className={`pill ${t.classe}`}>{t.titre}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CarteVariante({ v, enCours, relecture, ouverte, surIterer, surOuvrirRelecture, surRelire, surRattacher, formulaire }: {
  v: VarianteSpatiale; enCours: string | null; relecture: PropsCreationsProjet['relecture']; ouverte: boolean;
  surIterer: () => void; surOuvrirRelecture: () => void; surRelire: () => void;
  /** « Rattacher au test » · absent sans accès Adsmap, sans droit, ou quand un test est déjà ouvert. */
  surRattacher: (() => void) | null; formulaire: ReactNode;
}) {
  return (
    <div className="prow" data-variante={v.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {v.apercu && <img src={v.apercu} alt={v.libelle} />}
      <div className="t">
        <strong style={{ fontSize: '12.5px' }}>{v.libelle} · {v.version}</strong>
        <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.statut} · variable : {v.variable}</small>
        <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.hypothese}</small>
        <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{v.comparaison}</small>
        {v.test && <small style={{ display: 'block', fontSize: '11.5px' }}>{v.test.resume} · {v.test.verdict}</small>}
        {v.lecture && <small style={{ display: 'block', fontSize: '11.5px' }}>{v.lecture.conclusion} · {v.lecture.phrase}</small>}
        {ouverte && (
          <div className="sugg" style={{ marginTop: 8 }}>
            <p style={{ fontSize: '12.5px' }}>Jarvis relit le test et propose l’apprentissage · {relecture.mention ?? 'coût annoncé indisponible'}</p>
            {!relecture.disponible && <p className="faint" style={{ fontSize: '11.5px' }}>{relecture.raison}</p>}
          </div>
        )}
      </div>
      <div className="kc">
        {v.test && <Lien className="btn sm" href={v.test.href}><Ic n="chart" />Adsmap</Lien>}
        {surRattacher && <button className="btn sm" type="button" data-geste="rattacher" aria-expanded={!!formulaire} onClick={surRattacher}><Ic n="flask" />Rattacher au test</button>}
        {v.gestes.iterer && <button className="btn sm" type="button" disabled={!!enCours} onClick={surIterer}><Ic n="loop" />{enCours === `iterer:${v.id}` ? 'Itération…' : 'Itérer'}</button>}
        {v.gestes.relire && v.lienTest && relecture.coutMaxUsd !== null && (ouverte
          ? <button className="btn sm pri" type="button" disabled={!!enCours || !relecture.disponible} onClick={surRelire}>{enCours === `relire:${v.id}` ? 'Relecture…' : 'Confirmer la relecture'}</button>
          : <button className="btn sm" type="button" disabled={!!enCours} onClick={surOuvrirRelecture}><Ic n="bulb" />Relire</button>)}
      </div>
      {formulaire}
    </div>
  );
}
