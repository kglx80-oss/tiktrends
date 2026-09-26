import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '../../../lib/auth';
import { roleAtLeast } from '../../../lib/rbac';
import { getActiveBrand } from '../../../lib/brands';
import { Icon } from '../../../components/Icon';
import { JarvisChat } from './JarvisChat';
import { Empty } from '../../../components/Empty';

export const dynamic = 'force-dynamic';

/**
 * Jarvis · l'espace où l'on parle.
 *
 * ── Ce qui a changé, et pourquoi ─────────────────────────────────────────────
 *
 * La page portait le nom mais restait un TABLEAU DE BORD · huit blocs de mesures
 * empilés sous une conversation reléguée. On l'a d'abord repliée derrière une
 * révélation · ce n'était qu'une transition. La direction validée tranche :
 * Jarvis est d'abord une conversation, et son détail — mémoire, bilan, sources —
 * vit à SA destination, la page `sources`, atteinte à la demande.
 *
 * Cette page ne fait donc plus qu'une chose : accueillir la conversation. Rien
 * n'est perdu · le détail n'a pas disparu, il a déménagé (voir `sources/page`),
 * avec ses gardes d'accès intactes.
 */
export default async function JarvisPage() {
  const s = await getSession();
  if (!s) redirect('/login');
  if (!roleAtLeast(s.role, 'member')) redirect('/dashboard');

  const brand = await getActiveBrand(s.workspaceId);

  if (!brand) {
    return (
      <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 700, margin: '0 auto' }}>
        <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Jarvis</h1>
        <div style={{ marginTop: 20 }}>
          <Empty
            tone="todo" title="Sélectionne une marque active."
            why="Jarvis apprend marque par marque · sa mémoire n’a de sens que rapportée à une marque précise."
            action={{ label: 'Choisir une marque', href: '/brands' }}
          />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: '30px clamp(16px, 4vw, 36px) 60px', maxWidth: 1180, margin: '0 auto' }}>
      {/* En-tête sobre (charte) · titre 32/28, la marque, une phrase humaine. Le
          détail technique (couches alimentées, prochaine à ouvrir) vit dans
          Sources · la conversation reste calme. */}
      <div style={{ padding: '4px 0 18px', marginBottom: 20, borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', color: 'var(--muted)', flexShrink: 0 }}><Icon name="brain" size={22} /></span>
          <h1 style={{ margin: 0, fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Jarvis</h1>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>· {brand.name}</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--ink-2)', maxWidth: 640, lineHeight: 1.5 }}>
          Demande-lui ce que tu veux sur {brand.name} · il cite tes chiffres, ou il admet qu’il n’en a pas.
        </p>
      </div>

      {/* La conversation, seule au premier plan · c'est la seule interface qui
          n'exige pas de savoir où chercher. */}
      <JarvisChat />

      {/* La porte vers le détail · il vit à sa destination, pas sur cet écran.
          « Ajouter du contexte » (dans le chat) y renvoie aussi. */}
      <Link
        href="/jarvis/sources"
        style={{
          display: 'flex', alignItems: 'center', gap: 12, marginTop: 14,
          padding: '13px 16px', borderRadius: 14, textDecoration: 'none',
          border: '1px solid var(--line-2)', background: 'var(--surface)',
        }}
      >
        <span style={{ display: 'inline-flex', color: 'var(--accent-strong)', flexShrink: 0 }}><Icon name="chart" size={18} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Sources · ce que Jarvis sait</span>
          <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginTop: 2 }}>
            Sa mémoire mesurée de la marque, de quoi la nourrir, et ses réglages · les essais, l’attribution et le marché se lisent à leur destination.
          </span>
        </span>
        <span style={{ color: 'var(--muted)', fontSize: 15, flexShrink: 0 }}>›</span>
      </Link>

      {/* Personnaliser Jarvis · rejoue l'accueil (usage, expérience pub,
          objectif, marque) à la demande · le parcours est facultatif et ne se
          rejoue que sur ce clic, jamais tout seul. */}
      <div style={{ marginTop: 10, textAlign: 'center' }}>
        <Link href="/onboarding?redo=1" style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
          Personnaliser Jarvis · revoir mes réponses d’accueil
        </Link>
      </div>
    </main>
  );
}
