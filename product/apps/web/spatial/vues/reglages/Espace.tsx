import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import { CarteNavigable, RenommerEspace, StockageEspace, type ActionsStockage } from './interactifs';

/**
 * « Espace » · `docs/spatial/reference/reglages.html` (maquette : `vEspace` +
 * `brandBox`). PRÉSENTATIONNEL · les marques viennent de `brands`, la formule
 * de la session, le descriptif des formules du noyau (repris de l'écran V5).
 * Aucune option payante « marque en plus » n'existe · son bouton est absent
 * (la maquette le retire aussi quand l'offre n'en a pas).
 */

export interface FormuleMini { nom: string; actuelle: boolean; valeur: string; detail: string }

export interface PropsEspace {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  espace: string;
  plan: string;
  /** `fond` · la teinte décorative du logo (la première marque garde celle de la feuille de style). */
  marques: ReadonlyArray<{ id: string; initiale: string; nom: string; detail: string; fond: string | null }>;
  /** Le libellé du nombre de marques de la formule (« Jusqu’à 3 marques »). */
  inclus: string;
  /** La création réelle d'une marque · `null` sans droit. */
  ajouter: string | null;
  formules: readonly FormuleMini[];
  preferences: { langue: 'fr' | 'en'; fuseau: string; devise: string; nommage: string | null };
  video: string | null;
  /**
   * Les gestes de l'écran V5 `/settings` sans fragment de maquette (vague 2) ·
   * nom de l'espace, services activés, stockage. Absents, l'écran reste celui de
   * la maquette (garde de parité).
   */
  gestion?: GestionEspace;
}

export interface GestionEspace {
  renommer: ((prev: { ok?: boolean; error?: string } | null, fd: FormData) => Promise<{ ok?: boolean; error?: string }>) | null;
  services: ReadonlyArray<{ cle: string; libelle: string; debloque: string; branche: boolean }>;
  stockage: {
    titre: string; badge: string; actif: boolean; intro: string; operateur: boolean;
    /** Le texte affiché quand rien n'est actionnable (stockage inactif) · et son lien de ticket, s'il y en a un. */
    inactif: { texte: string; lien: { libelle: string; href: string } | null } | null;
    actions: ActionsStockage;
  };
}

/** Les tuiles des gestes V5 portés · même langage que la maquette (`.tile`, `.nprefs`, `.npr`, `.pill`). */
function TuilesGestion({ espace, g }: { espace: string; g: GestionEspace }) {
  const actifs = g.services.filter((x) => x.branche).length;
  return (
    <>
      <section className="tile" data-geste="nom-espace" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
        <div><div className="lbl" style={{ margin: 0 }}>Espace</div><h2 style={{ margin: '4px 0 0' }}>Nom de l’espace</h2></div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Le nom affiché de l’espace (agence ou client), dans le rail et les invitations.</p>
        <RenommerEspace nom={espace} renommer={g.renommer} />
        <div style={{ height: 1, background: 'var(--edge2)' }} />
        <div data-geste="stockage" style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><h2 style={{ margin: 0 }}>{g.stockage.titre}</h2><span className={`pill${g.stockage.actif ? ' g' : ''}`}>{g.stockage.badge}</span></div>
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>{g.stockage.intro}</p>
          {g.stockage.inactif
            ? <p className="faint" style={{ fontSize: 12.5, margin: 0 }}>{g.stockage.inactif.texte}{g.stockage.inactif.lien && <> <Lien href={g.stockage.inactif.lien.href}>{g.stockage.inactif.lien.libelle}</Lien></>}</p>
            : <StockageEspace actif={g.stockage.actif} operateur={g.stockage.operateur} actions={g.stockage.actions} />}
        </div>
      </section>
      <section className="tile" data-geste="services">
        <div className="sech" style={{ margin: '0 0 10px' }}><h2>Services activés</h2><span className="faint" style={{ fontSize: '12.5px' }}>{actifs} sur {g.services.length}</span></div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Un service à activer s’active côté plateforme, pas depuis ton espace · un ticket au <Lien href="/support">support</Lien> reste dans ton espace (seuls ses admins le lisent).</p>
        <div className="nprefs">
          {g.services.map((x) => (
            <div className="npr" key={x.cle}><div><strong>{x.libelle}</strong><small>{x.debloque}</small></div><span className={`pill${x.branche ? ' g' : ''}`}>{x.branche ? 'Branché' : 'À brancher'}</span></div>
          ))}
        </div>
      </section>
    </>
  );
}

