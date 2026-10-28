import { LARGEUR_MIN_TABLE_TELEPHONE, styleTableDefilante, type EcranCreditsMarges } from '@tiktrends/core';
import { Lien, Vue } from '../../communs';
import { Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin } from './base';

/**
 * « Crédits & marges » · vague 4 · l'écran V5 `/credits` (personnel de la
 * plateforme) n'a pas de fragment de maquette · composé avec les classes du
 * Tour de contrôle (`.akpis`, `.atable`/`.atr`, `.pill`, `.banner`), comme
 * « Coûts IA & marges ». PRÉSENTATIONNEL · le solde, l'allocation et
 * l'historique sont ceux de l'espace (`workspaces`, `credit_ledger`), le reste
 * le modèle économique du code (`ecranCreditsMarges`, noyau).
 */

export interface PropsCreditsMarges {
  bandeau: BandeauAdmin;
  essai: { texte: string; conseil: string; alerte: boolean } | null;
  compte: { solde: string; illimite: boolean; forfait: string; allocation: string; conso: string; note: string | null };
  regle: { markup: number; credit: string; taux: number; frais: number };
  ecran: EcranCreditsMarges;
  bareme: ReadonlyArray<{ cle: string; libelle: string; credits: number }>;
  historique: ReadonlyArray<{ id: string; motif: string; quand: string; delta: string; credit: boolean }>;
  vide: { titre: string; pourquoi: string; action: { href: string; libelle: string } };
}

/**
 * Les colonnes · portées par chaque ligne. Au téléphone, les quatre tables
 * défilent dans leur cadre à une largeur minimale MESURÉE
 * (`LARGEUR_MIN_TABLE_TELEPHONE`, noyau) · aucune valeur n'est rognée.
 */
const COL_OP = '1.5fr 1.3fr .8fr .6fr .8fr .6fr .6fr';
const COL_NET = '1fr .7fr .9fr .9fr 1fr .8fr 1fr';
const COL_RISQUE = '1fr .6fr .8fr .8fr 1.5fr .8fr';

