'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { chatThreadAction, clearChatAction, type ChatThread, type ChatTurn } from '../../actions/jarvis-chat';

/**
 * L'espace où l'on parle à Jarvis.
 *
 * ── Pourquoi il est en haut, et grand ────────────────────────────────────────
 *
 * Tout ce que Jarvis sait vit dans des tableaux qu'il faut savoir lire. Chacun
 * répond bien à SA question, à condition de savoir laquelle poser et où la
 * poser. Une conversation est la seule interface qui n'exige pas de savoir où
 * chercher · c'est donc elle qu'on rencontre en premier, et elle a la place.
 *
 * ── Le flux n'est pas un ornement ────────────────────────────────────────────
 *
 * Six secondes d'écran muet ne se lisent pas comme de la réflexion, mais comme
 * une panne · on reclique, on double la dépense, et on perd confiance. Le texte
 * arrive donc au fur et à mesure.
 *
 * ── Ce qu'on affiche quand le fil est vide ───────────────────────────────────
 *
 * Pas un curseur qui clignote. Un curseur devant une page blanche produit
 * surtout de la gêne · les entrées proposées apprennent au passage ce que Jarvis
 * sait faire, et elles changent selon qu'il a des chiffres ou non.
 */

const bulle = (moi: boolean): CSSProperties => ({
  maxWidth: '86%',
  alignSelf: moi ? 'flex-end' : 'flex-start',
  padding: '10px 14px',
  borderRadius: moi ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
  background: moi ? 'var(--accent-soft)' : 'var(--surface)',
  border: `1px solid ${moi ? 'rgba(254,44,85,.28)' : 'var(--line)'}`,
  color: 'var(--ink)',
  fontSize: 13.5,
  lineHeight: 1.62,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

export function JarvisChat() {
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [saisie, setSaisie] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [partiel, setPartiel] = useState('');
  const filRef = useRef<HTMLDivElement>(null);

  const charger = useCallback(async () => {
    const r = await chatThreadAction();
    if (r.error) setErreur(r.error); else { setErreur(null); setThread(r.thread ?? null); }
  }, []);

  useEffect(() => { void charger(); }, [charger]);

  // On suit le bas du fil pendant que la réponse arrive · sans ça le texte
  // s'écrit hors de l'écran et on croit qu'il ne se passe rien.
  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight, behavior: 'smooth' });
  }, [thread?.turns.length, partiel]);

  async function envoyer(texte: string) {
    const q = texte.trim();
    if (!q || enCours) return;
    setSaisie('');
    setEnCours(true);
    setPartiel('');
    setErreur(null);

    // La question apparaît tout de suite · attendre le serveur pour l'afficher
    // donnerait l'impression que la touche Entrée n'a rien fait.
    const provisoire: ChatTurn = { id: `local-${Date.now()}`, role: 'user', content: q, at: new Date().toISOString() };
    setThread((t) => (t ? { ...t, turns: [...t.turns, provisoire] } : t));

    try {
      const res = await fetch('/api/jarvis/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });

      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setErreur(j?.error ?? 'Jarvis n’a pas pu répondre.');
        setEnCours(false);
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
      await charger();
    } catch {
      setErreur('La connexion s’est interrompue. Ta question est enregistrée, réessaie.');
    } finally {
      setEnCours(false);
    }
  }

  async function effacer() {
    if (!confirm('Effacer toute la conversation avec Jarvis sur cette marque ?')) return;
    const r = await clearChatAction();
    if (r.error) { setErreur(r.error); return; }
    await charger();
  }

  if (erreur && !thread) {
    return <div style={{ border: '1px solid #ff8095', borderRadius: 14, padding: '16px 18px', color: '#ff8095', fontSize: 13 }}>{erreur}</div>;
  }
  if (!thread) {
    return <div style={{ color: 'var(--muted)', fontSize: 13, padding: '20px 0' }}>Ouverture de la conversation…</div>;
  }

  const vide = thread.turns.length === 0;

  return (
    <section style={{
      border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--paper)',
      display: 'flex', flexDirection: 'column', height: '62vh', minHeight: 440, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
        borderBottom: '1px solid var(--line)', background: 'var(--surface)', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>Parler à Jarvis</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          · {thread.measuredAds > 0
            ? `il répond avec ${thread.measuredAds} test(s) mesuré(s) de ${thread.brandName}`
            : `aucun test mesuré sur ${thread.brandName} · il le dira plutôt que de meubler`}
        </span>
        <span style={{ flex: 1 }} />
        {!vide && (
          <button onClick={effacer} style={{
            padding: '5px 11px', borderRadius: 999, border: '1px solid var(--line-2)',
            background: 'transparent', color: 'var(--muted)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer',
          }}>
            Effacer le fil
          </button>
        )}
      </div>

      <div ref={filRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {vide && !enCours && (
          <div style={{ margin: 'auto', textAlign: 'center', maxWidth: 520 }}>
            <div style={{ fontSize: 30 }}>🧠</div>
            <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
              Demande-lui ce que tu veux sur cette marque.
            </p>
            <p style={{ margin: '6px 0 16px', fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              Il cite tes chiffres, ou il admet qu’il n’en a pas · il ne comble jamais avec des
              généralités. Et il a le droit de te contredire, c’est même ce qu’on lui demande.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {thread.starters.map((q) => (
                <button key={q} onClick={() => void envoyer(q)} style={{
                  padding: '8px 13px', borderRadius: 999, border: '1px solid var(--line-2)',
                  background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 12.5,
                  cursor: 'pointer', textAlign: 'left', lineHeight: 1.4,
                }}>
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {thread.turns.map((t) => (
          <div key={t.id} style={bulle(t.role === 'user')}>{t.content}</div>
        ))}

        {partiel && <div style={bulle(false)}>{partiel}</div>}
        {enCours && !partiel && (
          <div style={{ ...bulle(false), color: 'var(--muted)', fontStyle: 'italic' }}>Jarvis relit ta mémoire…</div>
        )}
      </div>

      {erreur && (
        <p style={{ margin: 0, padding: '8px 16px', fontSize: 12, color: '#ff8095', borderTop: '1px solid var(--line)' }}>{erreur}</p>
      )}

      <div style={{ display: 'flex', gap: 8, padding: '11px 14px', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
        <textarea
          value={saisie}
          onChange={(e) => setSaisie(e.target.value)}
          onKeyDown={(e) => {
            // Entrée envoie, Maj+Entrée passe à la ligne · c'est ce qu'on attend
            // d'une conversation, et l'inverse d'un formulaire.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void envoyer(saisie); }
          }}
          rows={2}
          placeholder="Écris à Jarvis · Entrée pour envoyer, Maj+Entrée pour aller à la ligne"
          disabled={enCours}
          style={{
            flex: 1, padding: '9px 12px', borderRadius: 11, border: '1px solid var(--line-2)',
            background: 'var(--bg)', color: 'var(--ink)', fontSize: 13.5, fontFamily: 'inherit',
            resize: 'none', lineHeight: 1.5,
          }}
        />
        <button
          onClick={() => void envoyer(saisie)}
          disabled={enCours || !saisie.trim()}
          style={{
            padding: '0 20px', borderRadius: 11, border: 'none',
            background: enCours || !saisie.trim() ? 'var(--line-2)' : 'var(--grad-accent)',
            color: enCours || !saisie.trim() ? 'var(--muted)' : '#0d070c',
            fontWeight: 800, fontSize: 13, cursor: enCours || !saisie.trim() ? 'default' : 'pointer',
          }}
        >
          {enCours ? '…' : 'Envoyer'}
        </button>
      </div>
    </section>
  );
}
