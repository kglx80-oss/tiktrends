import { Anneau, Vue } from '../../communs';
import { Barre, Kpis, Pill, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { identiteFournisseur } from './fournisseurs';
import { ReconcilierLigne } from './depenses-client';

/**
 * « Coûts IA & marges » · `docs/spatial/reference/a-couts.html`. PRÉSENTATIONNEL.
 *
 * Réel · la dépense fournisseur sur 30 jours glissants (`ai_spend`, en dollars,
 * la même que la barrière de dépense), le plafond `AI_SPEND_CAP_USD`, les
 * marges par opération du modèle économique du code (coûts ESTIMÉS, en euros).
 * Le plafond se règle sur le serveur · aucun bouton ne prétend le modifier.
 * Vague 3 · les gestes de l'ancien écran vivent ici : chaque ligne « à
 * réconcilier » porte son geste (`reconcilierDepenseAction`, même porte), suivie
 * de l'historique des réconciliations, de la dépense par poste et du détail des
 * derniers appels (`ai_spend`). Sections absentes quand la page ne les passe pas.
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
  /** Lignes à rapprocher de la facture · `erreur` · lecture impossible (dit, sans casser la page). */
  aReconcilier: {
    erreur: string | null; resume: string; consigne: string; parFournisseur: readonly string[];
    lignes: ReadonlyArray<{ id: string; quand: string; fournisseur: string; modele: string | null; action: string; cause: string; reserve: string; reserveMicros: number; aFaire: string; cle: string | null }>;
  } | null;
  /** L'historique des réconciliations · `recente` · celle que le geste vient d'enregistrer. */
  reconciliees?: {
    erreur: string | null; resume: string; recente: string | null; deja: boolean;
    lignes: ReadonlyArray<{ id: string; action: string; appel: string; fournisseur: string; modele: string | null; reserve: string; facture: string; ecart: string; depasse: boolean; preuve: string; motif: string; auteur: string; le: string }>;
  } | null;
  /** Où part l'argent · dépense par poste sur la période du plafond. */
  parPoste?: ReadonlyArray<{ poste: string; montant: string; appels: string; part: number }> | null;
  /** Les derniers appels (`ai_spend`), le plus récent d'abord. */
  appels?: ReadonlyArray<{ id: string; quand: string; fournisseur: string; modele: string; poste: string; jetons: string; cout: string }> | null;
}

