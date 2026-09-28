'use client';

import Link from 'next/link';
import { modeProchaineEtape, CIBLE_TACTILE_MIN, type Journey, type Relance } from '@tiktrends/core';
import { JourneyPanel } from './JourneyPanel';
import { Icon } from './Icon';

/**
 * Ce qui passe DEVANT sur l'accueil · la prochaine itération, pas la création.
 *
 * Le MODE se décide au noyau (`modeProchaineEtape`) · installation tant que le
 * parcours n'est pas fini (le vrai `JourneyPanel`, une action dominante issue
 * du parcours), sinon on prépare l'itération avec les accès RÉELS. On n'invente
 * ni KPI ni recommandation · on ouvre Adsmap (les tests et leurs verdicts) et
 * la Veille (observer le marché). Une étape d'installation n'est jamais
 * présentée comme une hypothèse analytique.
 */
export function ProchaineEtape({ parcours }: {
  parcours: { journey: Journey; relance: Relance | null } | null;
}) {
  const mode = modeProchaineEtape({ parcoursPresent: !!parcours, journeyComplete: !!parcours?.journey.complete });

  if (mode === 'installation' && parcours) {
    return <JourneyPanel j={parcours.journey} relance={parcours.relance} />;
  }

  return (
    <section aria-label="Prépare ta prochaine itération" style={{ border: '1px solid var(--line-2)', borderRadius: 18, marginBottom: 22, background: 'var(--surface)', padding: '18px 20px' }}>
      <h2 style={{ margin: 0, fontSize: 18, fontWeight: 500, color: 'var(--ink)', letterSpacing: '-.01em' }}>Prépare ta prochaine itération</h2>
      <p style={{ margin: '6px 0 14px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: 620 }}>
        Repars de ce que la mesure a montré · relis tes tests, puis observe le marché pour poser la prochaine hypothèse.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <LienIter href="/adsmap" icon="map" titre="Ouvrir Adsmap" sous="Tes tests et leurs verdicts" />
        <LienIter href="/veille" icon="search" titre="Ouvrir la Veille" sous="Observer le marché" />
      </div>
    </section>
  );
}

function LienIter({ href, icon, titre, sous }: { href: string; icon: string; titre: string; sous: string }) {
  return (
    <Link href={href} style={{
      display: 'inline-flex', alignItems: 'center', gap: 10, minHeight: CIBLE_TACTILE_MIN, padding: '10px 15px', borderRadius: 12,
      textDecoration: 'none', border: '1px solid var(--line-2)', background: 'var(--paper)',
    }}>
      <span aria-hidden style={{ color: 'var(--accent-strong)', display: 'inline-flex' }}><Icon name={icon} size={17} /></span>
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <b style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{titre}</b>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{sous}</span>
      </span>
      <span aria-hidden style={{ color: 'var(--accent-strong)', fontWeight: 800, marginLeft: 2 }}>›</span>
    </Link>
  );
}
