'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { CREDIT_PACKS } from '../lib/credit-packs';
import { createTopupCheckoutAction } from '../app/actions/stripe';
import { Icon } from './Icon';
import { CIBLE_TACTILE_MIN, COQUILLE_V5, afficherCredits, jaugeCredits, texteCredits, teinte } from '@tiktrends/core';

/**
 * Pastille de crédits (solde réel) + menu au clic :
 * solde, « Illimité » pour le fondateur, et options de recharge / d'amélioration.
 *
 * V5 (lot V5 · B, R18 · R19) · la pilule devient une CARTE (rayon 12, icône,
 * solde, « + », barre solde / dotation de la formule · `jaugeCredits`). Le menu
 * qu'elle ouvre est INCHANGÉ · mêmes packs, même recharge Stripe (réservée au
 * propriétaire, côté serveur), même lien d'offre. Aucune date de renouvellement
 * (non stockée).
 */
export function CreditsMenu({ balance, unlimited, planLabel, showUpgrade, collapsed, allocation = 0 }: {
  balance: number;
  unlimited: boolean;
  planLabel: string;
  showUpgrade: boolean;
  collapsed?: boolean;
  /** Dotation mensuelle de la formule (`PLAN_CREDITS[plan]`) · dénominateur de la barre. 0 · pas de barre. */
  allocation?: number;
}) {
  const [open, setOpen] = useState(false);
  // La même décision que les autres écrans · une seule vérité sur le solde (N09).
  const etat = afficherCredits({ balance, unlimited });
  const display = texteCredits(etat, (n) => n.toLocaleString('fr-FR'));
  const jauge = jaugeCredits({ balance, unlimited, allocation }, (n) => n.toLocaleString('fr-FR'));
  const V = COQUILLE_V5.credits;

  return (
    <div style={{ position: 'relative' }}>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }} />
          <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, width: collapsed ? 250 : '100%', zIndex: 30, background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 14, boxShadow: `0 16px 40px -12px ${teinte('ombre', .6)}`, overflow: 'hidden' }}>
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
                    <span style={{ display: 'inline-flex', color: 'var(--on-accent)' }}><Icon name="spark" size={15} /></span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 800, color: 'var(--on-accent)' }}>Améliorer mon offre</span>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--on-accent)' }}>Plus de crédits chaque mois</span>
                    </span>
                    <span style={{ color: 'var(--on-accent)', fontSize: 13, fontWeight: 800 }}>›</span>
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
                      <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: CIBLE_TACTILE_MIN, fontSize: 11.5, fontWeight: 800, padding: '5px 14px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: 'var(--on-accent)', cursor: 'pointer', flexShrink: 0 }}>Acheter</button>
                    </form>
                  ))}
                </div>
                <p style={{ margin: '10px 2px 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
                  Paiement sécurisé par Stripe · crédités instantanément. Idéal pour un pic ponctuel sans changer d'offre.
                </p>
                <Link href="/usage" onClick={() => setOpen(false)} style={{ ...linkRow, marginTop: 8, color: 'var(--accent-strong)', textAlign: 'center' }}>
                  Voir mon utilisation détaillée ›
                </Link>
              </div>
            )}
          </div>
        </>
      )}

      {/* La carte entière est le bouton (cible large) · le « + » en est le signe
          visible, pas un second bouton imbriqué. */}
      <button type="button" data-zone="pastille-credits" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        aria-label={`${jauge.libelle} · recharger ou voir l’offre`} title={jauge.libelle}
        style={{
          width: '100%', display: 'flex', flexDirection: 'column', gap: 8, minHeight: CIBLE_TACTILE_MIN, padding: collapsed ? '8px 6px' : '10px 12px', borderRadius: V.rayon,
          border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)', cursor: 'pointer', boxSizing: 'border-box',
        }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <span aria-hidden style={{ width: V.icone, height: V.icone, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="coin" size={16} />
          </span>
          {!collapsed && (
            <span aria-hidden style={{ flex: 1, minWidth: 0, textAlign: 'left', lineHeight: 1.15 }}>
              <strong data-solde style={{ display: 'block', fontSize: 15, fontWeight: 700, color: unlimited ? 'var(--accent-strong)' : 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jauge.texte}</strong>
              {jauge.unite && <small style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-2)' }}>{jauge.unite}</small>}
            </span>
          )}
          {!collapsed && (
            <span aria-hidden data-plus style={{ width: V.plus, height: V.plus, borderRadius: 7, background: 'var(--accent-strong)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="plus" size={14} />
            </span>
          )}
        </span>
        {jauge.ratio !== null && (
          <span aria-hidden data-jauge={Math.round(jauge.ratio * 100)} style={{ display: 'block', width: '100%', height: V.barre, borderRadius: 2, background: 'var(--line-2)', overflow: 'hidden' }}>
            <span style={{ display: 'block', height: '100%', width: `${Math.round(jauge.ratio * 100)}%`, borderRadius: 2, background: 'var(--accent-strong)' }} />
          </span>
        )}
      </button>
    </div>
  );
}

const linkRow: CSSProperties = { display: 'block', padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 600, textDecoration: 'none' };
