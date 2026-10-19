'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  verrouAction, sansTiretCadratin, visibleWhileStreaming, teinte, CIBLE_TACTILE_MIN,
  ACTION_PREMIERE_MARQUE, TITRE_ONBOARDING_JARVIS, SOUS_TITRE_ONBOARDING_JARVIS,
  PLACEHOLDER_ONBOARDING, ENTREES_ONBOARDING_JARVIS,
} from '@tiktrends/core';
import { onboardingThreadAction, clearOnboardingAction, type OnboardingThread, type ChatTurn } from '../../actions/jarvis-chat';
import { Tour } from './JarvisChat';
import { Icon } from '../../../components/Icon';
import { useIsMobile } from '../../../components/useIsMobile';
import { h1 } from '../../../components/ui';

/**
 * UX V5 · Jarvis en ONBOARDING · le compte neuf (sans marque) n'est plus un
 * cul-de-sac (référence « Flow »). Jarvis reste VIVANT :
 *
 *  · un hero d'accroche (orbe + titre dégradé) ;
 *  · une VRAIE conversation « Écris à Jarvis… » · fil d'onboarding réel (sans
 *    contexte de marque, consigne générique côté serveur) · persistée, restituée ;
 *  · des amorces qui guident le PREMIER pas ;
 *  · une action primaire « Créer ta première marque » (verbe CRÉER) vers le vrai
 *    écran de création ;
 *  · deux entrées vers de VRAIES créations (marque, Veille).
 *
 * Aucune donnée fabriquée · rien ne prétend qu'une marque existe. Jamais le mur
 * « Sélectionne une marque active ».
 */

const reponse: CSSProperties = {
  alignSelf: 'flex-start', maxWidth: 'min(760px, 92%)',
  color: 'var(--ink)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
};
const carte: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
  borderRadius: 'var(--r-card)', border: '1px solid var(--line)', background: 'var(--surface)', boxShadow: 'var(--sh-card)',
};

