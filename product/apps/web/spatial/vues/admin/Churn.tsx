import { Vue } from '../../communs';
import { Kpis, TeteAdmin, Vide, type BandeauAdmin, type KpiAdmin } from './base';
import { ComptesARisqueListe, type LigneRisque } from './client';

/**
 * « Churn & rétention » · `docs/spatial/reference/a-churn.html`. PRÉSENTATIONNEL.
 *
 * Réel · le taux de résiliation (événements Stripe), les résiliations par mois,
 * les comptes à risque (signaux factuels, noyau `signauxRisque`). Sans source ·
 * les raisons de départ (aucun questionnaire de sortie), l'ancienneté au départ,
 * le parcours de résiliation et les actions de rétention automatiques · aucune
 * n'existe dans l'outil, l'écran le dit.
 */
export interface PropsChurn {
  bandeau: BandeauAdmin;
  kpis: readonly KpiAdmin[];
  mois: ReadonlyArray<{ libelle: string; hauteur: number; titre: string; enCours: boolean }>;
  legendeMois: string;
  /** Ligne d'objectif (pourcents de la hauteur) · absente tant qu'aucun objectif n'est fixé. */
  objectif: number | null;
  filtres: ReadonlyArray<{ cle: string; libelle: string }>;
  comptes: readonly LigneRisque[];
}

export function Churn(p: PropsChurn) {
  return (
    <Vue>
      <TeteAdmin titre="Churn & rétention" sous="churn" actif="/admin/churn" bandeau={p.bandeau} />
      <Kpis items={p.kpis} />
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Résiliations · 12 mois</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>{p.legendeMois}</span></div>
          <div className="cchart">
            <div className="chero-m" style={{ height: 180 }}>
              {p.mois.map((m, i) => <i key={i} className={m.enCours ? 'on' : ''} title={m.titre} style={{ height: `${m.hauteur}%` }} />)}
              {p.objectif != null && <span className="cgoal" style={{ bottom: `${p.objectif}%` }} />}
            </div>
            <div className="cmo">{p.mois.map((m, i) => <span key={i}>{m.libelle}</span>)}</div>
          </div>
        </section>
        <section className="tile">
          <div className="sech"><h2>Pourquoi ils partent</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>Aucun questionnaire de sortie</span></div>
          <div className="creas" data-vide="raisons"><Vide>L’outil ne demande pas la raison d’une résiliation · elle se fait dans le portail Stripe, sans questionnaire. Rien n’est donc affiché ici.</Vide></div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Comptes à risque</h2><span className="faint" style={{ fontSize: '12.5px' }}>Signaux lus à l’affichage : paiement, activité, crédits, onboarding, tickets</span></div>
        <ComptesARisqueListe filtres={p.filtres} comptes={p.comptes} />
      </section>
      <div className="agrid2 sec">
        <section className="tile">
          <div className="sech"><h2>Quand ils partent</h2><span className="faint" style={{ marginLeft: 'auto', fontSize: '12.5px' }}>Part des résiliations selon l’ancienneté</span></div>
          <div className="creas" data-vide="anciennete"><Vide>La date de résiliation n’est pas rattachée au compte · l’ancienneté au départ ne se calcule pas.</Vide></div>
          <p className="faint" style={{ fontSize: '12px', margin: '12px 0 0' }}>À mesurer dès que la résiliation sera enregistrée avec son compte.</p>
        </section>
        <section className="tile">
          <div className="sech"><h2>Parcours de résiliation</h2></div>
          <div className="funnel" data-vide="parcours" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}><Vide>Aucune étape de résiliation n’est suivie dans l’outil (pas d’offre de rétention avant le départ).</Vide></div>
        </section>
      </div>
      <section className="tile sec">
        <div className="sech"><h2>Actions de rétention automatiques</h2><span className="faint" style={{ fontSize: '12.5px' }}>Aucune action branchée</span></div>
        <div className="atable" data-vide="actions"><Vide>Relances, pauses, remises de départ · aucune de ces actions n’existe encore. Elles demandent une décision d’offre et de prix.</Vide></div>
      </section>
    </Vue>
  );
}
