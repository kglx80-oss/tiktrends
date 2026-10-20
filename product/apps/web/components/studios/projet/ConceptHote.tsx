'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN, MENTION_COUT_MESSAGE_CONCEPT, sansTiretCadratin, verrouAction, visibleWhileStreaming } from '@tiktrends/core';
import { chatThreadAction, type ChatThread, type ChatTurn } from '../../../app/actions/jarvis-chat';
import { Tour } from '../../../app/(app)/jarvis/JarvisChat';
import { PropositionsProjet } from './PropositionsProjet';
import { ActionsConcept } from './ActionsConcept';
import { useIsMobile } from '../../useIsMobile';
import { Icon } from '../../Icon';

/**
 * Concept créatif V5 · l'HÔTE de la conversation VIVANTE dans l'écran du concept
 * (= projet studio), mandat Kevin du 20/10. Il PORTE la conversation Jarvis
 * paramétrée par `projectId` et la met CÔTE À CÔTE avec la zone « créations »
 * (le panneau de propositions existant).
 *
 * ── Ce qui est réel, et ce qui ne l'est pas encore ───────────────────────────
 *
 * Le fil est chargé CÔTÉ SERVEUR par `conversationDuProjet` (via
 * `chatThreadAction({ projectId })`) · PAS par la clé localStorage de marque
 * (`tt_jarvis_conv_${brandId}`) · aucun mélange marque/concept, aucune
 * dépendance navigateur pour savoir quel fil appartient au concept. L'envoi passe
 * par la MÊME route que Jarvis (`/api/jarvis/chat`, barrière de dépense), avec
 * `conversationId` + `projectId` · le message de concept ne tombe jamais dans le
 * fil principal de la marque.
 *
 * La zone « créations/cartes » est le panneau de propositions EXISTANT
 * (`PropositionsProjet`) · on ne fabrique pas de fausses cartes. Au-dessus, les
 * ACTIONS TYPÉES du concept (`ActionsConcept`, PR6) proposent des gestes concrets
 * (directions visuelles, 3 accroches, scénario) qui demandent au serveur des
 * propositions BORNÉES à un chemin du brief · elles réapparaissent en cartes
 * choisissables dans le panneau, relues avant toute application. Le passage à la
 * génération (« Préparer la création ») reste grisé, non branché ici (PR7).
 *
 * Layout V5 · desktop = deux colonnes (conversation | créations) ; mobile =
 * deux onglets (Conversation / Créations) · jamais de débordement horizontal.
 */

