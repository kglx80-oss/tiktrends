'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createTicketAction } from '../app/actions/support';
import { fetchMyTickets, type MyTicket } from '../app/actions/support';
import { input } from './ui';

const FAQ: Array<{ q: string; a: string }> = [
  { q: 'Comment créer une marque ?', a: "Menu profil → Marques → « Créer une marque ». Le wizard en 5 étapes te guide ; l'IA peut pré-remplir le profil depuis ton site." },
  { q: 'Comment connecter un compte publicitaire ?', a: 'Profil → Connexions. Choisis Meta ou TikTok, la connexion se fait en OAuth sécurisé, marque par marque.' },
  { q: 'Comment fonctionnent les crédits ?', a: 'Chaque action IA (script, brief, analyse concurrent…) consomme des crédits selon un barème. Ton solde et l’historique sont dans Crédits (console admin).' },
  { q: 'Comment analyser un concurrent ?', a: "Ouvre une marque → onglet Concurrents → clique un concurrent → « Analyser ». On récupère ses créas et on extrait hooks, angles, USP, etc." },
  { q: 'Comment inviter un membre ?', a: 'Profil → Membres. Envoie une invitation par e-mail avec le rôle voulu (membre, admin, client lecture).' },
];

const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: 'Ouvert', color: '#f5a623' }, in_progress: { label: 'En cours', color: '#7aa2ff' }, resolved: { label: 'Résolu', color: '#18cc8c' },
};
const TYPE_ICON: Record<string, string> = { bug: '🐞', suggestion: '💡', question: '❓' };

export function SupportWidget({ firstName }: { firstName: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'home' | 'messages'>('home');
  const [asking, setAsking] = useState(false);
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);

  useEffect(() => {
    if (open && tab === 'messages' && tickets === null) {
      fetchMyTickets().then(setTickets).catch(() => setTickets([]));
    }
  }, [open, tab, tickets]);

  const faq = FAQ.filter((f) => !q.trim() || (f.q + ' ' + f.a).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      {/* Panneau */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 88, right: 20, width: 380, maxWidth: 'calc(100vw - 40px)', maxHeight: 'min(620px, calc(100vh - 120px))',
          display: 'flex', flexDirection: 'column', zIndex: 45, borderRadius: 20, overflow: 'hidden',
          border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', boxShadow: '0 26px 70px -18px rgba(0,0,0,.8)',
        }}>
          {/* En-tête */}
          <div style={{ padding: '20px 20px 16px', background: 'var(--grad-accent)', color: '#0d070c' }}>
            <div style={{ fontSize: 20, fontWeight: 800, opacity: .8 }}>Bonjour {firstName} 👋</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>Comment peut-on aider ?</div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {tab === 'home' ? (
              <>
                {/* Poser une question */}
                <div style={{ border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', padding: 14, marginBottom: 12 }}>
                  {!asking ? (
                    <button type="button" onClick={() => setAsking(true)} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ flex: 1 }}>
                        <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Poser une question</span>
                        <span style={{ display: 'block', fontSize: 12.5, color: 'var(--muted)' }}>Notre équipe te répond dans le fil</span>
                      </span>
                      <span style={{ fontSize: 18, color: 'var(--accent-strong)' }}>›</span>
                    </button>
                  ) : (
                    <form action={createTicketAction} style={{ display: 'grid', gap: 10 }}>
                      <select name="type" defaultValue="question" style={{ ...input, padding: '8px 10px' }}>
                        <option value="question">❓ Question</option>
                        <option value="bug">🐞 Bug</option>
                        <option value="suggestion">💡 Suggestion</option>
                      </select>
                      <input name="title" required placeholder="Sujet" style={{ ...input, padding: '8px 10px' }} />
                      <textarea name="body" required placeholder="Ton message…" style={{ ...input, padding: '8px 10px', minHeight: 70, resize: 'vertical', fontFamily: 'inherit' }} />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="submit" style={{ padding: '8px 14px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5, cursor: 'pointer' }}>Envoyer</button>
                        <button type="button" onClick={() => setAsking(false)} style={{ padding: '8px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--muted)', fontSize: 12.5, cursor: 'pointer' }}>Annuler</button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Recherche d'aide */}
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher de l'aide…" style={{ ...input, padding: '9px 12px' }} />
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {faq.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)', padding: '8px 4px' }}>Aucun article. <button type="button" onClick={() => setAsking(true)} style={{ color: 'var(--accent-strong)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5 }}>Pose ta question →</button></p>}
                  {faq.map((f, i) => (
                    <details key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '10px 12px' }}>
                      <summary style={{ listStyle: 'none', cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>{f.q}</span><span style={{ color: 'var(--muted)' }}>+</span>
                      </summary>
                      <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{f.a}</p>
                    </details>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {tickets === null && <p style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>Chargement…</p>}
                {tickets && tickets.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--muted)', padding: 8 }}>Aucun message pour l'instant. Pose ta première question depuis l'accueil.</p>}
                {tickets?.map((t) => {
                  const st = STATUS[t.status] ?? STATUS.open!;
                  return (
                    <Link key={t.id} href={`/support/${t.id}`} onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--surface)', padding: '11px 13px', textDecoration: 'none' }}>
                      <span>{TYPE_ICON[t.type] ?? '•'}</span>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 800, padding: '2px 8px', borderRadius: 999, color: st.color, background: st.color + '22' }}>{st.label}</span>
                    </Link>
                  );
                })}
                <Link href="/support" onClick={() => setOpen(false)} style={{ fontSize: 12.5, color: 'var(--accent-strong)', fontWeight: 700, textAlign: 'center', padding: 8, textDecoration: 'none' }}>Ouvrir le support complet →</Link>
              </div>
            )}
          </div>

          {/* Navigation bas */}
          <div style={{ display: 'flex', borderTop: '1px solid var(--line)', background: 'var(--surface)' }}>
            {([['home', 'Accueil', 'M3 12l9-9 9 9M5 10v10h14V10'], ['messages', 'Messages', 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']] as const).map(([k, label, d]) => {
              const active = tab === k;
              return (
                <button key={k} type="button" onClick={() => setTab(k)} style={{
                  flex: 1, padding: '11px 0', background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  color: active ? 'var(--accent-strong)' : 'var(--muted)', fontWeight: active ? 800 : 600, fontSize: 11.5,
                }}>
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Bouton flottant */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Aide et support"
        style={{
          position: 'fixed', bottom: 20, right: 20, width: 56, height: 56, borderRadius: '50%', cursor: 'pointer', zIndex: 46,
          border: 'none', background: 'var(--grad-accent)', color: '#0d070c', boxShadow: '0 14px 34px -8px rgba(254,44,85,.5)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
        )}
      </button>
    </>
  );
}
