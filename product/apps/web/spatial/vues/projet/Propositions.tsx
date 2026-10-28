'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  RAISON_LECTEUR_PROPOSITIONS, annonceCibleJarvis, changementDepuisSaisie, differencesConflit, lectureImpact, noteEtatProposition, proseAffichee,
} from '@tiktrends/core';
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
 * Elles visent TOUJOURS la version courante · un 409 le dit, montre ce qui a
 * changé depuis la base, et propose de relire.
 *
 * Porté aussi de la carte V5 · état daté (base périmée AVANT le clic, expirée,
 * appliquée, rejetée), raison de chaque changement, plan d'impact (coût
 * indicatif non débité, rien n'est généré), sources citées, raison quand le
 * rôle ne peut pas trancher, « Réessayer » sur une lecture échouée, et le
 * focus qui suit le retour d'un geste. Une liste d'un AUTRE projet n'est
 * jamais affichée (FLOW-03).
 */

type Retour = { ton: 'ok' | 'err'; texte: string; conflit?: { differences: ReturnType<typeof differencesConflit>; traceId: string } } | null;

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
  const [listeBrute, setListe] = useState(initial);
  // FLOW-03 · une liste d'un autre projet n'est jamais affichée.
  const liste = listeBrute && (!listeBrute.ok || listeBrute.projectId === projectId) ? listeBrute : null;
  const zoneRetour = useRef<HTMLDivElement>(null);
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

  // Le retour d'un geste prend le focus · un lecteur d'écran l'entend, le clavier repart de là.
  useEffect(() => { if (retour) zoneRetour.current?.focus({ preventScroll: true }); }, [retour]);

  const recharger = useCallback(async () => {
    try { setListe(await listerPropositions({ projectId })); } catch { setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.' }); }
  }, [projectId]);

  async function geste<T extends { ok: boolean }>(cle: string, appel: () => Promise<T>, succes: (r: T) => string, apres?: () => void) {
    setEnCours(cle); setRetour(null);
    try {
      const r = await appel();
      if (!r.ok) {
        const e = r as unknown as ErreurProposition;
        setRetour(e.code === 'VERSION_CONFLICT'
          ? { ton: 'err', texte: `Conflit de version · rien n’a été écrasé. ${e.message}`, conflit: { differences: differencesConflit(e.conflit?.differences), traceId: e.traceId } }
          : { ton: 'err', texte: erreur(e) });
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
  const reessayer = <button className="btn sm" type="button" data-reessayer="" onClick={() => { setRetour(null); void recharger(); }}>Réessayer</button>;
  if (!liste) return <div style={{ display: 'grid', gap: 8 }}><p className="muted" style={{ fontSize: '12.5px' }}>Les propositions n’ont pas pu être lues.</p>{retour && <Message ton={retour.ton}>{retour.texte}</Message>}<div className="kc">{reessayer}</div></div>;
  if (!liste.ok) return <div style={{ display: 'grid', gap: 8 }}><Message ton="err">{erreur(liste)}</Message>{liste.code !== 'NOT_FOUND' && liste.code !== 'FORBIDDEN' && <div className="kc">{reessayer}</div>}</div>;

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
      {retour && (
        <div ref={zoneRetour} tabIndex={-1} data-retour={retour.ton === 'ok' ? 'succes' : 'refus'} style={{ outline: 'none' }}>
          <Message ton={retour.ton}>{retour.texte}</Message>
          {retour.conflit && (
            <div style={{ display: 'grid', gap: 6 }} data-conflit="">
              {retour.conflit.differences.lignes.length > 0 && <span className="lbl">Ce qui a changé depuis la base · {retour.conflit.differences.lignes.length + retour.conflit.differences.reste}</span>}
              {retour.conflit.differences.lignes.map((d) => (
                <p key={d.chemin} className="faint" style={{ fontSize: '12px', overflowWrap: 'anywhere' }}><code>{d.chemin}</code> · {d.avant} → {d.apres}</p>
              ))}
              {retour.conflit.differences.reste > 0 && <p className="faint" style={{ fontSize: '12px' }}>… et {retour.conflit.differences.reste} autre(s)</p>}
              <div className="kc"><button className="btn sm" type="button" onClick={() => { setRetour(null); router.refresh(); void recharger(); }}>Relire la version courante</button></div>
              <p className="faint" style={{ fontSize: '11.5px' }}>Identifiant support · {retour.conflit.traceId}</p>
            </div>
          )}
        </div>
      )}

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
                {(() => { const n = noteEtatProposition(x, liste.versionCourante.n); return n && <p className={n.ton === 'warn' ? '' : 'faint'} role="note" data-note-etat={n.ton} style={{ fontSize: '11.5px' }}>{n.ton === 'warn' && <span className="pill w">À savoir</span>} {n.texte}</p>; })()}
                {/* La prose de Jarvis passe par `proseAffichee` (« — » rendu « · ») · l'avant / après jamais réécrit, c'est la valeur appliquée. */}
                {x.explication && <p className="muted" style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>{proseAffichee(x.explication, x.origine)}</p>}
                {x.changements.map((c, i) => (
                  <div key={`${c.chemin}-${i}`} style={{ display: 'grid', gap: 4 }} data-changement={c.chemin}>
                    <span className="lbl">{c.libelle} · {c.op === 'add' ? 'Ajout' : c.op === 'remove' ? 'Suppression' : 'Modification'}</span>
                    <p className="faint" style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>Avant · {c.avant || '(vide)'}</p>
                    <p style={{ fontSize: '12.5px', whiteSpace: 'pre-wrap' }}>Après · {c.apres || 'retiré'}</p>
                    {c.raison && <p className="faint" style={{ fontSize: '11.5px' }}>Raison · {proseAffichee(c.raison, x.origine)}</p>}
                  </div>
                ))}
                {x.etat === 'proposed' && (() => {
                  const l = lectureImpact(x.impact);
                  if (!l) return <p className="faint" style={{ fontSize: '11.5px' }}>Plan d’impact indisponible pour cette proposition.</p>;
                  return (
                    <div style={{ display: 'grid', gap: 4 }} data-impact="">
                      <span className="lbl">Impact si tu appliques</span>
                      {(l.sansMedia ? l.groupes.slice(0, 1) : l.groupes).map((g) => (
                        <p key={g.titre} className="faint" style={{ fontSize: '11.5px' }}><b>{g.titre}</b> · {g.elements.length ? g.elements.join(', ') : g.vide}</p>
                      ))}
                      {l.sansMedia && <p className="faint" style={{ fontSize: '11.5px' }}>{l.sansMedia}</p>}
                      <p className="faint" style={{ fontSize: '11.5px' }}>{l.cout}</p>
                      <p style={{ fontSize: '12px' }}><span className="pill g">Sans génération</span> {l.mention}</p>
                    </div>
                  );
                })()}
                {x.sources.length > 0 && <p className="faint" style={{ fontSize: '11.5px' }}>Sources citées · {x.sources.join(', ')}</p>}
                {x.etat === 'proposed' && liste.peutProposer && (
                  <div className="kc">
                    <button className="btn pri sm" type="button" disabled={!!enCours} onClick={() => void appliquer(x)}><Ic n="check" />{enCours === `appliquer:${x.id}` ? 'Application…' : 'Appliquer'}</button>
                    <button className="btn sm" type="button" disabled={!!enCours} onClick={() => void rejeter(x)}><Ic n="x" />{enCours === `rejeter:${x.id}` ? 'Rejet…' : 'Rejeter'}</button>
                  </div>
                )}
                {x.etat === 'proposed' && !liste.peutProposer && <p className="faint" style={{ fontSize: '11.5px' }} data-raison-lecteur="">{RAISON_LECTEUR_PROPOSITIONS}</p>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}
