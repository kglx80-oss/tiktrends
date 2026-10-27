import { EnTete, Ic, SousNav, Vue } from '../../communs';
import { CarteFavicon, ListeKv, SyncSite, type LigneKv, type PropsFaviconMarque, type PropsSyncSite } from './base';

/**
 * « Identité » · `docs/spatial/reference/identite.html` (maquette : `vIdent`).
 * PRÉSENTATIONNEL · chaque ligne vient de la fiche (`brands`), une ligne vide
 * le dit. Le statut « Complet » de chaque tuile est calculé, jamais affiché
 * d'office.
 */

export interface TuileKv { lignes: LigneKv[]; complet: boolean }

export interface PropsIdentite {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  favicon: PropsFaviconMarque;
  sync: PropsSyncSite;
  identite: TuileKv;
  couleurs: ReadonlyArray<{ code: string }>;
  typo: LigneKv[];
  ton: TuileKv;
  vocabulaire: LigneKv[];
}

const statut = (complet: boolean) => <span className={`pill ${complet ? 'g' : 'w'}`} style={{ marginLeft: 'auto' }}>{complet ? 'Complet' : 'À compléter'}</span>;

export function Identite(p: PropsIdentite) {
  return (
    <Vue>
      <EnTete titre="Identité" sous="Nom, site, logo, couleurs, ton" />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}/identite`} />
      <CarteFavicon {...p.favicon} />
      <SyncSite {...p.sync} />
      <div className="grid2">
        <section className="tile"><div className="sech" style={{ margin: 0 }}><h2>Identité</h2>{statut(p.identite.complet)}</div><ListeKv lignes={p.identite.lignes} /></section>
        <section className="tile">
          <h2>Couleurs et typo</h2>
          <div className="colorn" style={{ marginTop: 14 }}>
            {p.couleurs.length > 0
              ? p.couleurs.map((c) => <span key={c.code}><i style={{ background: c.code }} />{c.code}</span>)
              : <span className="faint">Aucune couleur renseignée</span>}
          </div>
          <ListeKv lignes={p.typo} />
        </section>
        <section className="tile"><div className="sech" style={{ margin: 0 }}><h2>Ton &amp; voix</h2>{statut(p.ton.complet)}</div><ListeKv lignes={p.ton.lignes} /></section>
        <section className="tile">
          <h2>Vocabulaire</h2>
          <ListeKv lignes={p.vocabulaire} />
          <div className="drop" style={{ marginTop: 14, padding: 16 }}><Ic n="img" /><span style={{ fontSize: '12.5px' }}>Logos, photos et vidéos de la marque · à déposer dans la Bibliothèque (JPEG, PNG, WebP)</span></div>
        </section>
      </div>
    </Vue>
  );
}
