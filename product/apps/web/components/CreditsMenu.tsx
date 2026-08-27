'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { CREDIT_PACKS } from '../lib/credit-packs';
import { createTopupCheckoutAction } from '../app/actions/stripe';

/**
 * Puce de crédits (solde réel) façon Pletor + menu au clic :
 * solde, « Illimité » pour le fondateur, et options de recharge / d'amélioration.
 */
export function CreditsMenu({ balance, unlimited, planLabel, showUpgrade, collapsed }: {
  balance: number;
  unlimited: boolean;
  planLabel: string;
  showUpgrade: boolean;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const display = unlimited ? 'Illimité' : balance.toLocaleString('fr-FR');

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: collapsed ? 250 : '100%', zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: '0 16px 40px -12px rgba(0,0,0,.6)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', fontWeight: 700 }}>Crédits restants</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: unlimited ? 'var(--accent-strong)' : 'var(--ink)' }}>{unlimited ? '∞' : display}</span>
                {unlimited
                  ? <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--accent-strong)' }}>Illimité · fondateur</span>
                  : <span style={{ fontSize: 12, color: 'var(--muted)' }}>offre {planLabel}</span>}
              </div>
            </div>

            {unlimited ? (
              <div style={{ padding: 12 }}>
                <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                  Ton compte fondateur n'est pas débité : génère sans limite. Le détail d'exploitation se pilote dans ADMIN+.
                </p>
                <Link href="/credits" onClick={() => setOpen(false)} style={{ ...linkRow, marginTop: 10, color: 'var(--accent-strong)' }}>Crédits (ADMIN+) ›</Link>
              </div>
            ) : (
              <div style={{ padding: 12 }}>
                {showUpgrade && (
                  <Link href="/billing" onClick={() => setOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 11, textDecoration: 'none', background: 'var(--grad-accent)', marginBottom: 10 }}>
                    <span style={{ fontSize: 15 }}>⚡</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#0d070c' }}>Améliorer mon offre</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'rgba(13,7,12,.72)' }}>Plus de crédits chaque mois</span>
                    </span>
                    <span style={{ color: '#0d070c', fontSize: 13, fontWeight: 800 }}>›</span>
                  </Link>
                )}
                <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--muted)', padding: '2px 2px 8px' }}>Recharge ponctuelle</div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {CREDIT_PACKS.map((p) => (
                    <form key={p.key} action={createTopupCheckoutAction} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--line)', borderRadius: 11, padding: '8px 10px 8px 12px' }}>
                      <input type="hidden" name="pack" value={p.key} />
                      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>+{p.credits.toLocaleString('fr-FR')}</span>
                      <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>crédits</span>
                      <span style={{ flex: 1 }} />
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{p.eur} €</span>
                      <button type="submit" style={{ fontSize: 11.5, fontWeight: 800, padding: '5px 12px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', cursor: 'pointer' }}>Acheter</button>
                    </form>
                  ))}
                </div>
                <p style={{ margin: '10px 2px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Paiement sécurisé par Stripe · crédités instantanément. Idéal pour un pic ponctuel sans changer d'offre.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      <button type="button" onClick={() => setOpen((o) => !o)} title={`Crédits : ${unlimited ? 'illimité' : display}`}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: collapsed ? 6 : '8px 11px', borderRadius: 999,
          border: '1px solid ' + (unlimited ? 'rgba(245,166,35,.4)' : 'rgba(254,44,85,.28)'),
          background: unlimited ? 'rgba(245,166,35,.12)' : 'rgba(254,44,85,.10)',
          color: unlimited ? '#f5c877' : 'var(--accent-strong)', cursor: 'pointer', justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
        <span aria-hidden style={{ fontSize: 14, lineHeight: 1 }}>◈</span>
        {!collapsed && <span style={{ flex: 1, textAlign: 'left', fontSize: 13, fontWeight: 800 }}>{display}</span>}
        {!collapsed && <span style={{ fontSize: 10.5, color: 'var(--muted)', fontWeight: 600 }}>{unlimited ? '' : 'crédits'}</span>}
      </button>
    </div>
  );
}

const linkRow: CSSProperties = { display: 'block', padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' };
