'use client';

import { useId, useState } from 'react';
import { comparerTextes } from '@tiktrends/core';
import { carte, titre, etiquette, mini, champ, texte } from '../propositions/styles';

/**
 * Comparer deux textes, mot à mot (règle pure `comparerTextes`). Retiré :
 * barré ; ajouté : souligné · le sens est porté par le libellé lu par les
 * lecteurs d'écran, la couleur ne fait qu'appuyer.
 */

export interface TexteComparable { cle: string; libelle: string; texte: string }

export function Comparaison({ textes, initiale }: { textes: TexteComparable[]; initiale?: { a: string; b: string } }) {
  const id = useId();
  const [a, setA] = useState(initiale?.a ?? textes[0]?.cle ?? '');
  const [b, setB] = useState(initiale?.b ?? textes[1]?.cle ?? '');
  if (textes.length < 2) return <p style={mini} data-etat="comparaison-vide">Deux textes au moins pour comparer.</p>;
  const ta = textes.find((t) => t.cle === a);
  const tb = textes.find((t) => t.cle === b);
  const c = ta && tb ? comparerTextes(ta.texte, tb.texte) : null;
  return (
    <div style={carte} data-zone="comparaison">
      <h3 style={{ ...titre, fontSize: 16 }}>Comparer deux textes</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <label htmlFor={`${id}-a`} style={etiquette}>Texte A</label>
          <select id={`${id}-a`} value={a} onChange={(e) => setA(e.target.value)} style={champ}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
        </div>
        <div>
          <label htmlFor={`${id}-b`} style={etiquette}>Texte B</label>
          <select id={`${id}-b`} value={b} onChange={(e) => setB(e.target.value)} style={champ}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
        </div>
      </div>
      {c && (
        <>
          <p style={{ ...texte, color: 'var(--ink)', whiteSpace: 'pre-wrap' }} aria-label="Différences de A vers B">
            {c.segments.map((s, i) => (s.type === 'egal'
              ? <span key={i}>{s.texte}</span>
              : s.type === 'retire'
                ? <del key={i} aria-label={`retiré : ${s.texte}`} style={{ color: 'var(--muted)', textDecorationColor: 'var(--err)' }}>{s.texte}</del>
                : <ins key={i} aria-label={`ajouté : ${s.texte}`} style={{ color: 'var(--ink)', textDecorationColor: 'var(--accent-strong)', textUnderlineOffset: 3 }}>{s.texte}</ins>))}
          </p>
          <p style={mini}>A : {c.longueurA} caractères · B : {c.longueurB} caractères · {c.motsCommuns} mot{c.motsCommuns > 1 ? 's' : ''} en commun</p>
        </>
      )}
    </div>
  );
}