const reponse: CSSProperties = {
  alignSelf: 'flex-start', maxWidth: 'min(760px, 92%)',
  color: 'var(--ink)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

type Onglet = 'conversation' | 'creations';

export function ConceptHote({ projectId, brandName, kind, generationImageActive, versionCourante, initialThread, initialErreur = null }: {
  projectId: string;
  brandName: string;
  /** Le type du projet (`ads`, `image`, `video`, `text`) · décide quelles actions typées sont pertinentes. */
  kind: string;
  /** État de la capacité d'espace `generation_image` · décide la raison de « Préparer la création » (grisée, PR7). */
  generationImageActive: boolean;
  /** La version COURANTE du concept · requise par le panneau de propositions. null → pas de propositions. */
  versionCourante: { id: string; n: number } | null;
  /** Le fil, lu CÔTÉ SERVEUR par projet · null si l'accès manque ou sans marque. */
  initialThread: ChatThread | null;
  initialErreur?: string | null;
}) {
  const isMobile = useIsMobile();
  // PR6 · une proposition typée reçue fait recharger les cartes du panneau (une
  // proposition ne crée pas de version · le panneau ne se rechargerait pas seul).
  const [signalRecharge, setSignalRecharge] = useState(0);
  const [thread, setThread] = useState<ChatThread | null>(initialThread);
  const [erreur, setErreur] = useState<string | null>(initialErreur);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const [onglet, setOnglet] = useState<Onglet>('conversation');
  const filRef = useRef<HTMLDivElement>(null);
  const verrou = useRef(verrouAction());

  // Le fil du concept, relu CÔTÉ SERVEUR (jamais par clé navigateur).
  const recharger = useCallback(async () => {
    const r = await chatThreadAction({ projectId });
    if (r.error) { setErreur(r.error); return; }
    setErreur(null);
    setThread(r.thread ?? null);
  }, [projectId]);

  useEffect(() => {
    // `scrollTo` peut manquer (jsdom) · on ne défile que s'il existe.
    filRef.current?.scrollTo?.({ top: filRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.turns.length, partiel]);

  async function envoyer() {
    const q = saisie.trim();
    if (!q || enCours) return;
    if (!verrou.current.tenter()) return;
    setSaisie('');
    setEnCours(true);
    setPartiel('');
    setErreur(null);
    const provisoire: ChatTurn = { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() };
    setThread((t) => (t ? { ...t, turns: [...t.turns, provisoire] } : t));
    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // `projectId` lie le tour au concept · la route n'écrit jamais dans le
        // fil principal de la marque (elle résout/relie la conversation du concept).
        body: JSON.stringify({ message: q, conversationId: thread?.conversationId ?? null, projectId }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        return;
      }
      const lecteur = res.body.getReader();
      const dec = new TextDecoder();
      let recu = '';
      for (;;) {
        const { done, value } = await lecteur.read();
        if (done) break;
        recu += dec.decode(value, { stream: true });
        setPartiel(recu);
      }
      setPartiel('');
      await recharger();
    } catch {
      setErreur('La connexion s’est interrompue. Ton message est enregistré, réessaie.');
    } finally {
      setEnCours(false);
      verrou.current.relacher();
    }
  }

  const vide = !thread || thread.turns.length === 0;

  const conversation = (
    <section data-pane="conversation" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, gap: 12 }}>
      <div ref={filRef} data-zone="fil" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 240, maxHeight: isMobile ? 'none' : '58vh', paddingRight: 2 }}>
        {vide && !enCours ? (
          <p style={{ ...reponse, color: 'var(--muted)' }}>
            Décris ce que tu veux créer pour {brandName} · Jarvis t’aide à cadrer le concept, puis chaque proposition reste à valider.
          </p>
        ) : (
          thread!.turns.map((t, i) => (
            <Tour key={t.id} turn={t} sources={thread!.sources ?? {}}
              question={t.role === 'assistant' && thread!.turns[i - 1]?.role === 'user' ? thread!.turns[i - 1]!.content : null} />
          ))
        )}
        {partiel && <div style={reponse}>{sansTiretCadratin(visibleWhileStreaming(partiel))}</div>}
        {enCours && !partiel && <div style={{ ...reponse, color: 'var(--muted)', fontStyle: 'italic' }}>Jarvis relit ta marque…</div>}
      </div>

      {erreur && <p role="alert" style={{ margin: 0, fontSize: 12.5, color: 'var(--err-text)', lineHeight: 1.5 }}>{erreur}</p>}

      <div data-cadre="controle" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, padding: isMobile ? 12 : 14, borderRadius: 20, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(); } }}
          rows={1}
          disabled={enCours}
          aria-label="Écrire à Jarvis sur ce concept"
          placeholder={`Continue le concept pour ${brandName}…`}
          style={{ flex: 1, minWidth: 0, minHeight: 40, boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent', color: 'var(--ink)', fontSize: isMobile ? 16 : 15, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, outline: 'none' }}
        />
        <button
          type="button" aria-label="Envoyer à Jarvis" onClick={() => void envoyer()}
          disabled={enCours || !saisie.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: 999, border: 'none', background: enCours || !saisie.trim() ? 'var(--line-2)' : 'var(--grad-accent)', color: enCours || !saisie.trim() ? 'var(--muted)' : 'var(--on-accent)', cursor: enCours || !saisie.trim() ? 'default' : 'pointer' }}
        >
          {enCours ? <span style={{ fontWeight: 800, fontSize: 13 }}>…</span> : <Icon name="spark" size={16} />}
        </button>
      </div>
      <p data-cout-message style={{ margin: 0, fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{MENTION_COUT_MESSAGE_CONCEPT}</p>
    </section>
  );

  const creations = (
    <section data-pane="creations" style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {versionCourante ? (
        <>
          <ActionsConcept
            projectId={projectId} kind={kind} generationImageActive={generationImageActive}
            versionCourante={versionCourante} signalRecharge={signalRecharge}
            onPropose={() => setSignalRecharge((n) => n + 1)}
          />
          <div data-emplacement="propositions"><PropositionsProjet projectId={projectId} versionCourante={versionCourante} rechargerSignal={signalRecharge} /></div>
        </>
      ) : <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>Les propositions apparaîtront ici dès que le concept aura une première version.</p>}
    </section>
  );

  return (
    <div data-hote="concept" style={{ display: 'grid', gap: 14 }}>
      {isMobile && (
        <div role="tablist" aria-label="Concept" data-onglets style={{ display: 'flex', gap: 6 }}>
          {(['conversation', 'creations'] as const).map((o) => (
            <button
              key={o} type="button" role="tab" data-onglet={o} aria-selected={onglet === o}
              onClick={() => setOnglet(o)}
              style={{ flex: 1, minHeight: CIBLE_TACTILE_MIN, borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: `1px solid ${onglet === o ? 'var(--accent-strong)' : 'var(--line-2)'}`, background: onglet === o ? 'var(--accent-soft)' : 'transparent', color: onglet === o ? 'var(--accent-strong)' : 'var(--ink-2)' }}
            >
              {o === 'conversation' ? 'Conversation' : 'Créations'}
            </button>
          ))}
        </div>
      )}

      {isMobile ? (
        <div style={{ display: 'grid' }}>
          <div hidden={onglet !== 'conversation' || undefined}>{conversation}</div>
          <div hidden={onglet !== 'creations' || undefined}>{creations}</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row', gap: 20, alignItems: 'stretch' }}>
          {conversation}
          {creations}
        </div>
      )}
    </div>
  );
}
