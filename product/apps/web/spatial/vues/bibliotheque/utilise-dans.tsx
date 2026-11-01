import { detailProjetCitant, type VueUtiliseDans } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Bibliothèque · « Utilisé dans » de l'aperçu d'un fichier · les projets
 * Studios qui le citent dans les références de leur version courante, chacun
 * vers son écran « Produit et références ». Ce qui est montré, et la phrase,
 * sont décidés au noyau (`vueUtiliseDans`) · ici, le rendu seul.
 */
export function UtiliseDans({ vue }: { vue: VueUtiliseDans }) {
  return (
    <div data-utilise-dans="" style={{ display: 'grid', gap: 6 }}>
      <span className="lbl" style={{ margin: 0 }}>{vue.libelle}</span>
      {vue.projets.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
          {vue.projets.map((p) => (
            <li key={p.id} data-projet-citant={p.id} style={{ minWidth: 0 }}>
              <Lien href={p.href} className="dmore" style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, padding: '4px 2px' }}>
                <Ic n="brush" />
                <span style={{ display: 'grid', minWidth: 0 }}>
                  <strong style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.titre}</strong>
                  <small className="faint" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detailProjetCitant(p)}</small>
                </span>
              </Lien>
            </li>
          ))}
        </ul>
      )}
      {vue.phrase && <small className="faint" data-utilise-dans-phrase="">{vue.phrase}</small>}
    </div>
  );
}
