import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { ListeKv, SyncSite, type ActionFormulaire, type LigneKv, type PropsSyncSite } from './base';
import { AnnonceRetour, BoutonAppel, BoutonServeur, BoutiqueShopify, FormulaireSurcouche, SupprimerConfirme } from './interactifs';
import { ArchiverFiche, FicheAllegation, FicheOffre, type AllegationEditable, type ArchiverFicheAction, type EnregistrerFicheAction, type OffreEditable } from './offres-client';
import { DansLesTests, type DansLesTestsVue } from './dans-les-tests';

/**
 * « Offre » · `docs/spatial/reference/offre.html` (maquette : `vOffre`).
 * PRÉSENTATIONNEL · les produits viennent de `products`, l'état de chaque fiche
 * est calculé (noyau `statutFicheProduit`).
 *
 * Lot 9 bis V5 (VB M07, PR04) · « Offres & conditions » lit les offres de la
 * marque (`adsmap_offers` · intitulé, type, conditions, active ou archivée) et
 * « Allégations » ce qu'elle affirme (`brand_claims` · texte, preuve, statut).
 * Écart DÉCLARÉ à la maquette (gardé par `spatial-marque.test.tsx`) · les
 * gestes (`[data-offres]`) à trois places seulement · dans le `.t` d'une
 * offre, « Nouvelle offre » sous la grille, et la tuile des allégations en
 * dernier. Absentes (`offres` non passé), la tuile dit qu'aucune offre n'est
 * lue, comme avant.
 *
 * « Dans les tests » d'une offre (`[data-offres="tests"]`, lecture par offre ·
 * `lectureOffres`) · dans le `.t` de l'offre, juste avant ses gestes · son
 * compte, sa lecture contre le reste de la marque, ses « Lots de test » et, si
 * elle se détache, « Itérer sur cette offre » et « Créer une hypothèse ». La
 * règle se dit une fois, sous la grille. Écart déclaré et gardé, lui aussi.
 */

export interface OffreVue {
  id: string; intitule: string; detail: string; active: boolean; editable: OffreEditable;
  /** « Créer une pub » avec cette offre présélectionnée · fermé (sans Studios, offre archivée), la raison s'écrit à côté. */
  creerPub: { href: string | null; raison: string | null };
  /** « Dans les tests » · lu par la page (`lectureOffres`), ou fermé avec sa raison · absent, rien n'est ajouté. */
  tests?: { ferme: true; raison: string } | ({ ferme: false } & DansLesTestsVue);
}
export interface AllegationVue {
  id: string; texte: string; preuve: string | null; statut: 'a_prouver' | 'prouvee'; libelleStatut: string;
  /** Le signal d'une allégation « à prouver » · écrit à côté, partout. */
  signal: string | null;
  archivee: boolean; editable: AllegationEditable;
}
export interface GestesFiche { enregistrer: EnregistrerFicheAction | null; archiver: ArchiverFicheAction | null; raison: string | null }

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
  /** Lot 9 bis · les offres de la marque, la pastille des conditions manquantes et les gestes. */
  offres?: {
    liste: readonly OffreVue[];
    /** La pastille des conditions essentielles manquantes (`pastilleManquesOffres`) · `null` quand rien ne manque. */
    manque: string | null;
    /** Les conditions essentielles qu'aucune offre active ne couvre · une carte « Manquante » chacune, comme la maquette. */
    manquantes: ReadonlyArray<{ type: string; libelle: string }>;
    gestes: GestesFiche;
    /** La règle de la lecture par offre, dite une fois sous la grille · absente, rien n'est ajouté. */
    regle?: string | null;
  };
  /** Lot 9 bis · les allégations de la marque et leurs gestes. */
  allegations?: { liste: readonly AllegationVue[]; gestes: GestesFiche };
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
        {p.offres ? <Offres brandId={p.brandId} {...p.offres} /> : (
          <section className="tile" style={{ gridColumn: '1/-1' }}>
            <div className="sech" style={{ margin: '0 0 10px' }}><h2>Offres &amp; conditions</h2></div>
            <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Les offres de la marque ne sont pas lues ici.</p>
          </section>
        )}
        {p.allegations && <Allegations brandId={p.brandId} {...p.allegations} />}
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}

