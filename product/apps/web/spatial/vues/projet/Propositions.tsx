'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { annonceCibleJarvis, changementDepuisSaisie } from '@tiktrends/core';
import {
  appliquerProposition, creerPropositionManuelle, listerPropositions, proposerBrief, proposerPatch, rejeterProposition,
} from '../../../app/actions/studios/propositions';
import type { ErreurProposition, ListePropositions, PropositionPresentee, ReponseProposition } from '../../../lib/studios/propositions/types';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';
import { Message } from './briques';

/**
 * Les propositions du projet (tuile de l'onglet Brief) · les QUATRE gestes
 * séparés de la fiche V5 (`PanneauPropositions`) :
 *  · demander · à Jarvis (appel texte payant, coût maximal annoncé AVANT le
 *    clic) ou à la main (aucun appel) ;
 *  · lire · cible, version, avant / après ;
 *  · appliquer · nouvelle version du document, rien de généré ni débité ;
 *  · rejeter.
 * Elles visent TOUJOURS la version courante · un 409 le dit et propose de relire.
 */

type Retour = { ton: 'ok' | 'err'; texte: string; conflit?: boolean } | null;

const erreur = (e: ErreurProposition) => `${e.message}${e.traceId ? ` · identifiant support ${e.traceId}` : ''}`;

