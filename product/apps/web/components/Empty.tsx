import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

/**
 * Ce qu'on affiche quand il n'y a rien.
 *
 * ── Pourquoi ça mérite un composant ──────────────────────────────────────────
 *
 * Le produit comptait dix-huit états vides écrits à la main, de la phrase grise
 * isolée (« Aucun ticket. ») à la carte pointillée avec emoji et paragraphe.
 * Même situation, dix-huit rendus.
 *
 * Or **un état vide est le premier écran qu'un nouveau client voit** sur chaque
 * fonctionnalité. C'est là que le produit s'explique, ou qu'il perd la personne.
 * Aujourd'hui la plupart sont un point final.
 *
 * ── Trois situations, et on les confondait ───────────────────────────────────
 *
 * - `todo` · c'est vide parce qu'il y a quelque chose À FAIRE. Un lot à créer,
 *   une marque à renseigner, un concurrent à suivre.
 * - `wait` · c'est vide et ça se remplira tout seul. Les verdicts arrivent avec
 *   la mesure, les trouvailles avec la nuit. Rien à faire, et le dire évite de
 *   chercher un bouton qui n'existe pas.
 * - `good` · c'est vide et c'est une BONNE nouvelle. « Rien à décider »,
 *   « aucun incident ». L'afficher dans le même gris qu'un manque est un
 *   contresens : on annonce une réussite sur le ton d'un échec.
 *
 * ── La règle rendue impossible à contourner ──────────────────────────────────
 *
 * Un état `todo` sans geste proposé est une impasse · on dit à quelqu'un qu'il
 * manque quelque chose et on le laisse chercher. Le type l'interdit : sur
 * `todo`, `action` est **obligatoire**. Ce n'est pas une convention qu'on
 * rappelle en revue, c'est une erreur de compilation.
 */

interface Base {
  /** Le fait, court · « Aucun lot ouvert ». */
  title: string;
  /**
   * Pourquoi c'est vide · souvent la partie la plus utile.
   * « Aucun verdict arbitré » et « aucune donnée » ne se corrigent pas pareil.
   */
  why?: ReactNode;
  /** Illustration facultative · un emoji suffit, et deux distraient. */
  icon?: string;
  /** Contenu libre sous le texte · un formulaire court, par exemple. */
  children?: ReactNode;
}

interface Action { label: string; href: string }

export type EmptyProps =
  // Sur `todo`, l'action est obligatoire · un manque sans issue est une impasse.
  | (Base & { tone: 'todo'; action: Action })
  | (Base & { tone: 'wait'; action?: Action })
  | (Base & { tone: 'good'; action?: Action });

const TON: Record<EmptyProps['tone'], { bord: string; fg: string; trait: string }> = {
  todo: { bord: 'var(--line-2)', fg: 'var(--ink)', trait: 'dashed' },
  // Un `wait` est plein et sobre · rien à faire, donc rien qui appelle le clic.
  wait: { bord: 'var(--line)', fg: 'var(--ink-2)', trait: 'solid' },
  // Un `good` se voit · c'est une réussite, pas un manque.
  good: { bord: 'rgba(126,232,191,.4)', fg: '#7ee8bf', trait: 'solid' },
};

const bloc = (t: (typeof TON)[EmptyProps['tone']]): CSSProperties => ({
  border: `1px ${t.trait} ${t.bord}`,
  borderRadius: 16,
  padding: '32px 24px',
  textAlign: 'center',
  background: t.trait === 'solid' ? 'var(--surface)' : 'transparent',
});

export function Empty(props: EmptyProps) {
  const t = TON[props.tone];
  const action = 'action' in props ? props.action : undefined;

  return (
    <div style={bloc(t)}>
      {props.icon && <div style={{ fontSize: 28, lineHeight: 1 }} aria-hidden>{props.icon}</div>}

      <p style={{ margin: props.icon ? '12px 0 0' : 0, fontSize: 14, fontWeight: 700, color: t.fg }}>
        {props.title}
      </p>

      {props.why && (
        <p style={{ margin: '7px auto 0', maxWidth: 480, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65 }}>
          {props.why}
        </p>
      )}

      {action && (
        <Link
          href={action.href}
          style={{
            display: 'inline-block', marginTop: 16, padding: '9px 18px', borderRadius: 999,
            background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 12.5,
            textDecoration: 'none',
          }}
        >
          {action.label}
        </Link>
      )}

      {props.children && <div style={{ marginTop: 14 }}>{props.children}</div>}
    </div>
  );
}

/**
 * Version en une ligne, pour l'intérieur d'une carte déjà cadrée.
 *
 * Le bloc complet au milieu d'un panneau de trois lignes ferait plus de bruit
 * que la donnée qu'il remplace · un tableau vide dans une section n'a pas besoin
 * d'une mise en scène.
 */
export function EmptyLine({ children, tone = 'wait' }: { children: ReactNode; tone?: EmptyProps['tone'] }) {
  return (
    <p style={{ margin: 0, fontSize: 12.5, color: tone === 'good' ? '#7ee8bf' : 'var(--muted)', lineHeight: 1.6 }}>
      {children}
    </p>
  );
}
