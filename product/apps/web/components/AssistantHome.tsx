'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { afficherCredits, texteCredits, CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { AssistantChat } from './AssistantChat';
import { Icon } from './Icon';

export interface AssistantHomeProps {
  firstName: string;
  credits: number;
  /** Compte illimité (fondateur/créateur) · l'accueil affiche « Illimité », pas « 0 crédits ». */
  unlimited: boolean;
  brandName: string | null;
  brandId: string | null;
  aiReady: boolean;
  /** La prochaine itération, DEVANT · rendue juste après l'en-tête. */
  prochaineEtape?: ReactNode;
  /** L'aperçu d'exemple, replié, en toute fin. */
  exemple?: ReactNode;
}

/**
 * L'accueil · il fait ressortir la prochaine ITÉRATION, pas la création.
 *
 * ── L'ordre, et pourquoi ─────────────────────────────────────────────────────
 *
 * Le cap sert l'analyse pour l'itération. L'écran mène donc par la prochaine
 * étape (le parcours réel, injecté), puis les accès d'ANALYSE (Adsmap,
 * Analytics, Veille, Radar, mémoire Jarvis), puis l'assistant. La création
 * (les studios) devient SECONDAIRE · une rangée compacte, après le chat · sans
 * studio mis en vedette ni surtitre de produit clé. L'exemple de pipeline est
 * replié, tout en bas.
 *
 * On ne montre que des accès RÉELS et des libellés descriptifs · aucun KPI ni
 * recommandation inventé, aucune promesse de rentabilité.
 */

// Les accès d'analyse · destinations EXISTANTES, libellés descriptifs. 3 colonnes
// desktop, 2 en tablette, 1 en mobile (borne `min(340px,100%)`).
const ANALYSER: Array<{ href: string; icon: string; titre: string; sous: string }> = [
  { href: '/adsmap', icon: 'map', titre: 'Adsmap', sous: 'Tes tests et leurs verdicts' },
  { href: '/analytics', icon: 'chart', titre: 'Analytics', sous: 'Les KPI agrégés de tes campagnes' },
  { href: '/veille', icon: 'search', titre: 'Veille', sous: 'Observe les concurrents et ce qui scale' },
  { href: '/radar', icon: 'radar', titre: 'Radar produits', sous: 'Les produits qui montent' },
  { href: '/jarvis', icon: 'brain', titre: 'Ce que Jarvis sait', sous: 'La mémoire de ta catégorie' },
];

// Les studios · SECONDAIRES. Quatre accès conservés, sans studio mis en vedette
// ni surtitre de produit clé. Une teinte par studio, en rangée compacte.
const STUDIOS: Array<{ href: string; icon: string; titre: string; teinte: string }> = [
  { href: '/studio/ads', icon: 'sparkles', titre: 'Pubs IA', teinte: 'var(--grad-accent)' },
  { href: '/studio/image', icon: 'image', titre: 'Image IA', teinte: 'linear-gradient(135deg, #0e6a5e, #1f9e8f)' },
  { href: '/studio/video', icon: 'film', titre: 'Vidéo IA', teinte: 'linear-gradient(135deg, #4c2a9e, #8b5cf6)' },
  { href: '/studio/textes', icon: 'pen', titre: 'Textes IA', teinte: 'linear-gradient(135deg, #8a5a12, #d69a3a)' },
];

export function AssistantHome({ firstName, credits, unlimited, brandName, aiReady, prochaineEtape, exemple }: AssistantHomeProps) {
  const etatCredits = afficherCredits({ balance: credits, unlimited });
  return (
    <div style={{ marginBottom: 32 }}>
      {/* En-tête sobre · pas de héros, halo ni grille de fond · un filet sépare.
          Crédits discrets (information, pas action). */}
      <div style={{ padding: '4px 0 20px', marginBottom: 24, borderBottom: '1px solid var(--line)' }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>TikTrends</div>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)', lineHeight: 1.15 }}>
          Bonjour {firstName}
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 560 }}>
          {brandName
            ? <>Marque active · <b style={{ color: 'var(--ink)' }}>{brandName}</b>. Observe, teste, apprends de chaque itération.</>
            : <>Choisis une marque et lance-toi · observe, teste, apprends de chaque itération.</>}
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'rgba(8,5,10,.35)', fontSize: 12.5, color: 'var(--ink-2)' }}>
            <span style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name="coin" size={14} /></span>
            {texteCredits(etatCredits, (n) => n.toLocaleString('fr-FR'))}{etatCredits.mode === 'solde' ? ' crédits' : ''}
          </span>
        </div>
      </div>

      {/* DEVANT · la prochaine itération (parcours réel ou prépare l'itération). */}
      {prochaineEtape}

      {/* Analyser & décider · les accès d'analyse existants, en cartes compactes. */}
      <h2 style={sectionH}>Analyser &amp; décider</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))', gap: 12, margin: '10px 0 26px' }}>
        {ANALYSER.map((a) => (
          <Link key={a.href} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 12, minHeight: CIBLE_TACTILE_MIN, padding: '13px 15px', textDecoration: 'none',
            border: '1px solid var(--line-2)', borderRadius: 14, background: 'var(--surface)', minWidth: 0,
          }}>
            <span aria-hidden style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'var(--paper)', border: '1px solid var(--line-2)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={a.icon} size={17} /></span>
            <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
              <b style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{a.titre}</b>
              <span style={{ fontSize: 12, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.sous}</span>
            </span>
            <span aria-hidden style={{ flex: 1 }} />
            <span aria-hidden style={{ color: 'var(--muted)', fontWeight: 800 }}>›</span>
          </Link>
        ))}
      </div>

      {/* L'assistant · conservé, APRÈS les accès d'analyse · aucune génération auto. */}
      <h2 style={sectionH}>Demande à l’assistant</h2>
      <div style={{ marginTop: 10, marginBottom: 26 }}>
        <AssistantChat ready={aiReady} />
      </div>

      {/* Créer les variantes de ton test · SECONDAIRE · rangée compacte, quatre
          studios conservés, sans studio en vedette ni surtitre de produit clé. */}
      <h2 style={sectionH}>Créer les variantes de ton test</h2>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', margin: '10px 0 26px' }}>
        {STUDIOS.map((c) => (
          <Link key={c.href} href={c.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 9, minHeight: CIBLE_TACTILE_MIN, padding: '8px 14px 8px 9px', borderRadius: 12, textDecoration: 'none',
            border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600,
          }}>
            <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: c.teinte, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} size={15} /></span>
            {c.titre}
          </Link>
        ))}
      </div>

      {/* Explorer un exemple · replié, tout en bas. */}
      {exemple}
    </div>
  );
}

const sectionH = { margin: '0 0 4px', fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' } as const;
