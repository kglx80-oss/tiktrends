import type { ReactNode } from 'react';
import type { JournalCredits } from '@tiktrends/core';
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
  /**
   * Le journal des mouvements (geste de l'écran V5 `/usage`, sans fragment de
   * maquette · vague 2) · répartition et mouvements. Absent, l'écran reste
   * celui de la maquette (garde de parité).
   */
  journal?: JournalCredits & { ajoute: number; consomme: number };
}

/** Le journal · `.tl .ev` pour la répartition (comme « Coût par opération »), `.mtable` pour les mouvements (comme « Factures »). */
function TuilesJournal({ j }: { j: NonNullable<PropsUtilisation['journal']> }) {
  return (
    <>
      <section className="tile" data-geste="repartition">
        <div className="sech" style={{ margin: '0 0 8px' }}><h2>Où partent tes crédits</h2><span className="faint" style={{ fontSize: '12.5px' }}>{j.fenetre}</span></div>
        <p className="faint" style={{ fontSize: '12.5px', margin: '0 0 10px' }}>{formatNombre(j.consomme)} débités (avant remboursements) · {formatNombre(j.ajoute)} ajoutés (allocation, recharges, remboursements)</p>
        {j.familles.length === 0
          ? <p className="faint" style={{ fontSize: 13, margin: 0 }}>Aucune consommation sur la période.</p>
          : (
            <div className="tl">
              {j.familles.map((f) => (
                <div className="ev" key={f.libelle}>
                  <span className="ico"><Ic n="chart" /></span>
                  <span style={{ flex: 1, display: 'grid', gap: 4 }}>{f.libelle}<i aria-hidden style={{ display: 'block', height: 6, borderRadius: 6, width: `${Math.max(f.part, 3)}%`, background: 'linear-gradient(90deg,var(--acc),var(--acc2))' }} /></span>
                  <strong className="num">{formatNombre(f.total)}</strong>
                </div>
              ))}
            </div>
          )}
      </section>
      <section className="tile" data-geste="journal" style={{ gridColumn: '1/-1' }}>
        <div className="sech" style={{ margin: '0 0 8px' }}><h2>Journal détaillé</h2><span className="faint" style={{ fontSize: '12.5px' }}>{j.limiteAtteinte ? `${j.lignes.length} mouvements les plus récents` : `${j.lignes.length} mouvement${j.lignes.length > 1 ? 's' : ''}`}</span></div>
        {j.lignes.length === 0
          ? <div className="mtable"><div className="mrow" style={{ gridTemplateColumns: '1fr auto' }}><span className="faint">Aucun mouvement pour l’instant · chaque génération consomme des crédits, ce relevé se remplit dès la première.</span><Lien className="btn sm" href="/studio/projets">Ouvrir les Studios</Lien></div></div>
          : (
            <div className="mtable">
              {j.lignes.map((l) => (
                <div className="mrow" key={l.id} style={{ gridTemplateColumns: '1.6fr 1fr 130px auto' }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{l.libelle}</strong><span className="faint">{l.famille}</span><span className="faint">{l.quand}</span>
                  <span className={`pill${l.positif ? ' g' : ''}`}>{l.delta}</span>
                </div>
              ))}
            </div>
          )}
      </section>
    </>
  );
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
        {p.journal && <TuilesJournal j={p.journal} />}
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
