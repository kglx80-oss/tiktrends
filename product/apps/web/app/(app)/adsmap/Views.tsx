'use client';

import { useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { AdsMapTable } from './AdsMapTable';
import { Inbox } from './Inbox';
import { BuildPanel } from './BuildPanel';

/**
 * Trois lectures du même graphe.
 *
 * **À décider** répond à « qu'est-ce que je fais maintenant » · c'est l'onglet
 * par défaut, parce que c'est la question qu'on se pose vraiment en ouvrant
 * l'outil un lundi matin. La Table répond à « où en est ce test », la Carte à
 * « qu'est-ce qu'on n'a pas encore essayé ».
 *
 * Le canvas est chargé par `next/dynamic` avec `ssr: false` (décision D8) :
 * `@xyflow/react` et `elkjs` pèsent plus que tout le reste de l'application
 * réunie, et rien ne justifie de les servir à quelqu'un qui ne les ouvre pas.
 */

const Canvas = dynamic(() => import('./Canvas').then((m) => m.Canvas), {
  ssr: false,
  loading: () => <p style={{ color: 'var(--muted)', fontSize: 13 }}>Chargement de la carte…</p>,
});

export function Views({ batches, canBuild = false }: { batches: Array<{ id: string; number: number; status: string; ads: number }>; canBuild?: boolean }) {
  const [vue, setVue] = useState<'decider' | 'table' | 'carte'>('decider');
  // Onglets déjà ouverts · la Table n'est montée qu'à la première visite, puis
  // gardée. Muter pendant le rendu serait un effet de bord · on passe par l'état.
  const [ouverts, setOuverts] = useState<string[]>(['decider']);
  const aller = (v: 'decider' | 'table' | 'carte') => {
    setVue(v);
    setOuverts((o) => (o.includes(v) ? o : [...o, v]));
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        <button type="button" onClick={() => aller('decider')} style={onglet(vue === 'decider')}>À décider</button>
        <button type="button" onClick={() => aller('table')} style={onglet(vue === 'table')}>Table</button>
        <button type="button" onClick={() => aller('carte')} style={onglet(vue === 'carte')}>Carte</button>
      </div>

      {vue === 'decider' && <Inbox />}

      {/* La Table reste montée quand on la quitte : y revenir ne doit pas
          recharger mille lignes ni perdre les filtres posés. Elle n'est en
          revanche montée qu'à la première visite · l'onglet par défaut est la
          file, et personne n'a à payer le chargement d'une table qu'il n'ouvre pas. */}
      {ouverts.includes('table') && (
        <div style={{ display: vue === 'table' ? 'block' : 'none' }}>
          <AdsMapTable batches={batches} />
        </div>
      )}
      {vue === 'carte' && (
        <>
          <Canvas />
          {/* La construction vit sous la Carte : c'est là qu'on voit les branches
              vides, donc là qu'on a envie de les remplir. */}
          {canBuild && <BuildPanel />}
        </>
      )}
    </>
  );
}

const onglet = (actif: boolean): CSSProperties => ({
  padding: '7px 18px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  border: '1px solid ' + (actif ? 'transparent' : 'var(--line-2)'),
  background: actif ? 'var(--grad-accent)' : 'var(--surface)',
  color: actif ? '#0d070c' : 'var(--ink-2)',
});