export function CreditsMarges(p: PropsCreditsMarges) {
  const e = p.ecran;
  const fragiles = e.risques.filter((r) => !r.sain).length;
  return (
    <Vue>
      <TeteAdmin titre="Crédits & marges" sous="crédits" actif="/credits" bandeau={p.bandeau} />
      {p.essai && (
        <div className="banner" data-geste="essai" role={p.essai.alerte ? 'alert' : undefined}><b>{p.essai.texte}</b><span className="muted">{p.essai.conseil}</span></div>
      )}
      <div data-geste="compte">
        <Kpis items={[
          { lbl: 'Solde actuel', v: p.compte.solde, d: p.compte.illimite ? 'Illimité' : undefined },
          { lbl: `Allocation · ${p.compte.forfait}`, v: p.compte.allocation, d: 'par mois' },
          { lbl: 'Consommé ce cycle', v: p.compte.conso, d: p.compte.note ?? undefined },
        ]} />
      </div>
      <p className="faint" style={{ fontSize: 12.5, margin: '0 0 16px' }}>Pour appliquer une formule ou ajuster le solde de cet espace · <Lien href="/admin/plans">Forfaits</Lien>. Cet écran reste dédié aux coûts réels et aux marges.</p>

      <section className="tile sec" data-geste="operations">
        <div className="sech"><h2>Économie & marges · règle maison</h2><Pill c="c">Coût réel × {p.regle.markup}</Pill></div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>On facture le coût API réel × {p.regle.markup} (marge cible, réglée par CREDIT_MARKUP sur le serveur). Un crédit vaut {p.regle.credit} de revente · crédits = plafond(coût réel × {p.regle.markup} ÷ valeur d’un crédit). Les coûts réels sont des estimations, à rapprocher des factures.</p>
        <div className="atable" data-table="operations" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.operationsCredits)}>
          <div className="atr ath" style={{ gridTemplateColumns: COL_OP }}><span>Action</span><span>Fournisseur</span><span>Coût réel</span><span>Crédits</span><span>Revente</span><span>Marge</span><span>Reco</span></div>
          {e.operations.map((o) => (
            <div className="atr" key={o.action} data-action={o.action} style={{ gridTemplateColumns: COL_OP }}>
              <span><b>{o.libelle}</b><small className="faint" style={{ display: 'block' }}>par {o.unite}</small></span>
              <span className="faint" style={{ whiteSpace: 'normal' }}>{o.fournisseur}</span>
              <span>{o.cout}</span><span><b>{o.credits}</b></span><span>{o.revente}</span>
              <span><Pill c={o.margeAtteinte ? 'g' : 'w'}>{o.marge}</Pill></span>
              <span data-reco>{o.reco == null ? <span className="faint">Aligné</span> : <b>{o.reco}</b>}</span>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Marge = revente ÷ coût réel. Sous la cible, « Reco » donne les crédits à facturer pour revenir à ×{p.regle.markup}.</p>
      </section>

      <section className="tile sec" data-geste="nets">
        <div className="sech"><h2>Ce qu’on gagne vraiment · marge nette</h2><Pill c="g">SAS · IS {p.regle.taux} %</Pill></div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Bénéfice net par abonnement, une fois déduits le coût API (cas max, toute l’allocation consommée au markup ×{p.regle.markup}), les frais de paiement (~{p.regle.frais} % + 0,30 €) et l’impôt sur les sociétés ({p.regle.taux} %). La TVA est collectée puis reversée · neutre.</p>
        {e.nets.length === 0 ? <Vide>Aucune formule payante.</Vide> : (
          <>
            <Kpis items={e.nets.map((n) => ({ lbl: `${n.forfait} · ${n.prix} € / mois HT`, v: `+${n.net} €`, d: `net / mois · ${n.netPct} % du prix · ${n.netAn} € / an`, c: n.net >= 0 ? 'up' : 'dn' }))} />
            <div className="atable" data-table="nets" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.netsCredits)}>
              <div className="atr ath" style={{ gridTemplateColumns: COL_NET }}><span>Formule</span><span>Prix HT</span><span>− Coût API</span><span>− Frais</span><span>= Marge brute</span><span>− IS</span><span>= Marge nette</span></div>
              {e.nets.map((n) => (
                <div className="atr" key={n.forfait} style={{ gridTemplateColumns: COL_NET }}>
                  <span><b>{n.forfait}</b></span><span>{n.prix} €</span><span>{n.coutApi}</span><span>{n.frais}</span><span>{n.brut} <small className="faint">({n.brutPct} %)</small></span><span>{n.impot}</span><span><b>{n.net} €</b> <small className="faint">({n.netPct} %)</small></span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Réglable sur le serveur · CREDIT_MARKUP (marge), CORPORATE_TAX_RATE (IS · 0,15 réduit sous 42 500 € de bénéfice, 0,25 normal).</p>
      </section>

      <section className="tile sec" data-geste="risques">
        <div className="sech"><h2>Rentabilité & optimisation</h2><Pill c={fragiles ? 'w' : 'g'}>{fragiles ? `${fragiles} formule${fragiles > 1 ? 's' : ''} à surveiller` : 'Marges saines'}</Pill></div>
        <p className="muted" style={{ fontSize: 12.5, margin: '0 0 10px' }}>Le vrai risque est le pire cas · un client qui dépense toute son allocation sur l’action la moins rentable. On vise au moins 70 % de marge brute même dans ce scénario.</p>
        <div className="atable" data-table="risques" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.risquesCredits)}>
          <div className="atr ath" style={{ gridTemplateColumns: COL_RISQUE }}><span>Formule</span><span>Prix</span><span>Marge pleine</span><span>Marge plancher</span><span>Action à risque</span><span>Prix conseillé</span></div>
          {e.risques.map((r) => (
            <div className="atr" key={r.forfait} data-forfait={r.forfait} style={{ gridTemplateColumns: COL_RISQUE }}>
              <span><b>{r.forfait}</b></span><span>{r.prix} €</span><span>{r.pleine} %</span>
              <span><Pill c={r.classe}>{r.plancher} %</Pill></span>
              <span style={{ whiteSpace: 'normal' }}>{r.action}<small className="faint" style={{ display: 'block' }}>coût max {r.coutMax}</small></span>
              <span>{r.prixConseille == null ? <span className="faint">OK</span> : <b>{r.prixConseille} €</b>}</span>
            </div>
          ))}
          {e.risques.length === 0 && <Vide>Aucune formule payante.</Vide>}
        </div>
        {e.corrections.length > 0 && (
          <div data-geste="corrections" style={{ marginTop: 14 }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Corrections de barème conseillées · {e.corrections.length}</h3>
            <div className="atable" data-table="corrections" style={styleTableDefilante(LARGEUR_MIN_TABLE_TELEPHONE.correctionsCredits)}>
              {e.corrections.map((c) => (
                <div className="atr" key={c.action} style={{ gridTemplateColumns: '1.6fr .6fr .6fr .9fr' }}>
                  <span>{c.libelle} <small className="faint">· marge {c.marge}</small></span><span className="faint">{c.actuel} crédits</span><span><b>{c.reco}</b></span>
                  <span><Pill c={c.hausse ? 'w' : 'g'}>{c.hausse ? 'à augmenter' : 'baisse possible'}</Pill></span>
                </div>
              ))}
            </div>
            <p className="faint" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Pour appliquer · ajuster CREDIT_COSTS dans packages/core vers les valeurs conseillées, ou relever le prix des formules à risque. Le multiplicateur global se règle par CREDIT_MARKUP.</p>
          </div>
        )}
        <p className="muted" data-geste="lecture" style={{ fontSize: 12.5, margin: '12px 0 0' }}><b>Lecture · </b>{e.lecture}</p>
      </section>

      <div className="agrid2 sec">
        <section className="tile" data-geste="bareme">
          <div className="sech"><h2>Barème · coût par action</h2></div>
          <div className="atable">
            {p.bareme.map((b) => <div className="atr" key={b.cle} style={{ gridTemplateColumns: '1fr auto' }}><span>{b.libelle}</span><span><b>{b.credits}</b></span></div>)}
          </div>
        </section>
        <section className="tile" data-geste="historique">
          <div className="sech"><h2>Historique de l’espace</h2></div>
          {p.historique.length === 0 ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <b>{p.vide.titre}</b><span className="muted" style={{ fontSize: 12.5 }}>{p.vide.pourquoi}</span>
              <div><Lien className="btn sm" href={p.vide.action.href}>{p.vide.action.libelle}</Lien></div>
            </div>
          ) : (
            <div className="atable">
              {p.historique.map((l) => (
                <div className="atr" key={l.id} style={{ gridTemplateColumns: '1fr auto' }}>
                  <span><b style={{ fontWeight: 500 }}>{l.motif}</b><small className="faint" style={{ display: 'block' }}>{l.quand}</small></span>
                  <span><Pill c={l.credit ? 'g' : 'r'}>{l.delta}</Pill></span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Vue>
  );
}
