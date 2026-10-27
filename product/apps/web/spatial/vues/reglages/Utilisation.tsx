import type { ReactNode } from 'react';
import { Anneau, EnTete, Ic, Lien, SousNav, Vue, formatNombre } from '../../communs';

/**
 * « Crédits & factures » · `docs/spatial/reference/utilisation.html`, balisage
 * à l'identique. PRÉSENTATIONNEL · toutes les valeurs arrivent en props, la page
 * (`app/(spatial)/sp/usage`) les lit en base. Rien n'est simulé : sans facture
 * réelle, la tuile le dit ; sans semaine consommée, les barres restent à zéro.
 */
export interface FactureSpatiale { periode: string; detail: string; montant: string; statut: { libelle: string; classe: '' | 'g' }; url: string | null }

export interface PropsUtilisation {
  sousNav: ReadonlyArray<{ href: string; libelle: ReactNode }>;
  plan: { nom: string; dotation: number; solde: number; illimite: boolean; part: number; detail?: string | null };
  peutChangerPlan: boolean;
  semaines: ReadonlyArray<{ hauteur: number; enCours: boolean }>;
  couts: ReadonlyArray<{ libelle: string; credits: number }>;
  factures: ReadonlyArray<FactureSpatiale>;
  /** Pas de facture listable ici · le message et, s'il existe, l'accès au portail de paiement. */
  sansFacture?: { message: string; portail: (() => Promise<void>) | null };
}

export function Utilisation(p: PropsUtilisation) {
  const credits = (n: number) => `${formatNombre(n)} crédit${n > 1 ? 's' : ''}`;
  return (
    <Vue>
      <EnTete titre="Crédits & factures" sous="Comprends les coûts avant de lancer une génération" />
      <SousNav items={p.sousNav} actif="/usage" />
      <div className="grid2">
        <section className="tile">
          <div className="bhead">
            <Anneau part={p.plan.part} taille={90} libelle={p.plan.illimite ? '∞' : formatNombre(p.plan.solde)} />
            <div>
              <h2>{p.plan.nom}</h2>
              <p className="muted" style={{ fontSize: '12.5px' }}>{formatNombre(p.plan.dotation)} crédits / mois{p.plan.detail ? ` · ${p.plan.detail}` : ''}</p>
              {p.peutChangerPlan && <Lien className="btn sm" href="/billing" style={{ marginTop: 10 }}>Changer de plan</Lien>}
            </div>
          </div>
          <div className="bars" aria-label="Crédits utilisés par semaine">
            {p.semaines.map((s, i) => <i key={i} className={s.enCours ? 'on' : ''} style={{ height: `${s.hauteur}%` }} />)}
          </div>
        </section>
        <section className="tile">
          <h2>Coût par opération</h2>
          <div className="tl">
            {p.couts.map((c) => (
              <div className="ev" key={c.libelle}><span className="ico"><Ic n="spark" /></span><span>{c.libelle}</span><strong className="num">{credits(c.credits)}</strong></div>
            ))}
          </div>
        </section>
        <section className="tile" style={{ gridColumn: '1/-1' }}>
          <h2>Factures</h2>
          <div className="mtable" style={{ marginTop: 10 }}>
            {p.factures.map((f) => (
              <div className="mrow" key={f.periode} style={{ gridTemplateColumns: '1fr 1.4fr 90px 100px auto' }}>
                <strong>{f.periode}</strong><span className="faint">{f.detail}</span><span className="num">{f.montant}</span>
                <span className={`pill ${f.statut.classe}`}>{f.statut.libelle}</span>
                {f.url ? <a className="btn sm" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Télécharger la facture ${f.periode}`}><Ic n="down" /></a> : <span />}
              </div>
            ))}
            {p.factures.length === 0 && p.sansFacture && (
              <div className="mrow" style={{ gridTemplateColumns: '1fr auto' }}>
                <span className="faint">{p.sansFacture.message}</span>
                {p.sansFacture.portail ? <form action={p.sansFacture.portail}><button className="btn sm" type="submit">Ouvrir mes factures</button></form> : <span />}
              </div>
            )}
          </div>
        </section>
      </div>
    </Vue>
  );
}
