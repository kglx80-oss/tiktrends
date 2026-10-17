import Link from 'next/link';
import type { CSSProperties } from 'react';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { Icon } from '../../../components/Icon';
import { surface, tuile } from '../../../components/ui';

/**
 * V5 · Résultats · l'invite « Que disent vos résultats ? ».
 *
 * Présentation seule, calquée sur la maquette V5 · un orbe, une phrase, des
 * suggestions, et l'entrée vers Jarvis. L'action est RÉELLE · le bouton et
 * chaque suggestion ouvrent le vrai Jarvis de la marque (`/jarvis`, derrière
 * `refusJarvis`). Rien n'est simulé · le proto préremplissait le fil, ce qui
 * n'existe pas encore (R03 · partiel), donc on n'affiche aucune réponse ni
 * préremplissage · on AMÈNE à l'outil réel, qui répond.
 *
 * Masquable au besoin · si Jarvis n'est pas ouvert au rôle courant, la page ne
 * rend simplement pas ce bloc (le serveur décide, cf. page.tsx).
 */

/** Les suggestions de la maquette · des entrées vers Jarvis, pas des réponses. */
const SUGGESTIONS: readonly string[] = [
  'Pourquoi la V2 fait mieux ?',
  'Quelle variante tester ensuite ?',
  'Résumé pour le client',
  'Ce qui manque pour conclure',
];

export function BlocJarvisResultats() {
  return (
    <section
      aria-label="Analyser vos résultats avec Jarvis"
      data-bloc="jarvis-resultats"
      style={{
        ...surface, background: 'var(--surface)', padding: 20, marginBottom: 18,
        display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap',
      }}
    >
      {/* L'orbe · dégradé d'accent + un reflet au jeton, jamais une couleur en dur. */}
      <span
        aria-hidden
        style={{
          flexShrink: 0, width: 56, height: 56, borderRadius: 999,
          background: 'radial-gradient(circle at 34% 30%, var(--on-accent), transparent 42%), var(--grad-accent)',
          boxShadow: '0 6px 18px var(--ombre)',
        }}
      />
      <div style={{ flex: '1 1 320px', minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--ink)' }}>Que disent vos résultats ?</h2>
        <p style={{ margin: '5px 0 0', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 560 }}>
          Jarvis lit vos lots, sépare ce qui est mesuré de ce qui reste une hypothèse, et propose
          la prochaine variante.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {SUGGESTIONS.map((s) => (
            <Link key={s} href="/jarvis" style={puce}>{s}</Link>
          ))}
        </div>
      </div>
      {/* L'action réelle · ouvre le vrai Jarvis (un seul fil par marque). */}
      <Link href="/jarvis" style={cta}>
        <Icon name="brain" size={16} /> Analyser avec Jarvis
      </Link>
    </section>
  );
}

const puce: CSSProperties = {
  ...tuile, display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN,
  padding: '0 13px', background: 'var(--paper)', color: 'var(--ink-2)', fontSize: 12.5,
  fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap',
};

const cta: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: CIBLE_TACTILE_MIN,
  padding: '0 18px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)',
  color: 'var(--on-accent)', fontWeight: 800, fontSize: 13, textDecoration: 'none', flexShrink: 0,
};
