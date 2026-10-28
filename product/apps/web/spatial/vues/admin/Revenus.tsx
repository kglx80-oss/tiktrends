import { Fragment } from 'react';
import { LARGEUR_MIN_TABLE_TELEPHONE, styleTableDefilante } from '@tiktrends/core';
import { Ic, Vue } from '../../communs';
import { Barre, Kpi, Kpis, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { RevenusHero } from './client';

/** Les colonnes de la table · portées par CHAQUE ligne, comme toutes les tables `.atable` de la maquette (la règle `.atable .atr{grid-template-columns:inherit}` hérite sinon d'un conteneur qui n'en a pas : une cellule par ligne). */
const COLONNES_RENTABILITE = '1.3fr .8fr 1fr 1.2fr 1fr 1.4fr .8fr 1fr';

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

const COLONNES_FORMULES = '1.1fr .9fr .7fr 1fr 1.4fr 1fr 1fr';

/**
 * « Finance · MRR & marges » · les indicateurs de l'ancienne page
 * `/admin/finance`, portés tels quels (noyau `financeParFormule`) · bénéfice
 * net après impôt, net par formule, santé et recommandations de marge. Leur
 * base de calcul diffère du MRR en tête d'écran · l'écran le dit, sans trancher.
 */
export interface PropsFinanceFormules {
  intro: string;
  base: string;
  kpis: readonly KpiAdmin[];
  lignes: ReadonlyArray<{ plan: string; libelle: string; prix: string; clients: string; mrr: string; netAbonne: string; netPct: string; netPositif: boolean; netMois: string; saine: boolean }>;
  cible: string;
  recos: ReadonlyArray<{ plan: string; libelle: string; prix: string; surAlloue: boolean; lignes: ReadonlyArray<{ k: string; v: string; accent: boolean }>; conseil: string | null }>;
  reglages: string;
}

function FinanceFormules(p: PropsFinanceFormules) {
  return (
    <>
      <section className="tile sec" data-section="finance-formules">
        <div className="sech"><h2>Finance · MRR &amp; marges</h2></div>
        <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 6px' }}>{p.intro}</p>
        <div className="rvnote" style={{ margin: '0 0 14px' }}><Ic n="bulb" /><span>{p.base}</span></div>
        <Kpis items={p.kpis} />
        <div className="sech" style={{ marginTop: 18 }}><h2>Par formule</h2></div>
        <div className="atable" data-table="finance-formules" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.defauts)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_FORMULES }}><span>Formule</span><span>Prix HT</span><span>Clients</span><span>MRR</span><span>Marge nette/ab.</span><span>Net/mois</span><span>Santé</span></div>
          {p.lignes.map((l) => (
            <div className="atr" style={{ gridTemplateColumns: COLONNES_FORMULES }} key={l.plan} data-formule={l.plan}>
              <span><b>{l.libelle}</b></span><span>{l.prix}</span><span>{l.clients}</span><span><b>{l.mrr}</b></span>
              <span style={{ color: l.netPositif ? 'var(--good)' : 'var(--bad)' }}>{l.netAbonne} <small className="faint">({l.netPct})</small></span>
              <span>{l.netMois}</span>
              <span>{l.saine ? <span className="pill g">saine</span> : <span className="pill w">à surveiller</span>}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="sec" data-section="finance-reco">
        <div className="sech"><h2>Optimisation des marges · reco</h2></div>
        <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 12px' }}>Cible : <b>{p.cible} de marge brute</b> même si le client consomme 100 % de ses crédits. Deux leviers : réduire l’allocation, ou monter le prix.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))', gap: 16 }}>
          {p.recos.map((r) => (
            <div className="tile" key={r.plan} data-reco={r.plan}>
              <div className="sech" style={{ margin: 0 }}>
                <h2 style={{ fontSize: 15 }}>{r.libelle}</h2><span className="faint" style={{ fontSize: '12px' }}>{r.prix}/mois</span>
                {r.surAlloue && <span className="pill c" style={{ marginLeft: 'auto' }}>Sur-alloué</span>}
              </div>
              <dl className="kv2">
                {r.lignes.map((x) => <Fragment key={x.k}><dt>{x.k}</dt><dd><b style={x.accent ? { color: 'var(--acc)' } : undefined}>{x.v}</b></dd></Fragment>)}
              </dl>
              {r.conseil && <p style={{ margin: '10px 0 0', fontSize: '12px', color: 'var(--acc)' }}>{r.conseil}</p>}
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: '11.5px', margin: '14px 0 0' }}>{p.reglages}</p>
      </section>
    </>
  );
}

export interface PropsRevenus {
  bandeau: BandeauAdmin;
  hero: { titre: string; valeur: string; variation: string | null; detail: string; serie: ReadonlyArray<{ libelle: string; valeur: number | null; enCours: boolean }> };
  cotes: readonly KpiAdmin[];
  repartition: { legende: string; formules: ReadonlyArray<{ libelle: string; mrr: number; mrrTexte: string; part: string }>; note: string | null };
  rentabilite: ReadonlyArray<{ libelle: string; prix: string; abonnes: string; mrr: string; coutIa: string; frais: string; marge: number; margeTexte: string; churn: string; ltv: string }>;
  /** Hors maquette · les indicateurs de l'ancienne page Finance · absent, rien ne s'affiche. */
  financeFormules?: PropsFinanceFormules;
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
        <div className="atable" data-table="rentabilite" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.rentabiliteRevenus)}>
          <div className="atr ath" style={{ gridTemplateColumns: COLONNES_RENTABILITE }}><span>Forfait</span><span>Abonnés</span><span>MRR</span><span>Coût IA / abonné</span><span>Frais paiement</span><span>Marge</span><span>Churn</span><span>LTV</span></div>
          {p.rentabilite.map((r) => (
            <div className="atr" style={{ gridTemplateColumns: COLONNES_RENTABILITE }} key={r.libelle}><span><b>{r.libelle}</b> <small className="faint">{r.prix}</small></span><span>{r.abonnes}</span><span>{r.mrr}</span><span>{r.coutIa}</span><span>{r.frais}</span><span><Barre part={r.marge} />{r.margeTexte}</span><span>{r.churn}</span><span>{r.ltv}</span></div>
          ))}
        </div>
      </section>
      <section className="tile sec">
        <div className="sech"><h2>Rétention par cohorte</h2><span className="faint" style={{ fontSize: '12.5px' }}>% de comptes encore abonnés, par mois d’inscription</span></div>
        <div className="coh" data-vide="cohortes"><Vide>L’état d’abonnement de chaque compte n’est pas relevé mois après mois · la rétention par cohorte ne se calcule pas encore. Rien n’est estimé.</Vide></div>
      </section>
      {p.financeFormules && <FinanceFormules {...p.financeFormules} />}
    </Vue>
  );
}
