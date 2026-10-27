import { EnTete, Ic, Lien, SousNav, Vue } from '../../communs';
import type { CibleACompleter, EtapeConfigurationMarque } from '@tiktrends/core';
import { CarteFavicon, SyncSite, type ActionFormulaire, type PropsFaviconMarque, type PropsSyncSite } from './base';
import { AjoutAssets, AnnonceRetour, BoutonServeur, CarteConfiguration, CompleterChamp } from './interactifs';

/**
 * « Marque » · vue d'ensemble de la fiche · `docs/spatial/reference/marque.html`
 * (maquette : `vMarqueV` + `favCard` + `setupCard`). PRÉSENTATIONNEL · la page
 * `app/(spatial)/sp/brands/[id]` lit la fiche et passe tout en props. Une tuile
 * sans donnée le dit · aucune valeur de la maquette n'est reprise.
 */

export interface LigneACompleterVue { cle: string; titre: string; detail: string; icone: string; cible: CibleACompleter }

export interface PropsMarque {
  sousNav: ReadonlyArray<{ href: string; libelle: string }>;
  brandId: string;
  nom: string;
  favicon: PropsFaviconMarque;
  /** `null` · tout est configuré, la carte disparaît (maquette : `done === tot`). */
  configuration: { etapes: EtapeConfigurationMarque[]; faites: number; total: number; part: number } | null;
  questionnaire: string | null;
  sync: PropsSyncSite;
  aCompleter: readonly LigneACompleterVue[];
  /** « Laisser Jarvis remplir la fiche » · `generateFullBrandAction`, même prix que le scan. */
  remplir: { action: ActionFormulaire | null; cout: number | null; raison: string | null };
  /** L'édition en place d'un champ · `updateBrandAction` et les valeurs ACTUELLES de tous les champs. */
  edition: { action: ActionFormulaire | null; valeurs: Record<string, string> };
  couleurs: readonly string[];
  ton: readonly string[];
  produit: { nom: string; image: string | null; detail: string } | null;
  affirmer: readonly string[];
  interdits: readonly string[];
  /** `etiquette` · le statut quand il appelle un geste (persona proposé, à valider). */
  audiences: ReadonlyArray<{ initiale: string; teinte: string; nom: string; detail: string | null; etiquette: string | null }>;
  assets: ReadonlyArray<{ id: string; src: string }>;
  ajoutAssets: { televerser: Parameters<typeof AjoutAssets>[0]['televerser']; raison: string | null };
  retours: Record<string, string>;
}

const vide = (t: string) => <p className="faint" style={{ fontSize: '12.5px' }}>{t}</p>;

