import { Anneau, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { identiteFournisseur } from './fournisseurs';

/**
 * « Coûts IA & marges » · `docs/spatial/reference/a-couts.html`. PRÉSENTATIONNEL.
 *
 * Réel · la dépense fournisseur sur 30 jours glissants (`ai_spend`, en dollars,
 * la même que la barrière de dépense), le plafond `AI_SPEND_CAP_USD`, les
 * marges par opération du modèle économique du code (coûts ESTIMÉS, en euros).
 * Le plafond se règle sur le serveur · aucun bouton ne prétend le modifier.
 * Les lignes « à réconcilier » sont listées · leur geste reste l'écran V5.
 */
const COL_F = 'auto 1.6fr 1fr 1.4fr';
const COL_O = '1.6fr .8fr 1fr 1fr 1.4fr';

export interface PropsCouts {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  fournisseurs: ReadonlyArray<{ cle: string; montant: string; appels: string; largeur: number; part: string }>;
  budget: { part: number; titre: string; detail: string; detailHref: string | null };
  legendeOperations: string;
  operations: ReadonlyArray<{ libelle: string; credits: string; revenu: string; cout: string; marge: number; margeTexte: string; aRevoir: boolean }>;
  note: string;
  aReconcilier: { resume: string; lignes: ReadonlyArray<{ id: string; quand: string; poste: string; montant: string; cause: string }> } | null;
}

export function Couts(p: PropsCouts) {
  return (
    <Vue>
      <TeteAdmin titre="Coûts IA & marges" sous="coûts" actif="/admin/depenses" bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Coûts par fournisseur · 30 j</h2></div>
          <div className="atable">
            {p.fournisseurs.map((f) => {
              const id = identiteFournisseur(f.cle);
              return (
                <div className="atr" key={f.cle} style={{ gridTemplateColumns: COL_F }}>
                  <span><span className="alogo" style={{ width: 30, height: 30, background: id.fond, color: '#fff', font: '700 11px/1 var(--sfd)' }}>{id.lettre}</span></span>
                  <span><b>{id.nom}</b><small className="faint" style={{ display: 'block' }}>{id.societe} · {f.appels}</small></span>
                  <span><b>{f.montant}</b></span>
                  <span><Barre part={f.largeur} />{f.part}</span>
                </div>
              );
            })}
            {p.fournisseurs.length === 0 && <Vide>Aucun appel payant sur les 30 derniers jours.</Vide>}
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Plafond de dépense · 30 j glissants</h2></div>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <Anneau part={p.budget.part} taille={96} libelle={`${Math.round(p.budget.part)} %`} />
            <div style={{ flex: 1, minWidth: 200, display: 'grid', gap: 6 }}>
              <b style={{ font: '600 20px var(--sfd)' }}>{p.budget.titre}</b>
              <span className="muted" style={{ fontSize: '12.5px' }}>{p.budget.detail}</span>
              {/* Lien PLEIN (rechargement) · il bascule vers l'ancienne interface, qui ne partage jamais une page avec Spatial. */}
              <div className="kc">{p.budget.detailHref && <a className="btn sm" href={p.budget.detailHref}>Détail des appels</a>}</div>
            </div>
          </div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Marge par opération</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.legendeOperations}</span></div>
        <div className="atable">
          <div className="atr ath" style={{ gridTemplateColumns: COL_O }}><span>Opération</span><span>Crédits</span><span>Revenu</span><span>Coût IA estimé</span><span>Marge</span></div>
          {p.operations.map((o) => (
            <div className="atr" key={o.libelle} style={{ gridTemplateColumns: COL_O }}>
              <span><b>{o.libelle}</b></span><span>{o.credits}</span><span>{o.revenu}</span><span>{o.cout}</span>
              <span><Barre part={o.marge} over={o.aRevoir} />{o.margeTexte}{o.aRevoir && <> <Pill c="r">À revoir</Pill></>}</span>
            </div>
          ))}
        </div>
        <p className="faint" style={{ fontSize: '11.5px', margin: '10px 0 0' }}>{p.note}</p>
      </section>
      {p.aReconcilier && (
        <section className="tile sec">
          <div className="sech"><h2>À réconcilier avec la facture</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.aReconcilier.resume}</span></div>
          <div className="atable">
            {p.aReconcilier.lignes.map((l) => (
              <div className="atr" key={l.id} style={{ gridTemplateColumns: '1fr 1.4fr 1fr 1.6fr' }}><span className="faint">{l.quand}</span><span><b>{l.poste}</b></span><span>{l.montant}</span><span className="faint">{l.cause}</span></div>
            ))}
          </div>
          {p.budget.detailHref && <a className="btn sm" href={p.budget.detailHref} style={{ marginTop: 12 }}>Réconcilier dans l’ancienne interface</a>}
        </section>
      )}
    </Vue>
  );
}
