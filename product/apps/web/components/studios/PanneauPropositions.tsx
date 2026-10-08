'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { changementDepuisSaisie, reponsePourVue } from '@tiktrends/core';
import {
  listerPropositions, proposerPatch, proposerBrief, creerPropositionManuelle, appliquerProposition, rejeterProposition,
} from '../../app/actions/studios/propositions';
import type { ErreurProposition, ListePropositions, PropositionPresentee, ReponseProposition } from '../../lib/studios/propositions/types';
import { CarteProposition } from './propositions/CarteProposition';
import { ConflitVersion } from './propositions/ConflitVersion';
import { FormulaireDemande } from './propositions/FormulaireDemande';
import { AccesRefuse, Chargement, ErreurRecuperable, Vide, ERREUR_RESEAU } from './propositions/EtatsPanneau';
import { mini, panneau, signal, sousTitre, texte, titre } from './propositions/styles';

/**
 * Panneau des propositions d'un projet studio · autonome, à monter dans la
 * page projet (l'intégrateur le place ; aucune page ici).
 *
 * Il sépare strictement les quatre gestes du cahier (§4.3, §4.6) :
 *  · DEMANDER une proposition (Jarvis, appel texte payant annoncé, ou à la main) ;
 *  · la LIRE (cible et version visibles, avant/après, plan d'impact) ;
 *  · l'APPLIQUER (nouvelle version du document · rien généré, rien débité) ;
 *  · la REJETER.
 * Le devis et la génération restent hors de ce panneau (L3).
 *
 * FLOW-03 · une réponse qui arrive après un changement de projet est ignorée
 * (`reponsePourVue`). FLOW-06 · un 409 affiche les différences et propose de
 * recharger la version courante ; rien n'est écrasé.
 *
 * `initial` permet un premier rendu serveur (et le rendu des états en test).
 */

type Retour =
  | { type: 'succes'; message: string }
  | { type: 'questions'; questions: string[] }
  | { type: 'conflit'; erreur: ErreurProposition }
  | { type: 'erreur'; erreur: ErreurProposition }
  | { type: 'reseau' }
  | null;

type EnCours = { id: string; geste: 'appliquer' | 'rejeter' } | 'demande' | 'recharge' | null;

export interface PropsPanneau {
  projectId: string;
  versionCourante: { id: string; n: number };
  initial?: ReponseProposition<ListePropositions> | null;
  /** Prévient la page qu'une nouvelle version existe (application, rechargement). */
  onVersionChangee?: (v: { id: string; n: number }) => void;
}

const REFUS_ACCES = new Set(['FORBIDDEN', 'NOT_FOUND', 'AUTH_REQUIRED']);

