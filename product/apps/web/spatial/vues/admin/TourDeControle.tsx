import { Ic, Lien, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, sousNavVisible, type BandeauAdmin, type ClassePill, type KpiAdmin } from './base';
import { ICONE_RACCOURCI_ADMIN, SOUS_NAV_ADMIN } from './sous-nav';

/** Les colonnes de la table · portées par CHAQUE ligne, comme toutes les tables `.atable` de la maquette (la règle `.atable .atr{grid-template-columns:inherit}` hérite sinon d'un conteneur qui n'en a pas : une cellule par ligne). */
const COLONNES_FORFAITS = '1.3fr .8fr 1fr 1.4fr';

/**
 * « Tour de contrôle » · `docs/spatial/reference/admin.html`, balisage à
 * l'identique. PRÉSENTATIONNEL · la page (`app/(spatial)/sp/admin`) lit tout en
 * base et passe des valeurs déjà décidées par le noyau (`spatial/admin`).
 */
export interface PropsTourDeControle {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  churn: {
    titre: string; valeur: string; variation: { texte: string; classe: '' | 'up' | 'dn' | 'w' }; detail: string;
    barres: ReadonlyArray<{ hauteur: number; enCours: boolean }>;
    /** Ligne d'objectif (pourcents de la hauteur) · absente quand aucun objectif n'est fixé. */
    objectif: number | null;
    cotes: ReadonlyArray<{ libelle: string; valeur: string; detail: string }>;
  };
  mrr: { legende: string; mois: ReadonlyArray<{ libelle: string; hauteur: number; titre: string; enCours: boolean }> };
  alertes: ReadonlyArray<{ ton: 'w' | 'r' | 'c'; icone: string; titre: string; detail: string; lien: { href: string; libelle: string } }>;
  forfaits: ReadonlyArray<{ libelle: string; prix: string; abonnes: string; mrr: string; marge: number; margeTexte: string }>;
  direct: ReadonlyArray<{ initiales: string; espace: string; texte: string; quand: string; pastille: { libelle: string; classe: ClassePill } }>;
}

export function TourDeControle(p: PropsTourDeControle) {
  return (
    <Vue>
      <TeteAdmin titre="Tour de contrôle" sous="vue d’ensemble" actif="/admin" bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      <Lien className="tile chero sec" href="/admin/churn">
        <div className="chero-l">
          <span className="lbl" style={{ margin: 0 }}><Ic n="warn" />{p.churn.titre}</span>
          <div className="chero-v"><b>{p.churn.valeur}</b><span className={`akd ${p.churn.variation.classe}`}>{p.churn.variation.texte}</span></div>
          <small>{p.churn.detail}</small>
        </div>
        <div className="chero-m">
          {p.churn.barres.map((b, i) => <i key={i} className={b.enCours ? 'on' : ''} style={{ height: `${b.hauteur}%` }} />)}
          {p.churn.objectif != null && <span className="cgoal" style={{ bottom: `${p.churn.objectif}%` }} />}
        </div>
        <div className="chero-r">
          {p.churn.cotes.map((c) => <div key={c.libelle}><span className="faint">{c.libelle}</span><b>{c.valeur}</b><small>{c.detail}</small></div>)}
          <span className="btn sm pri">Ouvrir le suivi <Ic n="arrow" /></span>
        </div>
      </Lien>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>MRR · 12 derniers mois</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{p.mrr.legende}</span></div>
          <div className="abars">
            {p.mrr.mois.map((m, i) => <div key={i} className={`abar ${m.enCours ? 'on' : ''}`} title={m.titre}><i style={{ height: `${m.hauteur}%` }} /><span>{m.libelle}</span></div>)}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>À surveiller</h2><Pill c={p.alertes.length ? 'w' : 'g'}>{p.alertes.length ? `${p.alertes.length} alerte${p.alertes.length > 1 ? 's' : ''}` : 'Rien à signaler'}</Pill></div>
          <div className="alist">
            {p.alertes.map((a) => (
              <div className="ait" key={a.titre}><span className={`aic ${a.ton}`}><Ic n={a.icone} /></span><div><strong>{a.titre}</strong><p>{a.detail}</p></div><Lien className="btn sm" href={a.lien.href}>{a.lien.libelle}</Lien></div>
            ))}
            {p.alertes.length === 0 && <Vide>Aucun signal ne demande d’action · dépense, paiements, tickets et crédits sont dans les clous.</Vide>}
          </div>
        </section>
      </div>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Rentabilité par forfait</h2><Lien className="more" href="/admin/finance">Détail <Ic n="arrow" /></Lien></div>
          <div className="atable">
            <div className="atr ath" style={{ gridTemplateColumns: COLONNES_FORFAITS }}><span>Forfait</span><span>Abonnés</span><span>MRR</span><span>Marge</span></div>
            {p.forfaits.map((f) => (
              <div className="atr" style={{ gridTemplateColumns: COLONNES_FORFAITS }} key={f.libelle}><span><b>{f.libelle}</b> <small className="faint">{f.prix}</small></span><span>{f.abonnes}</span><span>{f.mrr}</span><span><Barre part={f.marge} />{f.margeTexte}</span></div>
            ))}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>En direct</h2><span className="pulse" /></div>
          <div className="afeed">
            {p.direct.map((d, i) => (
              <div className="afi" key={i}><span className="me" style={{ width: 30, height: 30, fontSize: '10.5px' }}>{d.initiales}</span><span style={{ flex: 1, minWidth: 0 }}><b>{d.espace}</b> {d.texte}<small>{d.quand}</small></span><Pill c={d.pastille.classe}>{d.pastille.libelle}</Pill></div>
            ))}
            {p.direct.length === 0 && <Vide>Aucun événement récent sur la plateforme.</Vide>}
          </div>
        </section>
      </div>
      <div className="ashort sec">
        {sousNavVisible(SOUS_NAV_ADMIN, p.bandeau).filter((s) => s.href !== '/admin').map((s) => (
          <Lien key={s.href} className="tile ash" href={s.href}><span className="aic"><Ic n={ICONE_RACCOURCI_ADMIN[s.href] ?? 'arrow'} /></span><strong>{s.libelle}</strong></Lien>
        ))}
      </div>
    </Vue>
  );
}
