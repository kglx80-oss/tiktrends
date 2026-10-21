'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  parseAnswer, visibleWhileStreaming, verrouAction, extraireCitations, citationsComptees,
  sansTiretCadratin, teinte, JARVIS_ACTIONS, CIBLE_TACTILE_MIN,
  PUCES_CONTEXTE_JARVIS, completudeFicheJarvis, CATEGORIE_JARVIS_DEFAUT,
  type JarvisAction, type FicheMarqueLue, type SourceDepenseJarvis, type CategorieJarvis, type PuceContexteJarvis,
} from '@tiktrends/core';
import { chatThreadAction, clearChatAction, type ChatThread, type ChatTurn, type ConversationLue } from '../../actions/jarvis-chat';
import { creerConversationAction, renommerConversationAction } from '../../actions/jarvis-conversations';
import { draftConceptAction, type DraftView } from '../../actions/adsmap-draft';
import { DraftCard } from '../../../components/DraftCard';
import { JarvisAccueilV5 } from './JarvisAccueilV5';
import { JarvisColonne } from './JarvisColonne';
import { JarvisContexte } from './JarvisContexte';
import { useIsMobile } from '../../../components/useIsMobile';
import { cadreSignal } from '../../../components/ui';
import { JarvisVersStudio } from '../../../components/JarvisVersStudio';
import { Icon } from '../../../components/Icon';
import { COUT_CONVERSATION_JARVIS } from '../../../lib/veille-jarvis';
import type { ProjetColonne } from '../../../lib/studios/jarvis-projets';

/**
 * UX V5 · l'espace Jarvis en DEUX colonnes (maquette) · une colonne secondaire
 * (marque, conversations, projets, fiche) et, au centre, la conversation.
 *
 * Ce composant tient l'état de la conversation OUVERTE (multi-conversation
 * réel : `conversationId`), la sélection de puces de contexte (seule « Fiche
 * marque » est réelle · elle pilote un contexte serveur réel) et la catégorie
 * de prompts active. Tout le reste (hero, orbe, panneau V5) est rendu au centre.
 *
 * Il propose, il n'engage pas · chaque réponse peut poser un ou deux boutons,
 * chacun annonçant son coût AVANT le clic.
 */

const bulle = (moi: boolean): CSSProperties => ({
  maxWidth: 'min(760px, 86%)',
  alignSelf: moi ? 'flex-end' : 'flex-start',
  padding: '10px 14px',
  borderRadius: moi ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
  background: moi ? 'var(--accent-soft)' : 'var(--surface)',
  border: `1px solid ${moi ? 'var(--accent-28)' : 'var(--line)'}`,
  color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.62, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
});

