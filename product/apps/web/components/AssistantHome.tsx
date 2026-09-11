'use client';

import Link from 'next/link';
import { AssistantChat } from './AssistantChat';
import { Icon } from './Icon';

export interface AssistantHomeProps {
  firstName: string;
  credits: number;
  brandName: string | null;
  brandId: string | null;
  aiReady: boolean;
}

/**
 * L'accueil · une page de garde simple qui ORIENTE, façon « home » d'un outil.
 *
 * ── Ce qu'elle faisait, et pourquoi ça n'allait pas ──────────────────────────
 *
 * L'accueil empilait un chat, des « routines », et un explorateur à onglets avec
 * une icône emoji par catégorie · beaucoup à lire avant de savoir où cliquer.
 * Le reproche est juste : une home doit dire « voilà ce que tu peux créer », pas
 * dérouler un catalogue.
 *
 * ── Ce qu'elle fait maintenant ───────────────────────────────────────────────
 *
 * Un bandeau d'accueil, puis une grille CRÉER — les quatre studios, Pubs IA en
 * tête (le produit phare) — chacun avec une vraie icône au trait, pas un emoji.
 * En-dessous, une rangée de raccourcis pour observer et piloter, et le chat en
 * dernier · il reste, mais il ne barre plus l'entrée.
 */

interface Carte {
  href: string;
  icon: string;
  titre: string;
  quoi: string;
  tag: string;
  phare?: boolean;
}

const CREER: Carte[] = [
  { href: '/studio/ads', icon: 'sparkles', titre: 'Pubs IA', quoi: 'Des publicités complètes, prêtes à tester · le cœur de l’outil.', tag: 'Pub', phare: true },
  { href: '/studio/image', icon: 'image', titre: 'Image IA', quoi: 'Un visuel produit ou une scène, en quelques secondes.', tag: 'Image' },
  { href: '/studio/video', icon: 'film', titre: 'Vidéo IA', quoi: 'Une vidéo verticale prête pour TikTok / Reels.', tag: 'Vidéo' },
  { href: '/studio/textes', icon: 'pen', titre: 'Textes IA', quoi: 'Des accroches et des scripts prêts à tourner.', tag: 'Texte' },
];

const PILOTER: Array<{ href: string; icon: string; label: string }> = [
  { href: '/veille/scale', icon: 'trend', label: 'Ce qui scale' },
  { href: '/radar', icon: 'radar', label: 'Radar produits' },
  { href: '/analytics', icon: 'chart', label: 'Analytics' },
  { href: '/adsmap', icon: 'map', label: 'Adsmap · tests' },
  { href: '/jarvis', icon: 'brain', label: 'Ce que Jarvis sait' },
  { href: '/assets', icon: 'folder', label: 'Assets' },
];

export function AssistantHome({ firstName, credits, brandName, aiReady }: AssistantHomeProps) {
  return (
    <div style={{ marginBottom: 32 }}>
      {/* Bandeau d'accueil · une phrase, une action, le solde. */}
      <div style={{
        position: 'relative', overflow: 'hidden', borderRadius: 20, padding: 'clamp(20px, 4vw, 34px)',
        marginBottom: 24, border: '1px solid var(--line-2)',
        background: 'linear-gradient(135deg, rgba(230,0,126,.22), rgba(120,40,200,.14) 60%, var(--surface))',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--accent-strong)', marginBottom: 6 }}>TikTrends</div>
            <h1 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: 'var(--ink)', lineHeight: 1.12 }}>
              Bonjour {firstName}
            </h1>
            <p style={{ margin: '8px 0 0', fontSize: 14.5, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 560 }}>
              {brandName
                ? <>Marque active · <b style={{ color: 'var(--ink)' }}>{brandName}</b>. Crée ta prochaine créative gagnante, teste, et laisse la mesure trancher.</>
                : <>Choisis une marque et lance-toi · l’outil t’amène de l’idée à la créative testée.</>}
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
              <Link href="/studio/ads" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '11px 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 800, fontSize: 13.5, textDecoration: 'none' }}>
                <Icon name="sparkles" size={16} /> Créer des pubs IA
              </Link>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '11px 15px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'rgba(8,5,10,.35)', fontSize: 13, color: 'var(--ink-2)' }}>
                <span style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name="coin" size={15} /></span>
                {credits.toLocaleString('fr-FR')} crédits
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Créer · les quatre studios, Pubs IA en tête. */}
      <h2 style={sectionH}>Créer</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, margin: '10px 0 26px' }}>
        {CREER.map((c) => (
          <Link key={c.href} href={c.href} style={{
            display: 'block', padding: '17px 18px', textDecoration: 'none', position: 'relative',
            border: `1px solid ${c.phare ? 'var(--accent-strong)' : 'var(--line-2)'}`, borderRadius: 18, background: 'var(--surface)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
              <span style={{
                width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--grad-accent)',
                color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}><Icon name={c.icon} size={21} /></span>
              <b style={{ flex: 1, minWidth: 0, fontSize: 15.5, color: 'var(--ink)' }}>{c.titre}</b>
              <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: c.phare ? '#7ee8bf' : 'var(--muted)', border: `1px solid ${c.phare ? 'rgba(126,232,191,.4)' : 'var(--line-2)'}`, borderRadius: 999, padding: '2px 8px' }}>{c.phare ? 'Phare' : c.tag}</span>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{c.quoi}</p>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12, fontSize: 12, fontWeight: 800, color: 'var(--accent-strong)' }}>
              Ouvrir <span aria-hidden>›</span>
            </span>
          </Link>
        ))}
      </div>

      {/* Observer & piloter · les raccourcis, en chips discrètes. */}
      <h2 style={sectionH}>Observer &amp; piloter</h2>
      <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', margin: '10px 0 26px' }}>
        {PILOTER.map((p) => (
          <Link key={p.href} href={p.href} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 12, textDecoration: 'none',
            border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink-2)', fontSize: 13, fontWeight: 600,
          }}>
            <span style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name={p.icon} size={16} /></span>
            {p.label}
          </Link>
        ))}
      </div>

      {/* Le chat · il reste, mais il ne barre plus l'entrée. */}
      <h2 style={sectionH}>Demande à l’assistant</h2>
      <div style={{ marginTop: 10 }}>
        <AssistantChat ready={aiReady} />
      </div>
    </div>
  );
}

const sectionH = { margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' } as const;