export function Propositions({ projectId, initial, versionCourante, cibleDemandee = null }: {
  projectId: string;
  initial: ReponseProposition<ListePropositions> | null;
  versionCourante: { id: string; n: number } | null;
  /** « Cibler Jarvis » depuis un nœud du canvas · choisit la cible et place le focus, n'envoie RIEN. */
  cibleDemandee?: { cible: string; libelle: string; jeton: number } | null;
}) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [liste, setListe] = useState(initial);
  const [retour, setRetour] = useState<Retour>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [mode, setMode] = useState<'jarvis' | 'main'>('jarvis');
  const ok = liste?.ok ? liste : null;
  const [cible, setCible] = useState(ok?.cibles[0]?.cible ?? '');
  const [demande, setDemande] = useState('');
  const champs = useMemo(() => ok?.cibles.find((c) => c.cible === cible)?.champs ?? [], [ok, cible]);
  const [chemin, setChemin] = useState('');
  const champ = champs.find((c) => c.chemin === chemin) ?? champs[0];
  const [valeur, setValeur] = useState<string | null>(null);
  const [explication, setExplication] = useState('');
  const base = ok?.versionCourante ?? versionCourante;
  const champDemande = useRef<HTMLTextAreaElement>(null);
  const [annonce, setAnnonce] = useState<string | null>(null);
  const [focaliser, setFocaliser] = useState(0);
  useEffect(() => {
    if (!cibleDemandee) return;
    const dispo = !!ok?.peutProposer && ok.cibles.some((c) => c.cible === cibleDemandee.cible);
    setAnnonce(annonceCibleJarvis(cibleDemandee.libelle, dispo));
    if (!dispo) return;
    setMode('jarvis'); setCible(cibleDemandee.cible); setChemin(''); setValeur(null);
    setFocaliser((n) => n + 1);
    // Un nouveau jeton seulement (un nouveau clic) relance le ciblage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cibleDemandee?.jeton]);
  useEffect(() => {
    if (!focaliser) return;
    champDemande.current?.scrollIntoView?.({ block: 'center' });
    champDemande.current?.focus({ preventScroll: true });
  }, [focaliser]);

  const recharger = useCallback(async () => {
    try { setListe(await listerPropositions({ projectId })); } catch { setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.' }); }
  }, [projectId]);

  async function geste<T extends { ok: boolean }>(cle: string, appel: () => Promise<T>, succes: (r: T) => string, apres?: () => void) {
    setEnCours(cle); setRetour(null);
    try {
      const r = await appel();
      if (!r.ok) {
        const e = r as unknown as ErreurProposition;
        setRetour({ ton: 'err', texte: e.code === 'VERSION_CONFLICT' ? 'Le projet a changé depuis l’ouverture de cette page · relis la version courante. Rien n’a été écrasé.' : erreur(e), conflit: e.code === 'VERSION_CONFLICT' });
        return;
      }
      const t = succes(r);
      setRetour({ ton: 'ok', texte: t });
      toast(t);
      apres?.();
      await recharger();
    } catch {
      setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie. Ta saisie est conservée.' });
    } finally {
      setEnCours(null);
    }
  }

  if (!versionCourante) return <p className="muted" style={{ fontSize: '12.5px' }}>Les propositions apparaîtront dès que le projet aura une première version.</p>;
  if (!liste) return <p className="muted" style={{ fontSize: '12.5px' }}>Les propositions n’ont pas pu être lues · recharge la page.</p>;
  if (!liste.ok) return <Message ton="err">{erreur(liste)}</Message>;

  const ouvertes = liste.propositions.filter((x) => x.etat === 'proposed').length;
  const premierBrief = champ?.forme === 'objectif-brief';
  const valeurCourante = valeur ?? champ?.valeur ?? '';
  const jarvisBloque = !liste.jarvis.disponible || !!enCours || !demande.trim();
  const mainBloque = !!enCours || !champ || valeurCourante === champ.valeur || (premierBrief && !valeurCourante.trim());

  const demanderJarvis = () => base && geste('demande',
    () => (cible === 'brief' ? proposerBrief({ projectId, baseVersionId: base.id, demande }) : proposerPatch({ projectId, baseVersionId: base.id, cible, demande })),
    (r) => (r.ok && r.statut === 'questions' ? `Jarvis a besoin d’une précision · ${r.questions.join(' · ')}. Rien n’a été enregistré.` : 'Proposition reçue · rien n’est appliqué tant que tu ne l’as pas décidé.'),
    () => setDemande(''));
  const proposerMain = () => base && champ && geste('demande',
    () => creerPropositionManuelle({ projectId, baseVersionId: base.id, cible, changes: [changementDepuisSaisie(champ, valeurCourante, explication)], explication }),
    () => 'Proposition enregistrée · relis l’avant / après puis applique-la si elle te convient.',
    () => { setValeur(null); setExplication(''); });
  const appliquer = (x: PropositionPresentee) => base && geste(`appliquer:${x.id}`,
    () => appliquerProposition({ proposalId: x.id, projectId, baseVersionId: base.id }),
    (r) => (r.ok ? (r.deja ? `Déjà appliquée · version ${r.version.n}. Rien n’a été réécrit.` : `Proposition appliquée · version ${r.version.n} créée. Rien n’a été généré ni débité.`) : ''),
    () => router.refresh());
  const rejeter = (x: PropositionPresentee) => geste(`rejeter:${x.id}`,
    () => rejeterProposition({ proposalId: x.id, projectId }),
    () => 'Proposition rejetée · rien n’a été modifié.');

  const triees = [...liste.propositions].sort((a, b) => Number(b.etat === 'proposed') - Number(a.etat === 'proposed'));

  return (
    <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
      <p className="muted" style={{ fontSize: '12.5px' }}>Version courante · version {liste.versionCourante.n} · {ouvertes} à trancher. Proposer et appliquer ne génère rien : la génération passe par un devis.</p>

      {liste.peutProposer && (
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="seg" role="group" aria-label="Origine de la proposition">
            <button type="button" aria-pressed={mode === 'jarvis'} onClick={() => setMode('jarvis')}>Demander à Jarvis</button>
            <button type="button" aria-pressed={mode === 'main'} onClick={() => setMode('main')}>Modifier à la main</button>
          </div>
          <label className="field">Cible
            <select value={cible} onChange={(e) => { setCible(e.target.value); setChemin(''); setValeur(null); }}>
              {liste.cibles.map((c) => <option key={c.cible} value={c.cible}>{c.libelle}</option>)}
            </select>
          </label>
          {mode === 'jarvis' ? (
            <>
              <label className="field">Ta demande<textarea ref={champDemande} className="ta" data-champ="demande-jarvis" value={demande} maxLength={4000} rows={3} onChange={(e) => setDemande(e.target.value)} placeholder="Ex. Corrige seulement le texte à l’écran, plus court" /></label>
              <p className="faint" style={{ fontSize: '11.5px' }} data-cout>{liste.jarvis.mentionCout}</p>
              {!liste.jarvis.disponible && <p className="faint" style={{ fontSize: '11.5px' }}>Indisponible · {liste.jarvis.raison}</p>}
              <div className="kc"><button className="btn pri sm" type="button" disabled={jarvisBloque} onClick={() => void demanderJarvis()}><Ic n="spark" />{enCours === 'demande' ? 'Jarvis prépare…' : 'Demander à Jarvis'}</button></div>
            </>
          ) : champs.length === 0 ? (
            <p className="faint" style={{ fontSize: '11.5px' }}>Cette cible n’a pas de champ texte modifiable à la main · choisis une autre cible.</p>
          ) : (
            <>
              <label className="field">Champ
                <select value={champ?.chemin ?? ''} onChange={(e) => { setChemin(e.target.value); setValeur(null); }}>
                  {champs.map((c) => <option key={c.chemin} value={c.chemin}>{c.libelle}</option>)}
                </select>
              </label>
              <label className="field">{premierBrief ? 'Que veux-tu créer ou vérifier ?' : 'Nouvelle valeur'}{champ?.forme === 'lignes' ? ' (une ligne par élément)' : ''}
                <textarea className="ta" value={valeurCourante} rows={3} maxLength={premierBrief ? 12000 : undefined} onChange={(e) => setValeur(e.target.value)} />
              </label>
              <label className="field">Pourquoi (facultatif)<input value={explication} maxLength={500} onChange={(e) => setExplication(e.target.value)} /></label>
              <p className="faint" style={{ fontSize: '11.5px' }}>Aucun appel à Jarvis, aucun coût · la modification devient une proposition à appliquer.</p>
              <div className="kc"><button className="btn pri sm" type="button" disabled={mainBloque} onClick={() => void proposerMain()}>{enCours === 'demande' ? 'Enregistrement…' : premierBrief ? 'Préparer mon brief' : 'Proposer cette modification'}</button></div>
            </>
          )}
        </div>
      )}

      {annonce && <Message ton="info">{annonce}</Message>}
      {retour && <Message ton={retour.ton}>{retour.texte}{retour.conflit && <> <button className="btn sm" type="button" onClick={() => { setRetour(null); router.refresh(); void recharger(); }}>Relire la version courante</button></>}</Message>}

      {triees.length === 0
        ? <p className="faint" style={{ fontSize: '12.5px' }}>{liste.peutProposer ? 'Aucune proposition pour l’instant · demande-en une à Jarvis ou modifie un champ à la main.' : 'Aucune proposition pour l’instant.'}</p>
        : (
          <div className="mtable">
            {triees.map((x) => (
              <div key={x.id} className="tile" style={{ display: 'grid', gap: 8 }} data-proposition={x.id} data-etat={x.etat}>
                <div className="kc" style={{ alignItems: 'center' }}>
                  <span className={`pill ${x.etat === 'proposed' ? 'c' : x.etat === 'approved' ? 'g' : ''}`}>{x.libelleEtat}</span>
                  <strong style={{ fontSize: 13 }}>{x.libelleCible}</strong>
                  <span className="faint" style={{ fontSize: '11.5px' }}>{x.libelleOrigine} · {x.libelleCibleVersion}</span>
                </div>
                {x.perimee && x.etat === 'proposed' && <p className="faint" style={{ fontSize: '11.5px' }}>Faite sur une version antérieure · l’appliquer rendra un conflit, rien ne sera écrasé.</p>}
                {x.changements.map((c, i) => (
                  <div key={`${c.chemin}-${i}`} style={{ display: 'grid', gap: 4 }}>
                    <span className="lbl">{c.libelle}</span>
                    {c.avant && <p className="faint" style={{ fontSize: '12.5px' }}>Avant · {c.avant}</p>}
                    <p style={{ fontSize: '12.5px' }}>Après · {c.apres || 'retiré'}</p>
                  </div>
                ))}
                {x.explication && <p className="muted" style={{ fontSize: '12.5px' }}>{x.explication}</p>}
                {x.impact && (x.impact.aRefaire.length > 0 || x.impact.obsoletes.length > 0) && (
                  <p className="faint" style={{ fontSize: '11.5px' }}>
                    À refaire · {x.impact.aRefaire.map((n) => n.libelle).join(', ') || 'rien'}{x.impact.obsoletes.length ? ` · devient obsolète : ${x.impact.obsoletes.map((n) => n.libelle).join(', ')}` : ''} · rien n’est lancé à l’application.
                  </p>
                )}
                {x.etat === 'proposed' && liste.peutProposer && (
                  <div className="kc">
                    <button className="btn pri sm" type="button" disabled={!!enCours} onClick={() => void appliquer(x)}><Ic n="check" />{enCours === `appliquer:${x.id}` ? 'Application…' : 'Appliquer'}</button>
                    <button className="btn sm" type="button" disabled={!!enCours} onClick={() => void rejeter(x)}><Ic n="x" />{enCours === `rejeter:${x.id}` ? 'Rejet…' : 'Rejeter'}</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