const reponse: CSSProperties = {
  alignSelf: 'flex-start', maxWidth: 'min(760px, 92%)',
  color: 'var(--ink)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};

export function JarvisChat({ fiche, brandId, brandName, kpiSource, projets, brouillonInitial = '', compact = false, veille }: {
  fiche: FicheMarqueLue | null;
  brandId: string;
  brandName: string;
  kpiSource: SourceDepenseJarvis | null;
  projets: ProjetColonne[];
  /** Demande préparée, toujours soumise par un clic explicite. */
  brouillonInitial?: string;
  compact?: boolean;
  veille?: Record<string, string>;
}) {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [conversations, setConversations] = useState<ConversationLue[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState((compact ? (brouillonInitial.split('\n\n')[0] ?? '') : brouillonInitial).slice(0, 4000));
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const [contexteOuvert, setContexteOuvert] = useState(false);
  const [categorie, setCategorie] = useState<CategorieJarvis>(CATEGORIE_JARVIS_DEFAUT);
  // Puces de contexte · seule « Fiche marque » est réelle (règle noyau). Le
  // défaut l'active · la mémoire et l'identité entrent dans le contexte.
  const [puces, setPuces] = useState<Set<PuceContexteJarvis>>(() => new Set<PuceContexteJarvis>(['fiche']));
  const filRef = useRef<HTMLDivElement>(null);
  const verrou = useRef(verrouAction());
  const isMobile = useIsMobile();

  const cleStockage = `tt_jarvis_conv_${brandId}`;
  const memoriser = useCallback((id: string | null) => {
    if (veille) return;
    try { localStorage.setItem(cleStockage, id ?? '__principal__'); } catch { /* privé / bloqué · sans effet */ }
  }, [cleStockage, veille]);

  // Charge le fil d'une conversation (et la liste). Le serveur réconcilie
  // `conversationId` · un identifiant hors portée retombe sur le fil principal.
  const charger = useCallback(async (convId: string | null) => {
    const r = await chatThreadAction(convId);
    if (r.error) { setErreur(r.error); return; }
    setErreur(null);
    const t = r.thread ?? null;
    setThread(t);
    if (t) { setConversations(t.conversations); setConversationId(t.conversationId); memoriser(t.conversationId); }
  }, [memoriser]);

  // Restitution au reload · la dernière conversation ouverte pour cette marque.
  useEffect(() => {
    if (veille) return;
    let sauve: string | null = null;
    try { const v = localStorage.getItem(cleStockage); if (v && v !== '__principal__') sauve = v; } catch { /* sans effet */ }
    void charger(sauve);
  }, [charger, cleStockage, veille]);

  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.turns.length, partiel]);

  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q) return;
    if (!verrou.current.tenter()) return;
    setSaisie('');
    setEnCours(true);
    setPartiel('');
    setErreur(null);

    const provisoire: ChatTurn = { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() };
    setThread((t) => (t ? { ...t, turns: [...t.turns, provisoire] } : t));

    try {
      let cible = conversationId;
      if (veille && !cible) {
        const r = await creerConversationAction(brandId);
        if (r.error || !r.id) { setErreur(r.error ?? 'Impossible d’ouvrir la conversation.'); return; }
        cible = r.id; setConversationId(cible);
      }
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Le choix client pilote le contexte RÉEL (puces) et la conversation.
        body: JSON.stringify({ message: !veille && compact && brouillonInitial ? `${q}\n\n${brouillonInitial.split('\n\n').slice(1).join('\n\n')}`.slice(0, 4000) : q, conversationId: cible, veille, brandId, sources: [...puces] }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        // Retour anticipé DANS le try · le `finally` relâche le verrou et remet
        // `enCours` à false (pas de double relâche, pas de verrou oublié).
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
      await charger(cible);
    } catch {
      setErreur('La connexion s’est interrompue. Vérifie la conversation avant de réessayer.');
    } finally {
      setEnCours(false);
      verrou.current.relacher();
    }
  }

  async function nouvelleConversation() {
    if (enCours) return;
    const r = await creerConversationAction(brandId);
    if (r.error || !r.id) { setErreur(r.error ?? 'Impossible de créer la conversation.'); return; }
    await charger(r.id);
  }

  async function renommer(id: string, titreActuel: string) {
    const propose = window.prompt('Renommer la conversation', titreActuel);
    if (propose == null) return;
    const r = await renommerConversationAction(brandId, id, propose);
    if (r.error) { setErreur(r.error); return; }
    await charger(conversationId);
  }

  async function effacer() {
    if (!confirm('Effacer cette conversation avec Jarvis ?')) return;
    const r = await clearChatAction(conversationId);
    if (r.error) { setErreur(r.error); return; }
    await charger(conversationId);
  }

  function basculerPuce(cle: PuceContexteJarvis, reel: boolean) {
    if (!reel) return; // une puce inerte ne règle rien (honnête)
    setPuces((s) => {
      const n = new Set(s);
      if (n.has(cle)) n.delete(cle); else n.add(cle);
      return n;
    });
  }

  const completude = fiche ? completudeFicheJarvis(fiche, brandId) : null;

  const colonne = (
    <JarvisColonne
      brandName={brandName} projets={projets}
      conversations={conversations} conversationId={conversationId}
      onNouvelle={() => void nouvelleConversation()}
      onOuvrirPrincipal={() => void charger(null)}
      onOuvrir={(id) => void charger(id)}
      onRenommer={(id, t) => void renommer(id, t)}
      completude={completude} enCours={enCours} isMobile={isMobile}
    />
  );

  // Deux colonnes en desktop ; en mobile, on EMPILE (colonne-reverse · la
  // conversation d'abord, la colonne secondaire dessous) · jamais de
  // débordement horizontal au doigt.
  const cadreDeux: CSSProperties = {
    display: 'flex', flexDirection: isMobile ? 'column-reverse' : 'row',
    gap: isMobile ? 16 : 24, alignItems: isMobile ? 'stretch' : 'flex-start',
  };

  if (erreur && !thread && !compact) {
    return (
      <div style={cadreDeux}>
        {colonne}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...cadreSignal('var(--err-strong)'), padding: '16px 18px', color: 'var(--err-strong)', fontSize: 13 }}>{erreur}</div>
        </div>
      </div>
    );
  }

  const vide = !thread || thread.turns.length === 0;

  // ── Le composeur · textarea pleine largeur + une rangée (pièce jointe,
  // puces de contexte, envoi). La pièce jointe est HONNÊTE (à venir) · aucun
  // pipeline de fichier Jarvis n'existe, on ne simule pas un envoi qui ne part pas.
  const composeur = (
    <div style={{ width: '100%' }}>
      <div data-cadre="controle" style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        padding: compact ? 12 : isMobile ? 14 : 18,
        borderRadius: compact ? 14 : 24, border: '1px solid var(--line-2)', background: compact ? 'var(--bg)' : 'var(--surface)',
      }}>
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(saisie); } }}
          rows={compact ? 2 : brouillonInitial ? 8 : 2}
          maxLength={4000}
          placeholder={`Demandez-moi n’importe quoi sur ${brandName}…`}
          disabled={enCours}
          aria-label="Écrire à Jarvis"
          style={{
            width: '100%', minHeight: 60, boxSizing: 'border-box',
            padding: 0, border: 'none', background: 'transparent', color: 'var(--ink)',
            fontSize: isMobile ? 16 : 15, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Pièce jointe · HONNÊTE · à venir (aucun pipeline de fichier Jarvis). */}
          <button
            hidden={compact} type="button" disabled aria-disabled="true"
            title="Pièce jointe · à venir"
            style={{
              display: compact ? 'none' : 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: 999,
              border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', cursor: 'not-allowed',
            }}
          >
            <Icon name="upload" size={16} />
          </button>

          {/* Puces de contexte · seule « Fiche marque » est un vrai interrupteur. */}
          <div data-zone="puces" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {PUCES_CONTEXTE_JARVIS.filter((p) => !compact || p.reel).map((p) => {
              const actif = p.reel && puces.has(p.cle);
              return (
                <button
                  key={p.cle} type="button"
                  onClick={() => basculerPuce(p.cle, p.reel)}
                  disabled={!p.reel}
                  aria-pressed={p.reel ? actif : undefined}
                  title={p.reel ? (actif ? 'Fiche marque incluse dans le contexte · cliquer pour l’exclure' : 'Fiche marque exclue · cliquer pour l’inclure') : p.aVenir ?? undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px',
                    borderRadius: 999, fontSize: 12, fontWeight: 700,
                    cursor: p.reel ? 'pointer' : 'not-allowed',
                    border: `1px solid ${actif ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                    background: actif ? 'var(--accent-soft)' : 'transparent',
                    color: p.reel ? (actif ? 'var(--accent-strong)' : 'var(--ink-2)') : 'var(--muted)',
                    opacity: p.reel ? 1 : 0.7,
                  }}
                >
                  <Icon name={p.icone} size={13} /> {p.libelle}
                </button>
              );
            })}
          </div>

          {/* Ce que Jarvis sait · le contexte réel, à la demande. */}
          <button
            type="button" onClick={() => setContexteOuvert(true)} aria-haspopup="dialog"
            title="Voir ce que Jarvis sait de ta marque"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: 999,
              border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer',
            }}
          >
            <Icon name="help" size={16} />
          </button>

          <button
            aria-label="Envoyer le message à Jarvis"
            onClick={() => void envoyer(saisie)}
            disabled={enCours || !saisie.trim()}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: compact ? 11 : 999, border: 'none',
              background: enCours || !saisie.trim() ? 'var(--line-2)' : compact ? 'var(--accent)' : 'var(--grad-accent)',
              color: enCours || !saisie.trim() ? 'var(--muted)' : 'var(--on-accent)',
              cursor: enCours || !saisie.trim() ? 'default' : 'pointer',
            }}
          >
            {enCours ? <span style={{ fontWeight: 800, fontSize: 13 }}>…</span> : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            )}
          </button>
        </div>
        <p style={{ margin: '8px 0 0', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>{COUT_CONVERSATION_JARVIS}</p>
      </div>
    </div>
  );

  if (compact) return <section className="jarvis-veille-chat" aria-label="Conversation Jarvis" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
    <div ref={filRef} style={{ flex: 1, minHeight: 80, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '12px 4px' }}>
      {!thread && !veille && <p role="status">Ouverture de la conversation…</p>}
      {thread?.turns.map((t, i) => <Tour key={t.id} turn={t} sources={thread.sources ?? {}} question={t.role === 'assistant' && thread.turns[i - 1]?.role === 'user' ? thread.turns[i - 1]!.content : null} />)}
      {veille && !thread && <p style={reponse}>Conservons la composition de cette référence pour créer une version pour {brandName}. Jarvis examinera le visuel à ton envoi et te proposera les éléments à garder et à remplacer.</p>}
      {thread && vide && !veille && <p style={reponse}>Précise ton intention. Je peux t’aider à choisir le style visuel, écrire le scénario et préparer des variantes pour {brandName}.</p>}
      {partiel && <div style={reponse}>{sansTiretCadratin(visibleWhileStreaming(partiel))}</div>}
      {enCours && !partiel && <p role="status">Jarvis prépare sa réponse…</p>}
      {erreur && <p role="alert">{erreur}</p>}
      {veille?.action === 'cloner' && !enCours && !erreur && thread?.turns.at(-1)?.role === 'assistant' && <JarvisVersStudio key={thread.turns.at(-1)!.id} params={veille} brandId={brandId} proposition={parseAnswer(thread.turns.at(-1)!.content).text} />}
    </div>
    <div style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>{(veille?.action === 'cloner' ? ['Garder la composition', 'Adapter les textes', 'Choisir mon produit'] : ['Choisir le style visuel', 'Écrire le scénario', 'Proposer trois variantes']).map((q) => <button key={q} type="button" disabled={enCours} onClick={() => setSaisie((v) => `${v}\n${q}`.slice(0, 4000))} style={{ border: '1px solid var(--line-2)', borderRadius: 99, background: 'var(--surface)', color: 'var(--ink)', padding: '6px 10px', fontSize: 12, minHeight: 44 }}>{q}</button>)}</div>
      {composeur}
    </div>
    {contexteOuvert && thread && <JarvisContexte contexte={thread.contexte} brandName={thread.brandName} measuredAds={thread.measuredAds} onClose={() => setContexteOuvert(false)} />}
  </section>;

  return (
    <div style={cadreDeux}>
      {colonne}

      <div style={{ flex: 1, minWidth: 0 }}>
        {contexteOuvert && thread && (
          <JarvisContexte contexte={thread.contexte} brandName={thread.brandName} measuredAds={thread.measuredAds} onClose={() => setContexteOuvert(false)} />
        )}

        {!thread ? (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>Ouverture de la conversation…</div>
        ) : vide && !enCours ? (
          <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: '100%', maxWidth: 640, margin: '0 auto' }}>
              {/* L'orbe de Jarvis · décor pur, en jetons (aucune image externe). */}
              <div aria-hidden style={{
                width: isMobile ? 80 : 96, height: isMobile ? 80 : 96, borderRadius: '50%',
                background: [
                  'radial-gradient(circle at 33% 27%, var(--clair-fixe), transparent 22%)',
                  `radial-gradient(circle at 50% 50%, transparent 54%, ${teinte('sombre-fixe', 0.38)} 100%)`,
                  'radial-gradient(circle at 38% 32%, var(--accent-strong), var(--accent) 48%, var(--accent-fin) 100%)',
                ].join(', '),
                boxShadow: `0 10px 36px ${teinte('accent', 0.42)}`,
              }} />
              <h2 style={{ margin: '20px 0 0', fontSize: isMobile ? 28 : 34, fontWeight: 500, lineHeight: 1.18, letterSpacing: '-0.01em', color: 'var(--ink)' }}>
                Comment je peux t’aider sur{' '}
                <span style={{ background: 'var(--grad-accent)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'var(--accent-strong)' }}>{thread.brandName}</span> ?
              </h2>
              <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 540 }}>
                Je m’appuie sur ta fiche marque, ta Veille et tes résultats.<br />Chaque proposition reste à valider.
              </p>
            </div>
            <div style={{ width: '100%', marginTop: isMobile ? 24 : 30 }}>{composeur}</div>
            <JarvisAccueilV5
              measuredAds={thread.measuredAds}
              categorie={categorie}
              onCategorie={setCategorie}
              onAmorce={(q) => void envoyer(q)}
              kpiSource={kpiSource}
              enCours={enCours}
            />
          </div>
        ) : (
          <section style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '72vh', minHeight: 460, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '2px 2px 8px' }}>
              <button onClick={() => void effacer()} style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN,
                padding: '5px 13px', borderRadius: 999, border: '1px solid var(--line-2)',
                background: 'transparent', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
              }}>
                Effacer le fil
              </button>
            </div>

            <div ref={filRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 4px 22px', display: 'flex', flexDirection: 'column', gap: 16, width: '100%', boxSizing: 'border-box' }}>
              {thread.turns.map((t, i) => (
                <Tour key={t.id} turn={t} sources={thread.sources ?? {}}
                  question={t.role === 'assistant' && thread.turns[i - 1]?.role === 'user' ? thread.turns[i - 1]!.content : null} />
              ))}
              {partiel && <div style={reponse}>{sansTiretCadratin(visibleWhileStreaming(partiel))}</div>}
              {enCours && !partiel && (
                <div style={{ ...reponse, color: 'var(--muted)', fontStyle: 'italic' }}>Jarvis relit ta mémoire…</div>
              )}
            </div>

            {erreur && (
              <p style={{ margin: 0, padding: '8px 16px', fontSize: 12, color: 'var(--err-strong)', borderTop: '1px solid var(--line)' }}>{erreur}</p>
            )}

            <div style={{ padding: '10px 4px 4px' }}>{composeur}</div>
          </section>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Un tour, et ce qu'il propose                                              */
/* -------------------------------------------------------------------------- */

export function Tour({ turn, sources, question = null }: { turn: ChatTurn; sources: NonNullable<ChatThread['sources']>; question?: string | null }) {
  if (turn.role === 'user') return <div style={bulle(true)}>{turn.content}</div>;

  const { texte, refs } = extraireCitations(turn.content);
  const { text, actions } = parseAnswer(texte);
  const citees = citationsComptees(turn.content, refs, question).filter((r) => sources[r]);
  return (
    <div style={{ display: 'contents' }}>
      <div style={reponse}>{sansTiretCadratin(text)}</div>
      {citees.length > 0 && (
        <p style={{ alignSelf: 'flex-start', maxWidth: 'min(760px, 92%)', margin: '-8px 0 0', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Cité ·</span>
          {citees.map((r) => (
            <span key={r} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', padding: '2px 8px', borderRadius: 999, border: '1px solid var(--line-2)', overflowWrap: 'anywhere' }}>
              {sources[r]!.titre}{sources[r]!.enService ? '' : ' · retirée depuis'}
            </span>
          ))}
        </p>
      )}
      {actions.length > 0 && <Gestes actions={actions} />}
    </div>
  );
}

function Gestes({ actions }: { actions: JarvisAction[] }) {
  const router = useRouter();
  const [brouillon, setBrouillon] = useState<DraftView | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [ecrit, setEcrit] = useState(false);

  const rediger = async (intent: string | null) => {
    if (ecrit) return;
    setEcrit(true); setNote(null);
    const r = await draftConceptAction({ origin: 'blank', intent: intent ?? '' });
    setEcrit(false);
    if (r.error) { setNote(r.error); return; }
    setBrouillon(r.view ?? null);
  };

  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '86%', display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {actions.map((a) => {
          const def = JARVIS_ACTIONS[a.key];
          const payant = def.cost !== null;
          return (
            <button
              key={a.key}
              onClick={() => (def.href ? router.push(def.href) : void rediger(a.intent))}
              disabled={ecrit && payant}
              title={def.effect}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, gap: 7,
                padding: '8px 14px', borderRadius: 999, cursor: ecrit && payant ? 'wait' : 'pointer',
                border: `1px solid ${payant ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                background: 'var(--surface)', color: payant ? 'var(--accent-strong)' : 'var(--ink-2)',
                fontSize: 12.5, fontWeight: 700, textAlign: 'left',
              }}
            >
              {ecrit && payant ? 'Jarvis écrit…' : def.label}
              {payant && !ecrit && <span style={{ fontSize: 11, opacity: 0.7 }}>· {def.cost}</span>}
            </button>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        {actions.map((a) => JARVIS_ACTIONS[a.key].effect).join(' · ')}
      </p>
      {brouillon && <DraftCard view={brouillon} />}
      {note && <p style={{ margin: 0, fontSize: 12, color: 'var(--err-text)', lineHeight: 1.5 }}>{note}</p>}
    </div>
  );
}
