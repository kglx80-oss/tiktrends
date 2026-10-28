import { changePlanAction } from '../../../app/actions/billing';
import { grantCreditsAction, rechargeAllocationAction } from '../../../app/actions/credits';
import { Kpis, Pill } from './base';

/**
 * Les leviers internes de formule (ancien `/admin/plans`) · appliquer une
 * formule, ajuster les crédits, recharger l'allocation, sur l'espace du
 * fondateur connecté et SANS Stripe. Les actions sont celles qui existaient
 * (`changePlanAction`, `grantCreditsAction`, `rechargeAllocationAction`) ·
 * chacune repose la garde fondateur et redirige ici avec son message
 * (`back=admin` → `/admin/plans?ok=…`). Aucune offre, aucun prix, aucun droit
 * nouveau · le sélecteur ne propose que les formules du code.
 */
export interface LeviersFormule {
  espace: string;
  formule: string;
  prixFormule: string;
  solde: string;
  allocation: string;
  abonnement: { libelle: string; detail: string };
  formules: ReadonlyArray<{ cle: string; libelle: string }>;
  formuleActuelle: string;
  message: { ok: boolean; texte: string } | null;
}

export function SectionLeviers({ l }: { l: LeviersFormule }) {
  return (
    <section className="tile sec" id="leviers" data-leviers="formule">
      <div className="sech"><h2>Pilotage de ton espace</h2><Pill c="w">Sans Stripe</Pill><span className="faint" style={{ fontSize: '12.5px' }}>{l.espace} · tests, démonstrations, gestes commerciaux</span></div>
      {l.message && <p role={l.message.ok ? 'status' : 'alert'} className={`pill ${l.message.ok ? 'g' : 'r'}`} style={{ margin: '0 0 12px', whiteSpace: 'normal' }}>{l.message.texte}</p>}
      <Kpis items={[
        { lbl: 'Formule', v: l.formule, s: l.prixFormule },
        { lbl: 'Solde crédits', v: l.solde, s: l.allocation },
        { lbl: 'Abonnement Stripe', v: l.abonnement.libelle, s: l.abonnement.detail },
      ]} />
      <div className="agrid2" style={{ marginTop: 14 }}>
        <form action={changePlanAction} style={{ display: 'grid', gap: 10, alignContent: 'start' }} data-levier="formule">
          <input type="hidden" name="back" value="admin" />
          <label className="field">Appliquer une formule
            <select name="plan" defaultValue={l.formuleActuelle}>{l.formules.map((f) => <option key={f.cle} value={f.cle}>{f.libelle}</option>)}</select>
          </label>
          <small className="faint">Recale l’allocation mensuelle · les recharges déjà payées sont conservées.</small>
          <div className="kc"><button className="btn sm pri" type="submit">Appliquer</button></div>
        </form>
        <div style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <form action={grantCreditsAction} style={{ display: 'grid', gap: 10 }} data-levier="credits">
            <input type="hidden" name="back" value="admin" />
            <div className="agrid2" style={{ gap: 10 }}>
              <label className="field">Ajustement (+/−)<input name="amount" type="number" inputMode="numeric" placeholder="ex : 500" /></label>
              <label className="field">Motif<input name="reason" placeholder="Geste commercial, correction…" /></label>
            </div>
            <small className="faint">Chaque mouvement est tracé au grand livre et apparaît dans l’historique du client.</small>
            <div className="kc"><button className="btn sm pri" type="submit">Ajuster les crédits</button></div>
          </form>
          <form action={rechargeAllocationAction} data-levier="recharge">
            <input type="hidden" name="back" value="admin" />
            <button className="btn sm" type="submit">Recharger l’allocation du mois</button>
          </form>
        </div>
      </div>
    </section>
  );
}