const COL_R = '.9fr 1.3fr .8fr 1.4fr auto';
const COL_A = '.9fr .8fr 1.2fr 1.2fr .9fr .7fr';

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
              {/* Le détail des appels vit plus bas sur cette page · ancre, aucune bascule d'interface. */}
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
        <section className="tile sec" id="a-reconcilier" data-reconciliation={p.aReconcilier.erreur ? 'erreur' : p.aReconcilier.lignes.length ? 'rempli' : 'vide'}>
          <div className="sech"><h2>À réconcilier avec la facture</h2><Pill c={p.aReconcilier.erreur ? 'w' : p.aReconcilier.lignes.length ? 'w' : 'g'}>{p.aReconcilier.erreur ? 'Lecture impossible' : p.aReconcilier.lignes.length ? `${p.aReconcilier.lignes.length} à rapprocher` : 'Rien à rapprocher'}</Pill></div>
          {p.aReconcilier.erreur ? (
            <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>Les lignes à réconcilier n’ont pas pu être lues · {p.aReconcilier.erreur}. Le plafond, lui, continue de les compter au maximum.</p>
          ) : (
            <>
              <p className="muted" style={{ margin: '0 0 6px', fontSize: '12.5px' }}>{p.aReconcilier.resume}</p>
              {p.aReconcilier.lignes.length > 0 && <p className="faint" style={{ margin: '0 0 10px', fontSize: '12px' }}><b>À faire · </b>{p.aReconcilier.consigne}{p.aReconcilier.parFournisseur.length ? ` · ${p.aReconcilier.parFournisseur.join(' · ')}` : ''}</p>}
              <div className="atable">
                {p.aReconcilier.lignes.length > 0 && <div className="atr ath" style={{ gridTemplateColumns: COL_R }}><span>Quand</span><span>Poste</span><span>Réservé</span><span>Cause · à faire</span><span /></div>}
                {p.aReconcilier.lignes.map((l) => (
                  <div className="atr" key={l.id} data-ligne-reconcilier={l.id} style={{ gridTemplateColumns: COL_R }}>
                    <span className="faint">{l.quand}</span>
                    <span><b>{l.action}</b><small className="faint" style={{ display: 'block' }}>{l.fournisseur}{l.modele ? ` · ${l.modele}` : ''}</small></span>
                    <span>{l.reserve}</span>
                    <span className="faint" style={{ whiteSpace: 'normal' }}>{l.cause} · {l.aFaire}</span>
                    <span>{l.cle ? <ReconcilierLigne ligneId={l.id} action={l.action} reserve={l.reserve} reserveMicros={l.reserveMicros} cle={l.cle} /> : null}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {p.reconciliees && (
        <section className="tile sec" id="reconciliees" data-reconciliees={p.reconciliees.erreur ? 'erreur' : p.reconciliees.lignes.length ? 'rempli' : 'vide'} style={{ scrollMarginTop: 80 }}>
          <div className="sech"><h2>Réconciliées</h2><Pill>{p.reconciliees.erreur ? 'Lecture impossible' : `${p.reconciliees.lignes.length} au total`}</Pill></div>
          <ReconciliationRecente r={p.reconciliees} />
          {p.reconciliees.erreur
            ? <p role="alert" className="muted" style={{ margin: 0, fontSize: '12.5px' }}>L’historique n’a pas pu être lu · {p.reconciliees.erreur}.</p>
            : <p className="muted" style={{ margin: '0 0 8px', fontSize: '12.5px' }}>{p.reconciliees.resume}</p>}
          <div className="atable">
            {p.reconciliees.lignes.map((l) => (
              <div className="atr" key={l.id} data-ligne-reconciliee={l.id} style={{ gridTemplateColumns: '1.2fr 1fr 1.6fr' }}>
                <span><b>{l.action}</b>{l.id === p.reconciliees!.recente && <> <Pill c="g">À l’instant</Pill></>}<small className="faint" style={{ display: 'block' }}>{l.appel} · {l.fournisseur}{l.modele ? ` · ${l.modele}` : ''}</small></span>
                <span><b>{l.reserve} → {l.facture}</b><small className="faint" style={{ display: 'block' }}>{l.depasse ? 'Dépassement · ' : ''}{l.ecart}</small></span>
                <span className="faint" style={{ whiteSpace: 'normal' }}>Preuve {l.preuve} · {l.motif} · {l.auteur}, le {l.le}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      {p.parPoste && (
        <section className="tile sec">
          <div className="sech"><h2>Où part l’argent</h2><span className="faint" style={{ fontSize: '12.5px' }}>Par poste · 30 j glissants</span></div>
          <div className="atable">
            {p.parPoste.map((a) => (
              <div className="atr" key={a.poste} style={{ gridTemplateColumns: '1.4fr 2fr .8fr .7fr' }}><span><b>{a.poste}</b></span><span><Barre part={a.part} /></span><span><b>{a.montant}</b></span><span className="faint">{a.appels}</span></div>
            ))}
            {p.parPoste.length === 0 && <Vide>Aucune dépense enregistrée sur la période.</Vide>}
          </div>
        </section>
      )}
      {p.appels && (
        <section className="tile sec" id="appels" style={{ scrollMarginTop: 80 }}>
          <div className="sech"><h2>Derniers appels</h2><span className="faint" style={{ fontSize: '12.5px' }}>{p.appels.length ? `Les ${p.appels.length} plus récents` : 'Aucun'}</span></div>
          <div className="atable">
            {p.appels.length > 0 && <div className="atr ath" style={{ gridTemplateColumns: COL_A }}><span>Quand</span><span>Fournisseur</span><span>Modèle</span><span>Poste</span><span>Jetons</span><span>Coût</span></div>}
            {p.appels.map((a) => (
              <div className="atr" key={a.id} style={{ gridTemplateColumns: COL_A }}><span className="faint">{a.quand}</span><span>{a.fournisseur}</span><span className="faint">{a.modele}</span><span>{a.poste}</span><span className="faint">{a.jetons}</span><span><b>{a.cout}</b></span></div>
            ))}
            {p.appels.length === 0 && <Vide>Rien pour l’instant.</Vide>}
          </div>
        </section>
      )}
    </Vue>
  );
}

/** Le retour du geste · la redirection du serveur nomme la réconciliation enregistrée (`?reconciliee=`). */
function ReconciliationRecente({ r }: { r: NonNullable<PropsCouts['reconciliees']> }) {
  const l = r.recente ? r.lignes.find((x) => x.id === r.recente) ?? null : null;
  return (
    <p role="status" data-reconciliation-recente={l ? l.id : undefined} style={{ margin: l ? '0 0 8px' : 0, fontSize: '13px' }}>
      {l ? `${r.deja ? 'Déjà enregistrée sous ce formulaire, aucun doublon' : 'Réconciliation enregistrée'} · ${l.action}, réservé ${l.reserve} → facturé ${l.facture}.` : ''}
    </p>
  );
}
