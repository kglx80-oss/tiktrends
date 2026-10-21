'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { accrocheNouveauConcept, CIBLE_TACTILE_MIN, MENTION_COUT_MESSAGE_CONCEPT, verrouAction, type EtatNouveauProjet } from '@tiktrends/core';
import { Icon } from '../../Icon';
import { demarrerConcept, type DemarrageConcept } from '../../../app/actions/studios/concept';

const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/**
 * L'écran de création conversationnelle · « Nouveau concept créatif ».
 *
 * LECTURE SEULE AU GET · ce composant n'écrit RIEN au rendu. La création est
 * DIFFÉRÉE au PREMIER message (mandat Kevin du 20/10) · ce n'est qu'à l'envoi que :
 *  (a) `demarrerConcept` crée le projet (écriture canonique `creerProjet`, #837)
 *      ET une conversation Jarvis LIÉE (`projectId`) ;
 *  (b) le premier tour part vers Jarvis (POST `/api/jarvis/chat` · barrière de
 *      dépense `guardedAnthropic` · prix annoncé là, jamais ici) ;
 *  (c) on remplace l'URL par `/studio/projets/[id]` · le rechargement retombe sur
 *      le concept VIVANT, où le fil et les propositions persistent.
 * Rien n'est créé tant que rien n'est envoyé.
 *
 * Anti double-envoi · `verrouAction` (motif `JarvisChat`) pose un drapeau
 * SYNCHRONE dans le tick du clic · deux clics du même tick ne démarrent qu'UN
 * concept. Après création, la reprise ouvre le projet existant sans renvoyer
 * automatiquement le message ni démarrer un second projet.
 *
 * Les états viennent du noyau (`etatNouveauProjet`) · sans marque active, on
 * mène vers les marques ; en lecture seule, on le DIT.
 */
export function NouveauConcept({ etat }: { etat: EtatNouveauProjet }) {
  const router = useRouter();
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [demarrage, setDemarrage] = useState<DemarrageConcept | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(verrouAction());

  if (etat.etat === 'lecture-seule') {
    return <p data-concept="lecture-seule" style={{ ...note, maxWidth: 420 }}>{etat.message}</p>;
  }
  if (etat.etat === 'sans-marque') {
    return (
      <p data-concept="sans-marque" style={{ ...note, maxWidth: 420 }}>
        {etat.message} <a href={etat.lien.href} style={{ color: 'var(--accent-strong)' }}>{etat.lien.libelle}</a>
      </p>
    );
  }

  async function envoyer() {
    const q = saisie.trim();
    if (!q || enCours || demarrage) return;
    // Drapeau SYNCHRONE · deux clics du même tick ne démarrent qu'un concept.
    if (!verrou.current.tenter()) return;
    setEnCours(true);
    setErreur(null);
    try {
      const r = await demarrerConcept();
      if (!r.ok) { setErreur(r.message); return; }
      const { projectId, conversationId } = r.demarrage;
      setDemarrage(r.demarrage);
      // Conserver le projet créé même si Jarvis refuse ou si le réseau coupe.
      // Aucune relance implicite : le fil du projet permet d'inspecter l'état.
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q, conversationId, projectId }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null) as { error?: string } | null;
        setErreur(detail?.error || 'Jarvis n’a pas pu répondre.');
        return;
      }
      if (!res.body) {
        setErreur('La réponse de Jarvis est indisponible. Ouvre le concept pour vérifier la conversation.');
        return;
      }
      const lecteur = res.body.getReader();
      for (;;) { const { done } = await lecteur.read(); if (done) break; }
      router.replace(`/studio/projets/${projectId}`);
    } catch {
      setErreur('La connexion s’est interrompue. Si le concept a été créé, ouvre-le pour vérifier la conversation avant tout nouvel envoi.');
    } finally {
      setEnCours(false);
      verrou.current.relacher();
    }
  }

  return (
    <section data-concept="pret" style={{ maxWidth: 760, display: 'grid', gap: 16 }}>
      <p data-accroche style={{ margin: 0, fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 500, color: 'var(--ink)', lineHeight: 1.35 }}>
        {accrocheNouveauConcept(etat.marque.nom)}
      </p>

      <div data-composeur data-cadre="controle" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 24, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(); } }}
          rows={2}
          disabled={enCours}
          placeholder={`Décris ce que tu veux créer pour ${etat.marque.nom}…`}
          aria-label="Décrire ton concept créatif"
          style={{ width: '100%', minHeight: 60, boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: 16, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, outline: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <span data-cout-message style={{ ...note, color: 'var(--muted)' }}>Ton premier message démarre le concept · {MENTION_COUT_MESSAGE_CONCEPT}</span>
          {/* Envoi RÉEL · le premier message crée le concept (projet + conversation
              liée) puis part vers Jarvis. Rien n'est créé tant que rien n'est envoyé. */}
          <button
            type="button"
            onClick={() => void envoyer()}
            disabled={enCours || !!demarrage || !saisie.trim()}
            aria-disabled={enCours || !!demarrage || !saisie.trim() || undefined}
            data-envoi="pret"
            title="Démarrer le concept · ton premier message crée le projet et la conversation"
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: '0 16px', borderRadius: 999, border: 'none', background: enCours || !saisie.trim() ? 'var(--line-2)' : 'var(--grad-accent)', color: enCours || !saisie.trim() ? 'var(--muted)' : 'var(--on-accent)', cursor: enCours || !saisie.trim() ? 'default' : 'pointer', fontSize: 14, fontWeight: 600 }}
          >
            <Icon name="spark" size={16} /> {enCours ? 'Démarrage…' : 'Envoyer'}
          </button>
        </div>
      </div>

      {demarrage && !enCours && <a href={`/studio/projets/${demarrage.projectId}`} style={{ color: 'var(--accent-strong)' }}>Ouvrir le concept créé et vérifier la conversation</a>}
      {erreur && <p role="alert" data-concept-erreur style={{ ...note, color: 'var(--err-text)' }}>{erreur}</p>}
    </section>
  );
}