const boiteFormule = (f: FormuleMini) => (
  <div key={f.nom} style={{ display: 'grid', gap: 2, padding: '10px 12px', borderRadius: 14, background: f.actuelle ? 'color-mix(in srgb,var(--acc) 18%,transparent)' : '#ffffff08', border: `1px solid ${f.actuelle ? 'color-mix(in srgb,var(--acc) 55%,transparent)' : 'var(--edge2)'}` }}>
    <small className="faint" style={{ fontSize: 11 }}>{f.nom}{f.actuelle ? ' · actuel' : ''}</small><b style={{ font: '600 15px var(--sfd)' }}>{f.valeur}</b><small className="faint" style={{ fontSize: '10.5px' }}>{f.detail}</small>
  </div>
);

export function Espace(p: PropsEspace) {
  const n = p.marques.length;
  return (
    <Vue>
      <EnTete titre="Espace" sous={p.espace} />
      <SousNav items={p.sousNav} actif="/settings" />
      <div className="grid2">
        <section className="tile" style={{ display: 'grid', gap: 14, borderColor: 'color-mix(in srgb,var(--acc) 30%,transparent)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            <div style={{ flex: '1 1 200px', minWidth: 0, display: 'grid', gap: 4 }}>
              <div className="lbl" style={{ margin: 0 }}>Marques · plan {p.plan}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}><b style={{ font: '600 27px/1 var(--sfd)', letterSpacing: '-.02em' }}>{n}</b><span className="faint" style={{ fontSize: 13 }}>marque{n > 1 ? 's' : ''} dans l’espace</span></div>
              <small className="faint" style={{ fontSize: 12 }}>{p.inclus} dans {p.plan}</small>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} />
          </div>
          <div style={{ height: 8, borderRadius: 8, background: '#ffffff14', overflow: 'hidden' }}><i style={{ display: 'block', height: '100%', width: '20%', background: 'linear-gradient(90deg,var(--acc),var(--acc2))', borderRadius: 8 }} /></div>
          <div className="brands">
            {p.marques.map((b) => (
              <CarteNavigable key={b.id} href={`/brands/${b.id}`}><span className="blogo" style={b.fond ? { background: b.fond } : undefined}>{b.initiale}</span><strong>{b.nom}</strong><span className="faint">{b.detail}</span></CarteNavigable>
            ))}
            {p.ajouter && (
              <CarteNavigable href={p.ajouter} role="button" style={{ borderStyle: 'dashed', cursor: 'pointer' }}><span className="blogo" style={{ background: '#ffffff1f', color: '#fff' }}><Ic n="plus" s={false} /></span><strong>Ajouter</strong><span className="faint">Nouvelle fiche marque</span></CarteNavigable>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,120px),1fr))', gap: 8 }}>{p.formules.map(boiteFormule)}</div>
        </section>
        <section className="tile">
          <h2>Préférences</h2>
          <dl className="kv2">
            <dt>Langue</dt><dd><span className={`opt2${p.preferences.langue === 'fr' ? ' on' : ''}`}>Français</span><span className={`opt2${p.preferences.langue === 'en' ? ' on' : ''}`}>English</span></dd>
            <dt>Fuseau</dt><dd>{p.preferences.fuseau}</dd>
            <dt>Devise</dt><dd>{p.preferences.devise}</dd>
            <dt>Nommage</dt><dd>{p.preferences.nommage ? <span className="files">{p.preferences.nommage}</span> : <span className="faint">Modèle par défaut des lots · réglable dans Protocole</span>}</dd>
          </dl>
        </section>
        {p.gestion && <TuilesGestion espace={p.espace} g={p.gestion} />}
        <section className="tile soon" style={{ gridColumn: '1/-1' }}>
          <div className="ad r916"><div className="ph" /><div className="band"> </div></div>
          <div style={{ flex: 1 }}><div className="lbl">Studios</div><h2>Le Studio vidéo</h2><p className="muted">Crée une vidéo à partir de ta fiche marque, puis itère une variable à la fois.</p></div>
          {p.video ? <Lien className="btn pri" href={p.video}>Créer une vidéo</Lien> : <button className="btn pri" type="button" disabled title="Les Studios ne sont pas ouverts à ton rôle ou à ta formule">Créer une vidéo</button>}
        </section>
      </div>
    </Vue>
  );
}
