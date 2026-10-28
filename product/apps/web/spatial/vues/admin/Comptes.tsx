import { LARGEUR_MIN_TABLE_TELEPHONE, VALEUR_ABSENTE, styleTableDefilante, type DeclarationAffichee } from '@tiktrends/core';
import { Ic, Lien, Vue } from '../../communs';
import { Kpis, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { ComptesListe, type LigneCompte } from './client';

/**
 * « Inscriptions & comptes » · `docs/spatial/reference/a-comptes.html`. PRÉSENTATIONNEL.
 *
 * Réel · inscriptions, essais, conversion, comptes à risque, parcours
 * d'inscription (inscrits → onboarding → 1re consommation → payants), la liste
 * des espaces. Sans source · les visiteurs du site (aucune mesure d'audience),
 * la source d'acquisition (le profil déclaré à l'onboarding la remplace),
 * « se connecter en tant que » et les crédits offerts à un autre espace.
 *
 * Hors maquette (vague 2 · portée de l'ancienne page `/admin/signups`) · le
 * profil DÉCLARÉ à l'onboarding de chaque espace récent : propriétaire,
 * expérience pub, objectifs, site, formule, inscription et onboarding.
 */
export const COLONNES_COMPTES = '1.4fr .9fr .8fr 1.1fr .9fr .9fr .8fr auto';
export const COLONNES_DECLARATIONS = '1.1fr 1.4fr .9fr 1fr 1.3fr 1fr .7fr .8fr .8fr';

export interface LigneDeclaration extends DeclarationAffichee {
  id: string;
  nom: string;
  proprietaire: string;
  forfait: string;
  inscrit: string;
  /** La date d'onboarding · `null` tant qu'il n'est pas terminé. */
  onboarde: string | null;
}

export interface PropsComptes {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  alerte: { comptes: string; mrr: string } | null;
  parcours: ReadonlyArray<{ libelle: string; n: string; hauteur: number; part: string | null }>;
  filtres: ReadonlyArray<{ cle: string; libelle: string }>;
  comptes: readonly LigneCompte[];
  note: string;
  /** Les déclarations d'onboarding · absent, la section ne s'affiche pas. */
  declarations?: { sous: string; lignes: readonly LigneDeclaration[] };
}

/** Le profil déclaré à l'onboarding · une ligne par espace récent, comme l'ancienne page. */
function Declarations({ sous, lignes }: NonNullable<PropsComptes['declarations']>) {
  return (
    <section className="tile sec" data-section="declarations">
      <div className="sech"><h2>Profil déclaré à l’onboarding</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{sous}</span></div>
      <div className="atable" data-table="declarations" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.declarations)}>
        <div className="atr ath" style={{ gridTemplateColumns: COLONNES_DECLARATIONS }}><span>Espace</span><span>Propriétaire</span><span>Profil</span><span>Expérience pub</span><span>Objectifs</span><span>Site</span><span>Plan</span><span>Inscrit</span><span>Onboardé</span></div>
        {lignes.map((l) => (
          <div className="atr" key={l.id} style={{ gridTemplateColumns: COLONNES_DECLARATIONS }} data-espace={l.id}>
            <span><b>{l.nom}</b></span>
            <span className="faint" style={{ overflowWrap: 'anywhere' }}>{l.proprietaire}</span>
            <span>{l.profil}</span>
            <span>{l.experience
              ? l.experience.herite ? <span className="faint" title="Ancienne réponse « niveau IA », pas une expérience publicitaire">{l.experience.texte}</span> : l.experience.texte
              : VALEUR_ABSENTE}</span>
            <span>{l.objectifs.length ? <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{l.objectifs.map((o) => <span className="pill" key={o}>{o}</span>)}</span> : VALEUR_ABSENTE}</span>
            <span style={{ overflowWrap: 'anywhere' }}>{l.site ? <a href={l.site.href} target="_blank" rel="noreferrer">{l.site.texte}</a> : VALEUR_ABSENTE}</span>
            <span>{l.forfait}</span>
            <span className="faint">{l.inscrit}</span>
            <span>{l.onboarde ? <span className="pill g">{l.onboarde}</span> : <span className="pill w">en cours</span>}</span>
          </div>
        ))}
        {lignes.length === 0 && <Vide>Aucun espace inscrit.</Vide>}
      </div>
    </section>
  );
}

export function Comptes(p: PropsComptes) {
  return (
    <Vue>
      <TeteAdmin titre="Inscriptions & comptes" sous="comptes" actif="/admin/signups" bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      {p.alerte && (
        <Lien className="banner sec" href="/admin/churn" style={{ textDecoration: 'none' }}>
          <Ic n="warn" /><span><b>{p.alerte.comptes}</b> · {p.alerte.mrr}. Signaux et comptes concernés : <b>Churn & rétention</b>.</span><Ic n="arrow" />
        </Lien>
      )}
      <section className="tile sec">
        <div className="sech"><h2>Parcours d’inscription · 30 jours</h2></div>
        <div className="funnel" style={p.parcours.length !== 5 ? { gridTemplateColumns: `repeat(${p.parcours.length},minmax(0,1fr))` } : undefined}>
          {p.parcours.map((e) => (
            <div className="fn" key={e.libelle}><div className="fnb"><i style={{ height: `${e.hauteur}%` }} /></div><b>{e.n}</b><span>{e.libelle}</span>{e.part != null && <small>{e.part}</small>}</div>
          ))}
        </div>
      </section>
      <section className="tile sec">
        <ComptesListe filtres={p.filtres} comptes={p.comptes} colonnes={COLONNES_COMPTES} />
        <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.note}</p>
      </section>
      {p.declarations && <Declarations {...p.declarations} />}
    </Vue>
  );
}
