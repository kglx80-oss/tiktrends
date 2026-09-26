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
    // Écran conversationnel · colonne calme de 760 px (charte), pas la largeur
    // « data » des tableaux · la conversation et l'accueil se lisent centrés.
    <main style={{ padding: '24px clamp(16px, 4vw, 36px) 60px', maxWidth: 760, margin: '0 auto' }}>
      {/* En-tête COMPACT · Jarvis + marque, sans sous-titre redondant ni
          séparateur · le seul titre dominant est la question, à l'accueil
          (l'emblème est centré au-dessus d'elle, pas ici). À droite, un accès
          DISCRET aux Sources · cible effective 44 px, hors de la zone de saisie
          · la carte pleine largeur d'avant reproduisait mal la référence. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink)' }}>Jarvis</span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {brand.name}</span>
        </div>
        <Link
          href="/jarvis/sources"
          title="Sources de Jarvis · ce qu’il sait de ta marque, de quoi le nourrir, ses réglages"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
            padding: '0 6px', flexShrink: 0, textDecoration: 'none',
            color: 'var(--muted)', fontSize: 12.5, fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-flex', color: 'var(--accent-strong)' }}><Icon name="chart" size={15} /></span>
          Sources de Jarvis
        </Link>
      </div>

      {/* La conversation, seule au premier plan · c'est la seule interface qui
          n'exige pas de savoir où chercher. */}
      <JarvisChat />

      {/* Personnaliser Jarvis · rejoue l'accueil (usage, expérience pub,
          objectif, marque) à la demande · le parcours est facultatif et ne se
          rejoue que sur ce clic, jamais tout seul. */}
      <div style={{ marginTop: 14, textAlign: 'center' }}>
        <Link href="/onboarding?redo=1" style={{ fontSize: 12.5, color: 'var(--muted)', textDecoration: 'none' }}>
          Personnaliser Jarvis · revoir mes réponses d’accueil
        </Link>
      </div>
    </main>
  );
}