export function Marque(p: PropsMarque) {
  const n = p.aCompleter.length;
  return (
    <Vue>
      <EnTete titre="Marque" sous="Jarvis s’appuie sur cette fiche à chaque génération" />
      <SousNav items={p.sousNav} actif={`/brands/${p.brandId}`} />
      <CarteFavicon {...p.favicon} />
      {p.configuration && <CarteConfiguration marque={p.nom} questionnaire={p.questionnaire} {...p.configuration} />}
      <SyncSite {...p.sync} />
      <section className="tile" id="a-completer" style={{ marginBottom: 16 }}>
        <div className="sech" style={{ margin: '0 0 10px' }}>
          <div>
            <h2>{n > 0 ? 'À compléter' : 'Fiche complète'}</h2>
            <p className="faint" style={{ fontSize: '12.5px' }}>{n > 0 ? `${n} élément${n > 1 ? 's' : ''} · Jarvis peut les préremplir depuis le site` : 'Les douze éléments de la fiche sont renseignés'}</p>
          </div>
          <BoutonServeur className="btn pri sm" style={{ marginLeft: 'auto' }} action={n > 0 ? p.remplir.action : null} champs={{ brandId: p.brandId }} raison={n > 0 ? p.remplir.raison : 'La fiche est complète'} attente="Jarvis lit le site…">
            <Ic n="spark" />Laisser Jarvis remplir la fiche{p.remplir.cout != null ? ` · ${p.remplir.cout} crédit${p.remplir.cout > 1 ? 's' : ''}` : ''}
          </BoutonServeur>
        </div>
        {n > 0 && (
          <div className="todo">
            {p.aCompleter.map((l) => (
              <div className="row" key={l.cle}>
                <span className="ico" style={{ color: 'var(--warn)' }}><Ic n={l.icone} /></span>
                <div className="t"><strong style={{ fontSize: 13 }}>{l.titre}</strong><small>{l.detail}</small></div>
                {l.cible.type === 'lien'
                  ? <Lien className="btn sm" href={l.cible.href}>Compléter</Lien>
                  : <CompleterChamp action={p.edition.action} valeurs={p.edition.valeurs} champ={l.cible.champ} saisie={l.cible.saisie} titre={l.titre} aide={l.detail} />}
              </div>
            ))}
          </div>
        )}
      </section>
      <div className="brand">
        <section className="tile">
          <div className="lbl">Couleurs et ton</div>
          {p.couleurs.length > 0 && <div className="sw">{p.couleurs.map((c) => <i key={c} style={{ background: c }} />)}</div>}
          {p.ton.length > 0 && <div className="chips">{p.ton.map((t) => <span className="pill" key={t}>{t}</span>)}</div>}
          {p.couleurs.length === 0 && p.ton.length === 0 && vide('Ni couleur ni ton renseignés')}
        </section>
        <section className="tile">
          <div className="lbl">Produit phare</div>
          {p.produit
            ? <div className="prod">{p.produit.image ? <img src={p.produit.image} alt={p.produit.nom} /> : <span className="ico"><Ic n="tag" /></span>}<div><h3>{p.produit.nom}</h3><p className="muted num">{p.produit.detail}</p></div></div>
            : vide('Aucun produit · ajoute-le dans Offre')}
        </section>
        <section className="tile">
          <div className="lbl"><Ic n="check" />Peut affirmer</div>
          {p.affirmer.length > 0 ? <div className="chips">{p.affirmer.map((t) => <span className="pill g" key={t}>{t}</span>)}</div> : vide('Aucune promesse renseignée')}
        </section>
        <section className="tile">
          <div className="lbl"><Ic n="x" />Ne doit jamais dire</div>
          {p.interdits.length > 0 ? <div className="chips">{p.interdits.map((t) => <span className="pill r" key={t}>{t}</span>)}</div> : vide('Aucun mot à éviter renseigné')}
          <p className="faint" style={{ fontSize: '11.5px', marginTop: 10 }}>Jarvis reçoit ces mots comme « à éviter » dans chaque texte généré.</p>
        </section>
        <section className="tile wide">
          <div className="lbl"><Ic n="users" />Audiences</div>
          {p.audiences.length > 0
            ? p.audiences.map((a) => (
              <div className="aud" key={a.nom}>
                <span className="av" style={{ background: a.teinte }}>{a.initiale}</span>
                <div style={{ flex: 1 }}><strong>{a.nom}</strong>{a.detail && <p className="muted" style={{ fontSize: '12.5px' }}>{a.detail}</p>}</div>
                {a.etiquette && <span className="pill">{a.etiquette}</span>}
              </div>
            ))
            : vide('Aucun persona · décris-les dans Personas')}
        </section>
        <section className="tile">
          <div className="lbl"><Ic n="img" />Assets</div>
          <div className="assets">
            {p.assets.map((a) => <img key={a.id} src={a.src} alt="" style={{ objectPosition: '50% 50%' }} />)}
            <AjoutAssets televerser={p.ajoutAssets.televerser} raison={p.ajoutAssets.raison} />
          </div>
        </section>
      </div>
      <AnnonceRetour messages={p.retours} />
    </Vue>
  );
}
