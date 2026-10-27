import { Ic, Lien, Vue } from '../../communs';
import { Kpis, TeteAdmin, type BandeauAdmin, type KpiAdmin } from './base';
import { ComptesListe, type LigneCompte } from './client';

/**
 * « Inscriptions & comptes » · `docs/spatial/reference/a-comptes.html`. PRÉSENTATIONNEL.
 *
 * Réel · inscriptions, essais, conversion, comptes à risque, parcours
 * d'inscription (inscrits → onboarding → 1re consommation → payants), la liste
 * des espaces. Sans source · les visiteurs du site (aucune mesure d'audience),
 * la source d'acquisition (le profil déclaré à l'onboarding la remplace),
 * « se connecter en tant que » et les crédits offerts à un autre espace.
 */
export const COLONNES_COMPTES = '1.4fr .9fr .8fr 1.1fr .9fr .9fr .8fr auto';

export interface PropsComptes {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  alerte: { comptes: string; mrr: string } | null;
  parcours: ReadonlyArray<{ libelle: string; n: string; hauteur: number; part: string | null }>;
  filtres: ReadonlyArray<{ cle: string; libelle: string }>;
  comptes: readonly LigneCompte[];
  note: string;
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
    </Vue>
  );
}
