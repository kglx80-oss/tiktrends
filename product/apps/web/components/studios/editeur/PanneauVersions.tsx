'use client';

import { useEffect, useState } from 'react';
import { annonceRestauration, CIBLE_TACTILE_MIN, decisionRestauration } from '@tiktrends/core';
import { apercuVersionDocument, listerVersionsDocument, restaurerVersionDocument } from '../../../lib/studios/editeur/actions';
import type { ApercuVersion, VersionListee, VersionRestauree } from '../../../lib/studios/editeur/types';
import { SurfaceDocument } from './SurfaceDocument';
import { bouton, boutonInactif, boutonPrimaire, legende, panneau, titrePanneau } from './styles';

/**
 * Versions du projet dans l'éditeur (spec UX V2 § 3 · « auteur, date, aperçu,
 * comparaison et restauration non destructive »).
 *
 * Lecture : la liste puis, pour une version choisie, son aperçu et ce que sa
 * restauration changerait par rapport à la courante (phrases du noyau).
 * Restaurer crée une NOUVELLE version au contenu de celle-ci, par le chemin
 * d'enregistrement (`studio.propose`, base obligatoire, 409) · ce qui va se
 * passer est écrit au-dessus du bouton, avant le clic. Rien n'est effacé.
 */

type Etat<T> = { etat: 'chargement' } | { etat: 'ok'; valeur: T } | { etat: 'erreur'; message: string };

const message = (r: { message: string; traceId?: string }) => (r.traceId ? `${r.message} (identifiant support : ${r.traceId})` : r.message);
const HORS_LIGNE = 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.';
const date = (iso: string) => new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
const raisonCourte = (r: string) => {
  const s = r.replace(/^Éditeur de calques · /, '').trim();
  return s.length > 90 ? `${s.slice(0, 87)}…` : s;
};