/** « Offres & conditions » · la tuile de la maquette (grille de `.prow`), lue en base. */
function Offres({ brandId, liste, manque, manquantes, gestes, regle = null }: { brandId: string; liste: readonly OffreVue[]; manque: string | null; manquantes: ReadonlyArray<{ type: string; libelle: string }>; gestes: GestesFiche; regle?: string | null }) {
  return (
    <section className="tile" style={{ gridColumn: '1/-1' }} aria-label="Offres de la marque">
      <div className="sech" style={{ margin: '0 0 10px' }}><h2>Offres &amp; conditions</h2>{manque && <span className="pill w" style={{ marginLeft: 'auto' }}>{manque}</span>}</div>
      <div className="grid3">
        {liste.map((o) => (
          <div className="prow" key={o.id} data-offre={o.id} data-active={o.active ? 'oui' : 'non'}>
            <span className="ico"><Ic n="tag" /></span>
            <div className="t">
              <strong style={{ fontSize: 13 }}>{o.intitule}</strong>
              <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{o.detail}</small>
              {o.tests && (
                <div data-offres="tests" data-tests-de-offre={o.id} style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                  <span className="lbl" style={{ margin: 0 }}>Dans les tests</span>
                  {o.tests.ferme ? <small className="faint" style={{ fontSize: '11.5px' }}>{o.tests.raison}</small> : <DansLesTests groupe="offre" t={o.tests} />}
                </div>
              )}
              <span data-offres="gestes" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <FicheOffre brandId={brandId} offre={o.editable} enregistrer={gestes.enregistrer} raison={gestes.raison} />
                <ArchiverFiche brandId={brandId} id={o.id} archive={o.active} libelle={o.active ? 'Archiver' : 'Réactiver'} geste={o.active ? 'archiver' : 'reactiver'} archiver={gestes.archiver} raison={gestes.raison} />
                {o.creerPub.href
                  ? <Lien className="btn sm" href={o.creerPub.href} data-creer-avec-offre={o.id} style={{ minHeight: 44 }} title="Ouvre Nouveau projet avec cette offre présélectionnée dans « Quelle offre ? »"><Ic n="brush" />Créer une pub</Lien>
                  : <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}><button className="btn sm" type="button" disabled style={{ minHeight: 44 }}><Ic n="brush" />Créer une pub</button>{o.creerPub.raison && <small className="faint" style={{ fontSize: '11.5px' }}>{o.creerPub.raison}</small>}</span>}
              </span>
            </div>
            <span className={`pill ${o.active ? 'g' : ''}`.trim()}>{o.active ? 'Active' : 'Archivée'}</span>
          </div>
        ))}
        {manquantes.map((m) => (
          <div className="prow" key={m.type} data-offre-manquante={m.type}>
            <span className="ico"><Ic n="tag" /></span>
            <div className="t"><strong style={{ fontSize: 13 }}>{m.libelle}</strong><small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>À renseigner · « Nouvelle offre », type {m.libelle.toLocaleLowerCase('fr')}</small></div>
            <span className="pill w">Manquante</span>
          </div>
        ))}
      </div>
      {liste.length === 0 && <p data-offres="vide" className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Aucune offre enregistrée · une remise, un bundle, une garantie ou la livraison se choisissent ensuite au brief d’un projet.</p>}
      <div data-offres="nouvelle" style={{ marginTop: 10 }}><FicheOffre brandId={brandId} offre={null} enregistrer={gestes.enregistrer} raison={gestes.raison} /></div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Seules les offres actives se choisissent au brief · une offre archivée reste lue sur les lots qui l’ont diffusée.{regle ? ` ${regle}` : ''}</p>
    </section>
  );
}

/** « Allégations » · ce que la marque affirme, sa preuve, son statut · une allégation « à prouver » est signalée. */
function Allegations({ brandId, liste, gestes }: { brandId: string; liste: readonly AllegationVue[]; gestes: GestesFiche }) {
  const aProuver = liste.filter((a) => !a.archivee && a.statut === 'a_prouver').length;
  return (
    <section className="tile" style={{ gridColumn: '1/-1' }} data-offres="allegations" aria-label="Allégations de la marque">
      <div className="sech" style={{ margin: '0 0 10px' }}>
        <h2>Allégations</h2>
        {aProuver > 0 && <span className="pill w" style={{ marginLeft: 'auto' }}>{aProuver} à prouver</span>}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {liste.map((a) => (
          <div className="prow" key={a.id} data-allegation={a.id} data-statut={a.statut} data-archivee={a.archivee ? 'oui' : 'non'}>
            <span className="ico"><Ic n={a.statut === 'prouvee' ? 'check' : 'warn'} /></span>
            <div className="t">
              <strong style={{ fontSize: 13 }}>{a.texte}</strong>
              <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{a.preuve ? `Preuve · ${a.preuve}` : 'Aucune preuve ni source'}</small>
              {a.signal && <small data-signal-allegation="" style={{ display: 'block', fontSize: '11.5px', color: 'var(--warn-text)' }}>{a.signal}</small>}
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <FicheAllegation brandId={brandId} allegation={a.editable} enregistrer={gestes.enregistrer} raison={gestes.raison} />
                <ArchiverFiche brandId={brandId} id={a.id} archive={!a.archivee} libelle={a.archivee ? 'Rétablir' : 'Archiver'} geste={a.archivee ? 'retablir-allegation' : 'archiver-allegation'} archiver={gestes.archiver} raison={gestes.raison} />
              </span>
            </div>
            <span className={`pill ${a.archivee ? '' : a.statut === 'prouvee' ? 'g' : 'w'}`.trim()}>{a.archivee ? 'Archivée' : a.libelleStatut}</span>
          </div>
        ))}
        {liste.length === 0 && <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Aucune allégation enregistrée · note ce que la marque affirme, avec sa preuve ou sa source.</p>}
      </div>
      <div style={{ marginTop: 10 }}><FicheAllegation brandId={brandId} allegation={null} enregistrer={gestes.enregistrer} raison={gestes.raison} /></div>
      <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Une allégation « à prouver » est signalée partout où elle est proposée · elle devient « prouvée » avec sa preuve ou sa source.</p>
    </section>
  );
}