export function PanneauPropositions({ projectId, versionCourante, initial, onVersionChangee }: PropsPanneau) {
  const initialValable = initial && (!initial.ok || initial.projectId === projectId) ? initial : null;
  const [liste, setListe] = useState<ReponseProposition<ListePropositions> | null>(initialValable);
  const [retour, setRetour] = useState<Retour>(null);
  const [enCours, setEnCours] = useState<EnCours>(null);
  const projet = useRef(projectId);
  projet.current = projectId;
  const premier = useRef(!!initialValable);

  /** Une réponse ne s'applique qu'au projet ENCORE ouvert (FLOW-03). */
  const pourCeProjet = (demandePour: string, r: { ok: boolean; projectId?: string | null }) =>
    reponsePourVue({ projectId: projet.current }, { projectId: r.ok ? (r.projectId ?? null) : demandePour });

  const charger = useCallback(async (geste: EnCours = null) => {
    const pour = projectId;
    if (geste) setEnCours(geste);
    try {
      const r = await listerPropositions({ projectId: pour });
      if (!pourCeProjet(pour, r as { ok: boolean; projectId?: string })) return;
      setListe(r);
      if (r.ok && r.versionCourante.id !== versionCourante.id) onVersionChangee?.(r.versionCourante);
    } catch {
      if (projet.current === pour) setRetour({ type: 'reseau' });
    } finally {
      if (projet.current === pour && geste) setEnCours(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, versionCourante.id]);

  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    setListe(null);
    setRetour(null);
    void charger();
  }, [projectId, versionCourante.id, charger]);

  const traiterErreur = (e: ErreurProposition) => setRetour(e.code === 'VERSION_CONFLICT' ? { type: 'conflit', erreur: e } : { type: 'erreur', erreur: e });

  async function geste<T extends { ok: boolean; projectId?: string }>(etat: EnCours, appel: () => Promise<T>, succes: (r: Extract<T, { ok: true }>) => void): Promise<boolean> {
    const pour = projectId;
    setEnCours(etat);
    setRetour(null);
    try {
      const r = await appel();
      if (!pourCeProjet(pour, r)) return false;
      if (!r.ok) { traiterErreur(r as unknown as ErreurProposition); return false; }
      succes(r as Extract<T, { ok: true }>);
      await charger();
      return true;
    } catch {
      if (projet.current === pour) setRetour({ type: 'reseau' });
      return false;
    } finally {
      if (projet.current === pour) setEnCours(null);
    }
  }

  const base = liste?.ok ? liste.versionCourante : versionCourante;

  const appliquer = (p: PropositionPresentee) => geste({ id: p.id, geste: 'appliquer' },
    () => appliquerProposition({ proposalId: p.id, projectId, baseVersionId: base.id }),
    (r) => {
      setRetour({ type: 'succes', message: r.deja
        ? `Déjà appliquée · version ${r.version.n}. Rien n’a été réécrit.`
        : `Proposition appliquée · version ${r.version.n} créée. Rien n’a été généré ni débité.` });
      onVersionChangee?.(r.version);
    });

  const rejeter = (p: PropositionPresentee) => geste({ id: p.id, geste: 'rejeter' },
    () => rejeterProposition({ proposalId: p.id, projectId }),
    () => setRetour({ type: 'succes', message: 'Proposition rejetée · rien n’a été modifié.' }));

  const demanderJarvis = ({ cible, demande }: { cible: string; demande: string }) => geste('demande',
    () => (cible === 'brief'
      ? proposerBrief({ projectId, baseVersionId: base.id, demande })
      : proposerPatch({ projectId, baseVersionId: base.id, cible, demande })),
    (r) => {
      if (r.statut === 'questions') setRetour({ type: 'questions', questions: r.questions });
      else setRetour({ type: 'succes', message: `Proposition reçue · ${r.proposition.libelleCibleVersion}. Rien n’est appliqué tant que tu ne l’as pas décidé.` });
    });

  const proposerMain = ({ cible, chemin, valeur, explication }: { cible: string; chemin: string; valeur: string; explication: string }) => {
    const c = liste?.ok ? liste.cibles.find((x) => x.cible === cible)?.champs.find((x) => x.chemin === chemin) : undefined;
    if (!c) return Promise.resolve(false);
    return geste('demande',
      () => creerPropositionManuelle({ projectId, baseVersionId: base.id, cible, changes: [changementDepuisSaisie(c, valeur, explication)], explication }),
      () => setRetour({ type: 'succes', message: 'Proposition enregistrée · relis l’avant/après puis applique-la si elle te convient.' }));
  };

  const recharger = () => { setRetour(null); void charger('recharge'); };

  const ouvertes = liste?.ok ? liste.propositions.filter((p) => p.etat === 'proposed').length : 0;

  return (
    <section aria-labelledby="titre-propositions" style={panneau} data-panneau="propositions">
      <header style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <h2 id="titre-propositions" style={titre}>Propositions</h2>
        <p style={sousTitre}>
          Version courante · version {base.n}{liste?.ok ? ` · ${ouvertes} à trancher` : ''}. Proposer et appliquer ne génère rien : la génération passe par un devis.
        </p>
      </header>

      {liste === null && <Chargement />}
      {liste && !liste.ok && (REFUS_ACCES.has(liste.code)
        ? <AccesRefuse erreur={liste} />
        : <ErreurRecuperable erreur={liste} onReessayer={() => void charger('recharge')} />)}

      {liste?.ok && (
        <>
          <FormulaireDemande cibles={liste.cibles} jarvis={liste.jarvis} peutProposer={liste.peutProposer} enCours={enCours === 'demande'}
            onDemanderJarvis={demanderJarvis} onProposerMain={proposerMain} />

          <div aria-live="polite" style={{ display: 'contents' }}>
            {retour?.type === 'succes' && <p role="status" style={signal('ok')}>{retour.message}</p>}
            {retour?.type === 'questions' && (
              <div role="status" style={signal('info')}>
                <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Jarvis a besoin d’une précision avant de proposer</p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 14 }}>{retour.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                <p style={{ ...mini, marginTop: 6 }}>Aucune proposition n’a été enregistrée · précise ta demande puis redemande.</p>
              </div>
            )}
            {retour?.type === 'reseau' && <p role="alert" style={signal('err')}>{ERREUR_RESEAU}</p>}
          </div>
          {retour?.type === 'conflit' && <ConflitVersion erreur={retour.erreur} onRecharger={recharger} enCours={enCours === 'recharge'} />}
          {retour?.type === 'erreur' && <ErreurRecuperable erreur={retour.erreur} />}

          {liste.propositions.length === 0
            ? <Vide peutProposer={liste.peutProposer} />
            : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[...liste.propositions].sort((a, b) => Number(b.etat === 'proposed') - Number(a.etat === 'proposed')).map((p) => (
                  <CarteProposition key={p.id} p={p} versionCouranteN={base.n} peutAgir={liste.peutProposer}
                    enCours={enCours && typeof enCours === 'object' && enCours.id === p.id ? enCours.geste : null}
                    onAppliquer={appliquer} onRejeter={rejeter} />
                ))}
              </div>
            )}
        </>
      )}
    </section>
  );
}

export default PanneauPropositions;