export function PanneauVersions({
  id, projectId, base, editable, modifie, enCours, conflit, onRestauree,
}: {
  id: string;
  projectId: string;
  /** La version chargée dans l'éditeur · base de la restauration. */
  base: { id: string; n: number };
  editable: boolean;
  modifie: boolean;
  enCours: boolean;
  conflit: boolean;
  onRestauree: (r: VersionRestauree) => void;
}) {
  const [liste, setListe] = useState<Etat<VersionListee[]>>({ etat: 'chargement' });
  const [choisie, setChoisie] = useState<string | null>(null);
  const [apercu, setApercu] = useState<Etat<ApercuVersion> | null>(null);
  const [restauration, setRestauration] = useState<{ enCours: boolean; erreur: string | null }>({ enCours: false, erreur: null });

  useEffect(() => {
    let vivant = true;
    setListe({ etat: 'chargement' });
    void (async () => {
      let r: Awaited<ReturnType<typeof listerVersionsDocument>> | null = null;
      try { r = await listerVersionsDocument(projectId); } catch { r = null; }
      if (!vivant) return;
      setListe(!r ? { etat: 'erreur', message: HORS_LIGNE } : r.ok ? { etat: 'ok', valeur: r.versions } : { etat: 'erreur', message: message(r) });
    })();
    return () => { vivant = false; };
  }, [projectId, base.id]);

  const comparer = async (versionId: string) => {
    if (choisie === versionId) { setChoisie(null); setApercu(null); return; }
    setChoisie(versionId);
    setApercu({ etat: 'chargement' });
    setRestauration({ enCours: false, erreur: null });
    let r: Awaited<ReturnType<typeof apercuVersionDocument>> | null = null;
    try { r = await apercuVersionDocument({ projectId, versionId }); } catch { r = null; }
    setApercu(!r ? { etat: 'erreur', message: HORS_LIGNE } : r.ok ? { etat: 'ok', valeur: r.apercu } : { etat: 'erreur', message: message(r) });
  };

  const restaurer = async (v: VersionListee) => {
    setRestauration({ enCours: true, erreur: null });
    let r: Awaited<ReturnType<typeof restaurerVersionDocument>> | null = null;
    try { r = await restaurerVersionDocument({ projectId, versionId: v.id, baseVersionId: base.id }); } catch { r = null; }
    if (!r) { setRestauration({ enCours: false, erreur: `${HORS_LIGNE} Rien n’a été restauré.` }); return; }
    if (!r.ok) {
      setRestauration({
        enCours: false,
        erreur: r.code === 'VERSION_CONFLICT'
          ? 'Une autre session a enregistré une version entre-temps · rien n’a été restauré. Recharge la page pour partir de la version courante, puis recommence.'
          : message(r),
      });
      return;
    }
    setRestauration({ enCours: false, erreur: null });
    setChoisie(null);
    setApercu(null);
    onRestauree(r);
  };

  return (
    <section id={id} aria-labelledby={`${id}-titre`} data-panneau="versions" style={{ ...panneau, display: 'grid', gap: 12 }}>
      <h2 id={`${id}-titre`} style={titrePanneau}>Versions du projet</h2>
      <p style={legende}>Chaque enregistrement crée une version. Restaurer une ancienne version en crée une nouvelle · l’historique n’est jamais réécrit.</p>

      {liste.etat === 'chargement' && <p role="status" style={legende}>Chargement des versions…</p>}
      {liste.etat === 'erreur' && <p role="alert" style={{ ...legende, color: 'var(--err)' }}>{liste.message}</p>}
      {liste.etat === 'ok' && (
        <ol data-versions style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8 }}>
          {liste.valeur.map((v) => {
            const ouverte = choisie === v.id;
            const a = ouverte && apercu?.etat === 'ok' ? apercu.valeur : null;
            const decision = decisionRestauration({
              editable, modifie, enCours: enCours || restauration.enCours, conflit,
              estCourante: v.courante || v.id === base.id, sansDifference: a !== null && a.comparaison.phrases.length === 0,
            });
            return (
              <li key={v.id} data-version-n={v.n} style={{ display: 'grid', gap: 8, minWidth: 0, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>
                      Version {v.n}{v.courante ? <span data-courante style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: 'var(--ok)' }}>Courante</span> : null}
                    </p>
                    <p style={legende}>{date(v.creeLe)} · {v.auteur}</p>
                    {v.raison && <p title={v.raison} style={{ ...legende, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{raisonCourte(v.raison)}</p>}
                  </div>
                  <button type="button" onClick={() => void comparer(v.id)} aria-expanded={ouverte} aria-controls={`${id}-detail-${v.n}`} data-comparer={v.n} style={bouton}>
                    {ouverte ? 'Fermer' : v.courante ? 'Aperçu' : 'Aperçu et comparaison'}
                  </button>
                </div>

                {ouverte && (
                  <div id={`${id}-detail-${v.n}`} data-detail-version={v.n} style={{ display: 'grid', gap: 10 }}>
                    {apercu?.etat === 'chargement' && <p role="status" style={legende}>Chargement de la version {v.n}…</p>}
                    {apercu?.etat === 'erreur' && <p role="alert" style={{ ...legende, color: 'var(--err)' }}>{apercu.message}</p>}
                    {a && (
                      <>
                        {a.document
                          ? (
                            <div data-apercu-version style={{ maxWidth: 260 }}>
                              <SurfaceDocument doc={a.document} selection={null} apercus={a.apercus} editable={false} onSelect={() => undefined} onDeplacer={() => undefined} hauteurMax="240px" />
                            </div>
                          )
                          : <p style={legende}>{a.documentIllisible ? 'Le document de cette version ne se lit plus · pas d’aperçu.' : 'Pas de document image dans cette version.'}</p>}

                        {!v.courante && (
                          <div>
                            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Ce que la restauration change par rapport à la version {a.courante.n}</p>
                            {a.comparaison.phrases.length === 0
                              ? <p style={legende}>Aucune différence · cette version a le même contenu que la courante.</p>
                              : (
                                <ul data-comparaison style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4, fontSize: 13, color: 'var(--ink-2)' }}>
                                  {a.comparaison.phrases.map((p) => <li key={p}>{p}</li>)}
                                  {a.comparaison.tronquee && <li>Et d’autres différences.</li>}
                                </ul>
                              )}
                          </div>
                        )}

                        {!v.courante && (
                          <div style={{ display: 'grid', gap: 8 }}>
                            <p data-annonce-restauration style={{ ...legende, color: 'var(--ink-2)' }}>{annonceRestauration(v.n, base.n)}</p>
                            {!decision.permis && <p data-refus-restauration style={legende}>{decision.raison}</p>}
                            {restauration.erreur && <p role="alert" style={{ ...legende, color: 'var(--err)' }}>{restauration.erreur}</p>}
                            <div>
                              <button
                                type="button"
                                data-action="restaurer"
                                aria-disabled={!decision.permis}
                                onClick={() => { if (decision.permis) void restaurer(v); }}
                                style={{ ...boutonPrimaire, minHeight: CIBLE_TACTILE_MIN, ...(!decision.permis ? boutonInactif : {}) }}
                              >
                                {restauration.enCours ? 'Restauration…' : 'Restaurer cette version'}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
