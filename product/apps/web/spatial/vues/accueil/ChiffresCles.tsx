import type { ChiffresClesMeta, TonVariation } from '@tiktrends/core';

/**
 * « Chiffres clés » Meta · le bandeau commun de l'Accueil (Reporting Meta), de
 * la vue Analytics et du Radar créatif · les cartes `.grid4 .tile.kfig` de
 * l'encart « Chiffres clés » de la maquette Jarvis (qui rend les mêmes chiffres
 * avec ses propres cartes). PRÉSENTATIONNEL · les chiffres et leur phrase de
 * source viennent de LA règle (`chiffresClesMeta`), jamais d'une lecture propre
 * à l'écran. Chaque valeur porte `data-chiffre-meta`, la phrase de source
 * `data-source-meta` · la garde les compare d'un écran à l'autre.
 */
const COULEUR_TON: Readonly<Record<TonVariation, string>> = { neutre: 'var(--fg3)', bon: 'var(--good)', mauvais: 'var(--bad)' };

export function ChiffresCles({ c }: { c: ChiffresClesMeta }) {
  return (
    <div data-bloc="chiffres-cles" data-source={c.source} style={{ display: 'grid', gap: 8 }}>
      <div className="sech" style={{ margin: 0 }}>
        <div className="lbl">{c.titre}</div>
        <span className="faint" data-source-meta="" style={{ fontSize: '12px' }}>{c.mention}</span>
      </div>
      <div className="grid4">
        {c.kpis.map((k) => (
          <div className="tile kfig" key={k.cle}>
            <span className="lbl">{k.libelle}</span>
            <span className="v" data-chiffre-meta={k.cle}>{k.valeur}</span>
            {k.variation && <span className="d" style={{ color: COULEUR_TON[k.ton] }}>{k.variation}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
