'use client';

import { useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { AdsMapTable } from './AdsMapTable';

/**
 * Bascule Table / Carte.
 *
 * Le canvas est chargé par `next/dynamic` avec `ssr: false` (décision D8) :
 * `@xyflow/react` et `elkjs` pèsent plus que tout le reste de l'application
 * réunie, et rien ne justifie de les servir à quelqu'un qui reste sur la Table.
 *
 * La Table reste l'onglet par défaut · c'est elle qui répond à « où en est ce
 * test », la question qu'on se pose en ouvrant l'outil un matin.
 */

const Canvas = dynamic(() => import('./Canvas').then((m) => m.Canvas), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement de la carte…</p>,
});

export function Views({ batches }: { batches: Array<{ id: string; number: number; status: string; ads: number }> }) {
  const [vue, setVue] = useState<'table' | 'carte'>('table');

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button type="button" onClick={() => setVue('table')} style={onglet(vue === 'table')}>Table</button>
        <button type="button" onClick={() => setVue('carte')} style={onglet(vue === 'carte')}>Carte</button>
      </div>

      {/* La Table reste montée pendant qu'on regarde la carte : revenir dessus ne
          doit pas recharger mille lignes ni perdre les filtres posés. */}
      <div style={{ display: vue === 'table' ? 'block' : 'none' }}>
        <AdsMapTable batches={batches} />
      </div>
      {vue === 'carte' && <Canvas />}
    </>
  );
}

const onglet = (actif: boolean): CSSProperties => ({
  padding: '7px 18px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: '1px solid ' + (actif ? 'transparent' : 'var(--line-2)'),
  background: actif ? 'var(--grad-accent)' : 'var(--surface)',
  color: actif ? '#0d070c' : 'var(--ink-2)',
});
