import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { ListeKv, SyncSite, type ActionFormulaire, type LigneKv, type PropsSyncSite } from './base';
import { AnnonceRetour, BoutonAppel, BoutonServeur, BoutiqueShopify, FormulaireSurcouche, SupprimerConfirme } from './interactifs';

/**
 * « Offre » · `docs/spatial/reference/offre.html` (maquette : `vOffre`).
 * PRÉSENTATIONNEL · les produits viennent de `products`, l'état de chaque fiche
 * est calculé (noyau `statutFicheProduit`). Les offres et conditions n'ont
 * AUCUNE table · la tuile le dit au lieu de montrer des exemples.
 */

export interface ProduitVue { id: string; nom: string; image: string | null; detail: string; complet: boolean }

export interface PropsOffre {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  sync: PropsSyncSite;
  produits: readonly ProduitVue[];
  aCompleter: string | null;
  /** Le premier produit, détaillé · `null` sans produit. */
  detail: { nom: string; lignes: LigneKv[] } | null;
  /** `addProductAction` · `null` sans droit. */
  ajouter: ActionFormulaire | null;
  /** `syncShopifyProductsAction` · seulement quand un domaine Shopify est connu. */
  shopify: { appel: (i: { brandId: string }) => Promise<{ error?: string }>; domaine: string } | null;
  retours: Record<string, string>;
  /**
   * Les gestes de la fiche V5 sans fragment de maquette (vague 2) · retirer un
   * produit, importer les produits depuis le site (payant, prix annoncé),
   * brancher la boutique Shopify par son domaine. Absents, l'écran est celui
   * de la maquette.
   */
  gestion?: {
    retirer: ActionFormulaire | null;
    importer: { action: ActionFormulaire | null; cout: number | null; raison: string | null };
    boutique: Omit<Parameters<typeof BoutiqueShopify>[0], 'brandId'>;
  };
}

export function Offre(p: PropsOffre) {
  return (
    <Vue>
      <EnTete titre="Offre" sous="Ce que la marque vend et ce qu’elle peut affirmer" />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}/offre`} />
      <SyncSite {...p.sync} />
      <div className="grid2">
        <section className="tile">
          <div className="sech" style={{ margin: '0 0 10px' }}><h2>Produits</h2>{p.aCompleter && <span className="pill w" style={{ marginLeft: 'auto' }}>{p.aCompleter}</span>}</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {p.produits.map((x) => (
              <div className="prow" key={x.id}>
                {x.image ? <img src={x.image} alt="" style={{}} /> : <span className="ico"><Ic n="tag" /></span>}
                <div className="t"><strong style={{ fontSize: 13 }}>{x.nom}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{x.detail}</small></div>
                <span className={`pill ${x.complet ? 'g' : 'w'}`}>{x.complet ? 'Complète' : 'À compléter'}</span>
                {p.gestion && <SupprimerConfirme action={p.gestion.retirer} champs={{ brandId: p.brandId, id: x.id }} libelle={`Retirer le produit ${x.nom}`} confirmation={`Supprimer le produit « ${x.nom} » ?`}><Ic n="x" /></SupprimerConfirme>}
              </div>
            ))}
            {p.produits.length === 0 && <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Aucun produit pour l’instant · Jarvis s’en sert pour parler vraiment de ton offre.</p>}
            {p.shopify
              ? <BoutonAppel className="btn sm" appel={p.shopify.appel} argument={{ brandId: p.brandId }} succes={`Catalogue ${p.shopify.domaine} synchronisé`} attente="Synchronisation…"><Ic n="loop" />Importer depuis Shopify · {p.shopify.domaine}</BoutonAppel>
              : null}
            <FormulaireSurcouche className="btn sm" action={p.ajouter} cache={{ brandId: p.brandId }} titre="Ajouter un produit" envoyer="Ajouter le produit" raison="Réservé aux administrateurs de l’espace"
              champs={[{ nom: 'name', libelle: 'Nom du produit', requis: true }, { nom: 'price', libelle: 'Prix (€)' }, { nom: 'url', libelle: 'Adresse de la fiche' }, { nom: 'description', libelle: 'Description', long: true }, { nom: 'usp', libelle: 'Ce qu’il peut affirmer', aide: 'séparé par des virgules' }]}>
              <Ic n="plus" />Ajouter un produit
            </FormulaireSurcouche>
          </div>
        </section>
        <section className="tile">
          {p.detail
            ? <><h2>{p.detail.nom}</h2><ListeKv lignes={p.detail.lignes} /></>
            : <h2>Aucun produit détaillé</h2>}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Jarvis reçoit ce que le produit peut affirmer, et les mots que la marque évite.</p>
        </section>
        {p.gestion && (
          <section className="tile" data-geste="import-produits" style={{ gridColumn: '1/-1', display: 'grid', gap: 12 }}>
            <div className="sech" style={{ margin: 0 }}><h2>Importer le catalogue</h2></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <p className="faint" style={{ fontSize: '12.5px', margin: 0, flex: '1 1 260px' }}>Jarvis lit le site de la marque et en tire les produits (nom, prix, description).</p>
              <BoutonServeur className="btn sm" action={p.gestion.importer.action} champs={{ brandId: p.brandId }} raison={p.gestion.importer.raison} attente="Jarvis lit le site…">
                <Ic n="spark" />Importer depuis le site{p.gestion.importer.cout != null ? ` · ${p.gestion.importer.cout} crédit${p.gestion.importer.cout > 1 ? 's' : ''}` : ''}
              </BoutonServeur>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <div className="lbl" style={{ margin: 0 }}>Boutique Shopify</div>
              <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Produits avec leurs images, prix et descriptions · aucune installation, juste le domaine de la boutique.</p>
              <BoutiqueShopify brandId={p.brandId} {...p.gestion.boutique} />
            </div>
          </section>
        )}
        <section className="tile" style={{ gridColumn: '1/-1' }}>
          <div className="sech" style={{ margin: '0 0 10px' }}><h2>Offres &amp; conditions</h2></div>
          <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Les offres, codes promo et garanties ne sont pas encore enregistrés dans TikTrends · Jarvis n’en propose donc aucune.</p>
        </section>
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
