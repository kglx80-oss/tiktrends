import { Ic, Vue } from '../../communs';
import { Barre, Kpi, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { RevenusHero } from './client';

/**
 * « Revenus & MRR » · `docs/spatial/reference/a-revenus.html`. PRÉSENTATIONNEL.
 *
 * Réel · le MRR des abonnements Stripe actifs, l'ARPU, la répartition par
 * formule, la rentabilité par formule (modèle économique du code, pire cas).
 * Sans source · l'historique du MRR (aucun relevé mensuel n'est enregistré),
 * ses mouvements (nouveaux, expansion, contraction, churn), la rétention par
 * cohorte, le NRR et le CAC · l'écran le dit.
 */

/** Les couleurs de la répartition · celles de la maquette, dans l'ordre des formules payantes. */
const TEINTES = ['#8fd8ff', 'var(--acc)', '#f6c98b', '#c4b5fd'] as const;

export interface PropsRevenus {
  bandeau: BandeauAdmin;
  hero: { titre: string; valeur: string; variation: string | null; detail: string; serie: ReadonlyArray<{ libelle: string; valeur: number | null; enCours: boolean }> };
  cotes: readonly KpiAdmin[];
  repartition: { legende: string; formules: ReadonlyArray<{ libelle: string; mrr: number; mrrTexte: string; part: string }>; note: string | null };
  rentabilite: ReadonlyArray<{ libelle: string; prix: string; abonnes: string; mrr: string; coutIa: string; frais: string; marge: number; margeTexte: string; churn: string; ltv: string }>;
}

export function Revenus(p: PropsRevenus) {
  return (
    <Vue>
      <TeteAdmin titre="Revenus & MRR" sous="revenus" actif="/admin/finance" bandeau={p.bandeau} />
      <div className="rvtop">
        <RevenusHero {...p.hero} />
        <div className="rvside">{p.cotes.map((k) => <Kpi key={k.lbl} {...k} />)}</div>
      </div>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Mouvements du MRR</h2><div className="rvleg" style={{ marginLeft: 'auto' }}><span><i style={{ background: 'var(--good)' }} />Gains</span><span><i style={{ background: 'var(--bad)' }} />Pertes</span></div></div>
          <div className="wfall" data-vide="mouvements"><Vide>Nouveaux, expansion, contraction, churn · ces mouvements demandent le MRR du mois précédent, qui n’est pas enregistré. Rien n’est reconstitué.</Vide></div>
        </section>
        <section className="tile">
          <div className="sech"><h2>D’où vient le MRR</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{p.repartition.legende}</span></div>
          <div className="rvsplit">{p.repartition.formules.map((f, i) => <i key={f.libelle} style={{ flex: Math.max(0, f.mrr), background: TEINTES[i % TEINTES.length] }} title={f.libelle} />)}</div>
          <div className="rvrows">{p.repartition.formules.map((f, i) => <div key={f.libelle}><span><i style={{ background: TEINTES[i % TEINTES.length] }} />{f.libelle}</span><b>{f.mrrTexte}</b><small>{f.part}</small></div>)}</div>
          {p.repartition.note && <div className="rvnote"><Ic n="bulb" /><span>{p.repartition.note}</span></div>}
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Rentabilité par abonnement</h2><span className="faint" style={{ fontSize: '12.5px' }}>Marge = prix − coût IA si toute l’allocation est consommée − frais de paiement</span></div>
        <div className="atable">
          <div className="atr ath"><span>Forfait</span><span>Abonnés</span><span>MRR</span><span>Coût IA / abonné</span><span>Frais paiement</span><span>Marge</span><span>Churn</span><span>LTV</span></div>
          {p.rentabilite.map((r) => (
            <div className="atr" key={r.libelle}><span><b>{r.libelle}</b> <small className="faint">{r.prix}</small></span><span>{r.abonnes}</span><span>{r.mrr}</span><span>{r.coutIa}</span><span>{r.frais}</span><span><Barre part={r.marge} />{r.margeTexte}</span><span>{r.churn}</span><span>{r.ltv}</span></div>
          ))}
        </div>
      </section>
      <section className="tile sec">
        <div className="sech"><h2>Rétention par cohorte</h2><span className="faint" style={{ fontSize: '12.5px' }}>% de comptes encore abonnés, par mois d’inscription</span></div>
        <div className="coh" data-vide="cohortes"><Vide>L’état d’abonnement de chaque compte n’est pas relevé mois après mois · la rétention par cohorte ne se calcule pas encore. Rien n’est estimé.</Vide></div>
      </section>
    </Vue>
  );
}
