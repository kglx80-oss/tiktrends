'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { accrocheNouveauConcept, verrouAction, MENTION_COUT_MESSAGE_CONCEPT, CHEMIN_PROJETS, type EtatNouveauProjet } from '@tiktrends/core';
import { demarrerConcept, type DemarrageConcept } from '../../../app/actions/studios/concept';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { TuileVide } from './briques';

/**
 * « Nouveau concept créatif » (`/studio/projets/nouveau/concept`), porté de
 * l'écran V5 (`NouveauConcept`) · l'entrée conversationnelle des Studios.
 *
 * LECTURE SEULE AU RENDU · rien n'est créé tant que rien n'est envoyé. Au
 * PREMIER message seulement :
 *  (a) `demarrerConcept` crée le projet (écriture canonique `creerProjet`) ET
 *      une conversation Jarvis LIÉE ;
 *  (b) le premier tour part vers Jarvis (POST `/api/jarvis/chat`, barrière de
 *      dépense `guardedAnthropic` · le coût d'un message est dit sous le champ) ;
 *  (c) on ouvre le projet créé, où le fil et les propositions persistent.
 * Anti double envoi · `verrouAction` pose un drapeau SYNCHRONE dans le tick du
 * clic · deux clics ne démarrent qu'UN concept.
 */
export function NouveauConcept({ etat, sous }: { etat: EtatNouveauProjet; sous: string }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [demarrage, setDemarrage] = useState<DemarrageConcept | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(verrouAction());

  async function envoyer() {
    const q = saisie.trim();
    if (!q || enCours || demarrage || etat.etat !== 'pret') return;
    if (!verrou.current.tenter()) return;
    setEnCours(true); setErreur(null);
    try {
      const r = await demarrerConcept();
      if (!r.ok) { setErreur(r.message); return; }
      const { projectId, conversationId } = r.demarrage;
      setDemarrage(r.demarrage);
      // Le projet créé est gardé même si Jarvis refuse ou si le réseau coupe · aucune relance implicite.
      const res = await fetch('/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q, conversationId, projectId }) });
      if (!res.ok) { const d = await res.json().catch(() => null) as { error?: string } | null; setErreur(d?.error || 'Jarvis n’a pas pu répondre.'); return; }
      if (!res.body) { setErreur('La réponse de Jarvis est indisponible · ouvre le concept pour vérifier la conversation.'); return; }
      const lecteur = res.body.getReader();
      for (;;) { const { done } = await lecteur.read(); if (done) break; }
      router.replace(`/studio/projets/${projectId}`);
    } catch {
      setErreur('La connexion s’est interrompue · si le concept a été créé, ouvre-le pour vérifier la conversation avant tout nouvel envoi.');
    } finally { setEnCours(false); verrou.current.relacher(); }
  }

  return (
    <Vue>
      <EnTete titre="Nouveau concept créatif" sous={sous} />
      {etat.etat === 'lecture-seule' && <TuileVide titre="Lecture seule" texte={etat.message} />}
      {etat.etat === 'sans-marque' && <TuileVide titre="Aucune marque active" texte={etat.message} action={<Lien className="btn sm" href={etat.lien.href} style={{ marginTop: 12 }}>{etat.lien.libelle}</Lien>} />}
      {etat.etat === 'pret' && (
        <section className="tile" data-concept="pret" style={{ display: 'grid', gap: 12, maxWidth: 760 }}>
          <div className="coach"><span className="orb">J</span><p data-accroche="">{accrocheNouveauConcept(etat.marque.nom)}</p></div>
          <textarea className="ta" rows={3} value={saisie} disabled={enCours || !!demarrage} aria-label="Décrire ton concept créatif" placeholder={`Décris ce que tu veux créer pour ${etat.marque.nom}…`}
            onChange={(e) => setSaisie(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(); } }} />
          <div className="kc">
            <button className="btn pri sm" type="button" data-envoi="pret" disabled={enCours || !!demarrage || !saisie.trim()} onClick={() => void envoyer()}
              title="Démarrer le concept · ton premier message crée le projet et la conversation"><Ic n="spark" />{enCours ? 'Démarrage…' : 'Envoyer'}</button>
            <Lien className="btn sm" href={CHEMIN_PROJETS}>Annuler</Lien>
            <small className="faint" style={{ fontSize: '11.5px' }} data-cout-message="">Ton premier message démarre le concept · {MENTION_COUT_MESSAGE_CONCEPT}</small>
          </div>
          {demarrage && !enCours && <Lien className="btn sm" href={`/studio/projets/${demarrage.projectId}`}>Ouvrir le concept créé et vérifier la conversation</Lien>}
          {erreur && <div className="banner" role="alert" data-concept-erreur="" style={{ margin: 0 }}><Ic n="x" /><span>{erreur}</span></div>}
        </section>
      )}
    </Vue>
  );
}