export function JarvisOnboarding() {
  const [thread, setThread] = useState<OnboardingThread | null>(null);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const filRef = useRef<HTMLDivElement>(null);
  const verrou = useRef(verrouAction());
  const isMobile = useIsMobile();

  const charger = useCallback(async () => {
    const r = await onboardingThreadAction();
    if (r.error) { setErreur(r.error); return; }
    setErreur(null);
    setThread(r.thread ?? { turns: [], starters: [] });
  }, []);
  useEffect(() => { void charger(); }, [charger]);
  useEffect(() => { filRef.current?.scrollTo({ top: filRef.current.scrollHeight, behavior: 'smooth' }); }, [thread?.turns.length, partiel]);

  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q) return;
    if (!verrou.current.tenter()) return;
    setSaisie(''); setEnCours(true); setPartiel(''); setErreur(null);
    const provisoire: ChatTurn = { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() };
    setThread((t) => (t ? { ...t, turns: [...t.turns, provisoire] } : t));
    try {
      // Pas de marque, pas de conversationId · le serveur bascule en mode onboarding.
      const res = await fetch('/api/jarvis/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: q }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        return;
      }
      const lecteur = res.body.getReader();
      const dec = new TextDecoder();
      let recu = '';
      for (;;) { const { done, value } = await lecteur.read(); if (done) break; recu += dec.decode(value, { stream: true }); setPartiel(recu); }
      setPartiel('');
      await charger();
    } catch {
      setErreur('La connexion s’est interrompue. Ta question est enregistrée, réessaie.');
    } finally {
      setEnCours(false);
      verrou.current.relacher();
    }
  }

  async function effacer() {
    if (!confirm('Effacer cette conversation avec Jarvis ?')) return;
    const r = await clearOnboardingAction();
    if (r.error) { setErreur(r.error); return; }
    await charger();
  }

  const vide = !thread || thread.turns.length === 0;

  const composeur = (
    <div data-cadre="controle" style={{
      display: 'flex', flexDirection: 'column', gap: 12,
      padding: isMobile ? 14 : 18, borderRadius: 24, border: '1px solid var(--line-2)', background: 'var(--surface)',
    }}>
      <textarea
        value={saisie}
        onChange={(e) => setSaisie(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(saisie); } }}
        rows={2}
        placeholder={PLACEHOLDER_ONBOARDING}
        disabled={enCours}
        aria-label="Écrire à Jarvis"
        style={{
          width: '100%', minHeight: 56, boxSizing: 'border-box', padding: 0, border: 'none', background: 'transparent',
          color: 'var(--ink)', fontSize: isMobile ? 16 : 15, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5, outline: 'none',
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {/* Sélecteur de marque · AUCUNE marque → « Créer une marque » (verbe CRÉER). */}
        <Link
          href={ACTION_PREMIERE_MARQUE.href}
          data-selecteur-marque
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 34, padding: '0 12px', borderRadius: 999,
            border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontSize: 12.5, fontWeight: 700, textDecoration: 'none',
          }}
        >
          <Icon name="plus" size={14} /> Créer une marque
        </Link>
        <button
          aria-label="Envoyer le message à Jarvis"
          onClick={() => void envoyer(saisie)}
          disabled={enCours || !saisie.trim()}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: CIBLE_TACTILE_MIN, height: CIBLE_TACTILE_MIN, flexShrink: 0, borderRadius: 999, border: 'none',
            background: enCours || !saisie.trim() ? 'var(--line-2)' : 'var(--grad-accent)',
            color: enCours || !saisie.trim() ? 'var(--muted)' : 'var(--on-accent)',
            cursor: enCours || !saisie.trim() ? 'default' : 'pointer',
          }}
        >
          {enCours ? <span style={{ fontWeight: 800, fontSize: 13 }}>…</span> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <main data-etat="onboarding" style={{ padding: '36px clamp(16px, 4vw, 32px) 60px', maxWidth: 820, margin: '0 auto' }}>
      {/* Hero · orbe + titre dégradé + sous-titre. */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div aria-hidden style={{
          width: isMobile ? 76 : 88, height: isMobile ? 76 : 88, borderRadius: '50%', marginBottom: isMobile ? 16 : 18,
          background: [
            'radial-gradient(circle at 33% 27%, var(--clair-fixe), transparent 22%)',
            `radial-gradient(circle at 50% 50%, transparent 54%, ${teinte('sombre-fixe', 0.38)} 100%)`,
            'radial-gradient(circle at 38% 32%, var(--accent-strong), var(--accent) 48%, var(--accent-fin) 100%)',
          ].join(', '),
          boxShadow: `0 10px 36px ${teinte('accent', 0.42)}`,
        }} />
        <h1 style={h1}>
          <span style={{ background: 'var(--grad-accent)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', color: 'var(--accent-strong)' }}>{TITRE_ONBOARDING_JARVIS}</span>
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 14, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 520 }}>{SOUS_TITRE_ONBOARDING_JARVIS}</p>
        {/* Action primaire · verbe CRÉER, vers le vrai écran. */}
        <Link
          href={ACTION_PREMIERE_MARQUE.href}
          data-cta="premiere-marque"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN, marginTop: 20,
            padding: '0 22px', borderRadius: 999, textDecoration: 'none',
            background: 'var(--grad-accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 800,
          }}
        >
          <Icon name="plus" size={16} /> {ACTION_PREMIERE_MARQUE.label}
        </Link>
      </div>

      {/* La conversation d'onboarding · vraie, fonctionnelle. */}
      <div style={{ marginTop: isMobile ? 26 : 34 }}>
        {!vide && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 2px 8px' }}>
              <button onClick={() => void effacer()} style={{ minHeight: 34, padding: '5px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer' }}>Effacer le fil</button>
            </div>
            <div ref={filRef} style={{ maxHeight: '46vh', overflowY: 'auto', padding: '4px 4px 16px', display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 12 }}>
              {thread!.turns.map((t) => (
                t.role === 'user'
                  ? <div key={t.id} style={{ alignSelf: 'flex-end', maxWidth: 'min(760px, 86%)', padding: '10px 14px', borderRadius: '14px 14px 4px 14px', background: 'var(--accent-soft)', border: '1px solid var(--accent-28)', color: 'var(--ink)', fontSize: 13.5, lineHeight: 1.62, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.content}</div>
                  : <Tour key={t.id} turn={t} sources={{}} />
              ))}
              {partiel && <div style={reponse}>{sansTiretCadratin(visibleWhileStreaming(partiel))}</div>}
              {enCours && !partiel && <div style={{ ...reponse, color: 'var(--muted)', fontStyle: 'italic' }}>Jarvis réfléchit…</div>}
            </div>
          </>
        )}
        {erreur && <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--err-strong)' }}>{erreur}</p>}
        {composeur}
      </div>

      {/* Amorces · guident le premier pas · lancent le vrai fil. */}
      {vide && thread && thread.starters.length > 0 && (
        <div data-zone="amorces-onboarding" style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
          {thread.starters.map((q) => (
            <button key={q} type="button" onClick={() => void envoyer(q)} disabled={enCours}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '14px 16px', borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)', boxShadow: 'var(--sh-card)', textAlign: 'left', cursor: enCours ? 'default' : 'pointer', opacity: enCours ? 0.6 : 1, fontSize: 13, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.4 }}>
              <span style={{ display: 'inline-flex', color: 'var(--accent-strong)', flexShrink: 0, marginTop: 1 }}><Icon name="spark" size={15} /></span>
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Deux entrées vers de VRAIES créations. */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
        {ENTREES_ONBOARDING_JARVIS.map((e) => (
          <Link key={e.cle} href={e.href} style={{ ...carte, textDecoration: 'none', cursor: 'pointer' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--accent-soft)', color: 'var(--accent-strong)' }}><Icon name={e.icone} size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{e.titre}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>{e.sous}</div>
            </div>
            <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}><Icon name="trend" size={16} /></span>
          </Link>
        ))}
      </div>
    </main>
  );
}
