import { EnTete, Ic, Vue } from '../../communs';
import type { ActionFormulaire } from './base';
import { AnnonceRetour } from './interactifs';

/**
 * « Nouvelle marque » · la maquette n'a pas d'écran dédié (la marque naît dans
 * le parcours d'accueil) · cet écran reprend sa grammaire (`form.tile` de
 * « Ajouter une règle », champs de `#invform`) pour que la création ne quitte
 * pas l'interface Spatial. Deux voies RÉELLES : `createBrandFromShopifyAction`
 * (boutique, produits, charte) et `createBrandAction` (nom, site). Le profil se
 * complète ensuite sur la fiche (« Laisser Jarvis remplir la fiche »).
 */
export interface PropsNouvelleMarque {
  depuisShopify: ActionFormulaire;
  creer: ActionFormulaire;
  retours: Record<string, string>;
}

const CHAMP = { flex: '1 1 260px', minWidth: 0, boxSizing: 'border-box', padding: '12px 16px', borderRadius: 16, background: 'var(--glass2)', border: '1px solid var(--edge)', color: '#fff', font: '500 14px var(--sf)', outline: 0 } as const;
const FORM = { display: 'grid', gap: 12, marginBottom: 16, borderColor: 'color-mix(in srgb,var(--acc) 45%,transparent)' } as const;

export function NouvelleMarque(p: PropsNouvelleMarque) {
  return (
    <Vue>
      <EnTete titre="Nouvelle marque" sous="Une fiche par marque · Jarvis s’en sert à chaque génération" />
      <form className="tile" action={p.depuisShopify} autoComplete="off" style={FORM}>
        <h2 style={{ margin: 0 }}>Depuis une boutique Shopify</h2>
        <small className="faint" style={{ fontSize: '12.5px' }}>Crée la marque et importe ses produits (images et prix) et sa charte (logo, couleurs, polices). Il suffit du domaine de la boutique.</small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input name="domain" required placeholder="ta-boutique.com ou ta-boutique.myshopify.com" aria-label="Domaine de la boutique" style={CHAMP} />
          <button className="btn pri" type="submit"><Ic n="plus" />Connecter et créer</button>
        </div>
      </form>
      <form className="tile" action={p.creer} autoComplete="off" style={{ ...FORM, borderColor: 'var(--edge2)' }}>
        <h2 style={{ margin: 0 }}>À la main</h2>
        <small className="faint" style={{ fontSize: '12.5px' }}>Le nom suffit · le site permet ensuite à Jarvis de lire la marque et de compléter la fiche.</small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input name="name" required placeholder="Nom de la marque" aria-label="Nom de la marque" style={CHAMP} />
          <input name="url" placeholder="Site (facultatif)" aria-label="Site de la marque" style={CHAMP} />
          <button className="btn pri" type="submit"><Ic n="plus" />Créer la marque</button>
        </div>
      </form>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
