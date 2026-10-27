import { Fragment } from 'react';
import { EnTete, Ic, SousNav, Vue } from '../../communs';
import type { ChampModifiableMarque } from '@tiktrends/core';
import { CarteFavicon, ListeKv, SyncSite, type ActionFormulaire, type LigneKv, type PropsFaviconMarque, type PropsSyncSite } from './base';
import { AnnonceRetour, BoutonServeur, CompleterChamp, CorrigerStyle, LogosCharte, SourcingConcurrents, SupprimerConfirme, type ChampStyleVisuel } from './interactifs';

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
  /**
   * Les gestes de la fiche V5 sans fragment de maquette (vague 2) · modifier
   * n'importe quel champ (même rempli), le style visuel, les logos de la
   * charte, supprimer la marque. Absents, l'écran est celui de la maquette.
   */
  gestion?: GestionIdentite;
}

export interface GestionIdentite {
  nom: string;
  champs: readonly ChampModifiableMarque[];
  edition: { action: ActionFormulaire | null; valeurs: Record<string, string> };
  style: {
    lignes: ReadonlyArray<{ libelle: string; valeur: string }>;
    champs: readonly ChampStyleVisuel[];
    analyser: ActionFormulaire | null; cout: number | null; raison: string | null;
    corriger: ActionFormulaire | null;
  };
  logos: Omit<Parameters<typeof LogosCharte>[0], 'brandId'>;
  sourcing: Omit<Parameters<typeof SourcingConcurrents>[0], 'brandId'>;
  supprimer: ActionFormulaire | null;
  retours: Record<string, string>;
}

function TuilesGestion({ brandId, g }: { brandId: string; g: GestionIdentite }) {
  return (
    <>
      <section className="tile" data-geste="fiche-complete" style={{ marginTop: 16 }}>
        <div className="sech" style={{ margin: '0 0 10px' }}>
          <div><h2>Toute la fiche</h2><p className="faint" style={{ fontSize: '12.5px' }}>Chaque champ se modifie ici, même déjà rempli · Jarvis relit la fiche à chaque génération</p></div>
        </div>
        <div className="todo">
          {g.champs.map((c) => (
            <div className="row" key={c.champ}>
              <span className="ico"><Ic n={c.icone} /></span>
              <div className="t"><strong style={{ fontSize: 13 }}>{c.titre}</strong><small style={{ overflowWrap: 'anywhere' }}>{c.apercu ?? 'Non renseigné'}</small></div>
              <CompleterChamp action={g.edition.action} valeurs={g.edition.valeurs} champ={c.champ} saisie={c.saisie} titre={c.titre} aide={c.aide} libelle={c.apercu ? 'Modifier' : 'Compléter'} />
            </div>
          ))}
        </div>
      </section>
      <div className="grid2" style={{ marginTop: 16 }}>
        <section className="tile" data-geste="style-visuel" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="sech" style={{ margin: 0 }}><h2>Style visuel</h2>{g.style.lignes.length > 0 && <span style={{ marginLeft: 'auto' }}><CorrigerStyle action={g.style.corriger} brandId={brandId} champs={g.style.champs} /></span>}</div>
          <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Le style lu sur le site, appliqué à chaque créa générée · la scène reste variée, le style tient.</p>
          {g.style.lignes.length > 0
            ? <dl className="kv2">{g.style.lignes.map((l) => <Fragment key={l.libelle}><dt>{l.libelle}</dt><dd>{l.valeur}</dd></Fragment>)}</dl>
            : <p className="faint" style={{ fontSize: 13, margin: 0 }}>Aucun style déduit pour l’instant.</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <BoutonServeur className="btn sm pri" action={g.style.analyser} champs={{ brandId }} raison={g.style.raison} attente="Analyse du site…">
              <Ic n="spark" />Analyser le style{g.style.cout != null ? ` · ${g.style.cout} crédit${g.style.cout > 1 ? 's' : ''}` : ''}
            </BoutonServeur>
            {g.style.lignes.length === 0 && <CorrigerStyle action={g.style.corriger} brandId={brandId} champs={g.style.champs} />}
          </div>
        </section>
        <section className="tile" data-geste="logos" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <h2>Logos de la charte</h2>
          <LogosCharte brandId={brandId} {...g.logos} />
        </section>
      </div>
      <section className="tile" data-geste="sourcing-concurrents" style={{ marginTop: 16, display: 'grid', gap: 10 }}>
        <h2 style={{ margin: 0 }}>Trouver mes concurrents avec Jarvis</h2>
        <p className="faint" style={{ fontSize: '12.5px', margin: 0 }}>Précise ton marché et ta cible · Jarvis propose des pistes à partir de la fiche, tu vérifies leurs annonces, puis tu ajoutes ta sélection aux concurrents de la fiche.</p>
        <SourcingConcurrents brandId={brandId} {...g.sourcing} />
      </section>
      <section className="tile" data-geste="supprimer-marque" style={{ marginTop: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', borderColor: '#ff9b9b40' }}>
        <div style={{ flex: '1 1 260px' }}><h2 style={{ margin: 0 }}>Supprimer la marque</h2><p className="faint" style={{ fontSize: '12.5px', margin: '4px 0 0' }}>Retire la fiche, ses personas, scénarios et produits. Une marque qui porte un historique Studios ne se supprime pas · le serveur le refuse et le dit.</p></div>
        <SupprimerConfirme action={g.supprimer} champs={{ id: brandId }} className="btn sm" libelle={`Supprimer la marque ${g.nom}`} confirmation={`Supprimer définitivement la marque « ${g.nom} » ?`}><Ic n="x" />Supprimer</SupprimerConfirme>
      </section>
      <AnnonceRetour messages={g.retours} />
    </>
  );
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
      {p.gestion && <TuilesGestion brandId={p.brandId} g={p.gestion} />}
    </Vue>
  );
}
